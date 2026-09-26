"""Normalize special_cards.json and atomically replace its two trait tables.

Requires: pip install "psycopg[binary]" python-dotenv
Preview: python sync_special_traits.py
Apply:   python sync_special_traits.py --apply
Uses DATABASE_URL, or the linked Supabase pooler with DATABASE_URL's password.
No credentials are written to reports. Empty categories preserve existing rows.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
POSITIONS = {0: 'GK', 3: 'RB', 5: 'CB', 7: 'LB', 10: 'CDM',
             12: 'RM', 14: 'CM', 16: 'LM', 18: 'CAM', 23: 'RW', 25: 'ST', 27: 'LW'}
TABLES = {'card_playstyles': ('playstyle_id', 'is_plus'),
          'card_roles': ('role_id', 'role_level')}


def norm(value):
    return re.sub(r'[^a-z0-9]', '', value.lower())


def unique_index(rows, key):
    result = {}
    for row in rows:
        k = key(row)
        if k in result:
            raise ValueError(f'Duplicate mapping key: {k}')
        result[k] = row['id']
    return result


def normalize(cards, versions, styles, roles, mapping):
    if len(cards) != 353:
        raise ValueError(f'Expected 353 source cards, got {len(cards)}')
    by_api = unique_index(versions, lambda r: str(r['api_id']))
    ps_ids = unique_index(styles, lambda r: norm(r['name']))
    role_ids = unique_index(roles, lambda r: (r['position'], norm(r['role_name'])))
    result = {table: [] for table in TABLES}
    targets, preserved = [], []
    seen = set()
    for card in cards:
        api = str(card['eaId'])
        if api in seen or api not in by_api:
            raise ValueError(f'Duplicate or missing special card: eaId={api}')
        seen.add(api)
        cid = by_api[api]
        positions = {POSITIONS[p] for p in [card['position'], *card['alternativePositionIds']]}
        targets.append({'card_id': cid, 'eaId': card['eaId'], 'name': card['commonName'],
                        'positions': sorted(positions)})
        new_ps, new_roles = {}, {}
        for field, plus in [('playstyles', False), ('playstylesPlus', True)]:
            if not isinstance(card[field], list):
                raise ValueError(f'{api}: invalid {field}')
            for raw in card[field]:
                pid = ps_ids[norm(mapping['playstyles'][str(raw)])]
                new_ps[pid] = new_ps.get(pid, False) or plus
        for field, level in [('rolesPlus', 1), ('rolesPlusPlus', 2)]:
            if not isinstance(card[field], list):
                raise ValueError(f'{api}: invalid {field}')
            for raw in card[field]:
                # Accept only the two documented encodings, never arbitrary modulo.
                base = raw - 100 if 101 <= raw <= 149 else raw
                role = mapping['roles'][str(base)]
                if role['position'] not in positions:
                    raise ValueError(f'{api}: role {raw} outside main/alternative positions {positions}')
                rid = role_ids[(role['position'], norm(role['name']))]
                new_roles[rid] = max(new_roles.get(rid, 0), level)
        for table, values in [('card_playstyles', new_ps), ('card_roles', new_roles)]:
            fk, grade = TABLES[table]
            if not values:
                preserved.append({'card_id': cid, 'table': table})
            result[table].extend({'card_id': cid, fk: key, grade: val}
                                 for key, val in sorted(values.items()))
    return result, targets, preserved


def connect():
    load_dotenv(ROOT / '.env.local')
    load_dotenv(ROOT / '.env')
    direct = os.environ['DATABASE_URL']
    pooler_file = ROOT / 'supabase/.temp/pooler-url'
    if pooler_file.exists():
        pooler = urlsplit(pooler_file.read_text().strip())
        return psycopg.connect(host=pooler.hostname, port=pooler.port,
            user=unquote(pooler.username), password=unquote(urlsplit(direct).password),
            dbname=pooler.path.lstrip('/'), sslmode='require', connect_timeout=20,
            autocommit=True, row_factory=dict_row)
    return psycopg.connect(direct, sslmode='require', connect_timeout=20,
                           autocommit=True, row_factory=dict_row)


def read_traits(conn, ids):
    return {table: conn.execute(
        f'SELECT card_id, {fk}, {grade} FROM public.{table} WHERE card_id = ANY(%s)',
        (ids,)).fetchall() for table, (fk, grade) in TABLES.items()}


def fingerprint(rows):
    return Counter(tuple(sorted(row.items())) for row in rows)


def verify(actual, expected):
    for table in TABLES:
        if fingerprint(actual[table]) != fingerprint(expected[table]):
            raise ValueError(f'Full row verification failed: {table}')


def print_examples(conn, targets):
    output = []
    for card in targets:
        if card['name'] not in {'Pelé', 'Ronaldo', 'Mia Hamm'}:
            continue
        cid = card['card_id']
        ps = conn.execute('''SELECT cp.playstyle_id, p.name, cp.is_plus
            FROM public.card_playstyles cp JOIN public.playstyles p ON p.id=cp.playstyle_id
            WHERE cp.card_id=%s ORDER BY cp.is_plus DESC,p.name''', (cid,)).fetchall()
        roles = conn.execute('''SELECT cr.role_id,r.position,r.role_name,cr.role_level
            FROM public.card_roles cr JOIN public.roles r ON r.id=cr.role_id
            WHERE cr.card_id=%s ORDER BY r.position,cr.role_level DESC,r.role_name''', (cid,)).fetchall()
        record = {**card, 'playstyles': ps, 'roles': roles}
        output.append(record)
        print(json.dumps(record, ensure_ascii=False, indent=2))
    if {r['name'] for r in output} != {'Pelé', 'Ronaldo', 'Mia Hamm'}:
        raise ValueError('Verification players missing')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    source = (ROOT / 'special_cards.json').read_bytes()
    cards = json.loads(source)
    mapping = json.loads((ROOT / 'data/special-trait-mapping.json').read_text(encoding='utf-8'))
    with connect() as conn:
        # The complete replacement, backup snapshot and validation share one transaction.
        with conn.transaction():
            conn.execute("SET LOCAL lock_timeout = '15s'")
            conn.execute("SET LOCAL statement_timeout = '120s'")
            if args.apply:
                conn.execute('LOCK TABLE public.card_versions, public.playstyles, public.roles IN SHARE MODE')
                conn.execute('LOCK TABLE public.card_playstyles, public.card_roles IN SHARE ROW EXCLUSIVE MODE')
            styles = conn.execute('SELECT id,name FROM public.playstyles').fetchall()
            roles = conn.execute('SELECT id,position,role_name FROM public.roles').fetchall()
            versions = conn.execute("SELECT id,api_id FROM public.card_versions WHERE starts_with(version, 'special_')").fetchall()
            plan, targets, preserved = normalize(cards, versions, styles, roles, mapping)
            ids = [t['card_id'] for t in targets]
            before = read_traits(conn, ids)
            expected = {}
            for table in TABLES:
                replacing = {r['card_id'] for r in plan[table]}
                expected[table] = plan[table] + [r for r in before[table] if r['card_id'] not in replacing]
            print(f'Validated {len(targets)} cards; playstyles={len(plan["card_playstyles"])}; roles={len(plan["card_roles"])}; preserved empty categories={len(preserved)}')
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            folder = ROOT / 'sync_reports'
            folder.mkdir(exist_ok=True)
            report = {'source_sha256': hashlib.sha256(source).hexdigest(), 'mapping': mapping,
                      'targets': targets, 'preserved': preserved, 'plan': plan, 'before': before}
            report_path = folder / f'{stamp}-{"apply" if args.apply else "preview"}.json'
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
            print(f'Backup and plan: {report_path}')
            if not args.apply:
                print('Preview complete; no DB writes. Use --apply to commit.')
                return
            for table, (fk, grade) in TABLES.items():
                rows = plan[table]
                replacing = sorted({r['card_id'] for r in rows})
                if not replacing:
                    continue
                conn.execute(f'DELETE FROM public.{table} WHERE card_id = ANY(%s)', (replacing,))
                with conn.cursor() as cur:
                    cur.executemany(f'INSERT INTO public.{table} (card_id,{fk},{grade}) VALUES (%s,%s,%s)',
                                    [(r['card_id'], r[fk], r[grade]) for r in rows])
            verify(read_traits(conn, ids), expected)
        # Read again after COMMIT; never report success based only on insert responses.
        verify(read_traits(conn, ids), expected)
        examples = print_examples(conn, targets)
        report.update({'committed': True, 'verified_cards': len(targets), 'examples': examples})
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
        print(f'COMMITTED AND VERIFIED: {len(targets)} cards, {len(plan["card_playstyles"])} playstyles, {len(plan["card_roles"])} roles.')


if __name__ == '__main__':
    main()
