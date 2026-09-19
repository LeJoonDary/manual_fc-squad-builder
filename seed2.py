"""Seed card child tables from FC27 without modifying seed.py or parent cards.

python seed2.py --batch-size 50
python seed2.py --dry-run

Optional master CSVs: positions.csv (id,name), roles.csv (id,position,role_name).
Roles in the player CSV may use `ST: Advanced Forward++` (comma separated).
Missing role data is skipped; roles are never inferred from positions.
Without natural-key UNIQUE constraints, writes reconcile existing primary IDs
before each retry. Run only one writer against these tables in that mode.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
import logging
import os
from pathlib import Path
import random
import re
import time

# Reuse the proven read-only helpers and HTTP/1.1 transport; never call seed.main.
from seed import ROOT, MISSING, integer, rating_version, read_csv, retryable, stable_client

LOG = logging.getLogger('seed2')
STAT_MAP = {
    'pac': 'pace', 'sho': 'shooting', 'pas': 'passing', 'dri': 'dribbling',
    'def': 'defending', 'phy': 'physicality',
    'acceleration': 'movement_acceleration', 'sprint_speed': 'movement_sprint_speed',
    'positioning': 'mentality_positioning', 'finishing': 'attacking_finishing',
    'shot_power': 'power_shot_power', 'long_shots': 'power_long_shots',
    'volleys': 'attacking_volleys', 'penalties': 'mentality_penalties',
    'vision': 'mentality_vision', 'crossing': 'attacking_crossing',
    'fk_accuracy': 'skill_fk_accuracy', 'short_passing': 'attacking_short_passing',
    'long_passing': 'skill_long_passing', 'curve': 'skill_curve',
    'agility': 'movement_agility', 'balance': 'movement_balance',
    'reactions': 'movement_reactions', 'ball_control': 'skill_ball_control',
    'dribbling_sub': 'skill_dribbling', 'composure': 'mentality_composure',
    'interceptions': 'mentality_interceptions', 'heading_accuracy': 'attacking_heading_accuracy',
    'def_awareness': 'defending_awareness', 'standing_tackle': 'defending_standing_tackle',
    'sliding_tackle': 'defending_sliding_tackle', 'jumping': 'power_jumping',
    'stamina': 'power_stamina', 'strength': 'power_strength', 'aggression': 'mentality_aggression',
    'gk_diving': 'goalkeeping_diving', 'gk_handling': 'goalkeeping_handling',
    'gk_kicking': 'goalkeeping_kicking', 'gk_positioning': 'goalkeeping_positioning',
    'gk_reflexes': 'goalkeeping_reflexes',
}
KEYS = {'player_stats': ('card_id',), 'card_positions': ('card_id', 'position_id'),
        'card_playstyles': ('card_id', 'playstyle_id'), 'card_roles': ('card_id', 'role_id')}


def retry(operation, attempts=6, sleep=time.sleep):
    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except Exception as error:
            if attempt == attempts or not retryable(error):
                raise
            delay = min(2 ** attempt, 32) + random.uniform(0, 1)
            LOG.warning('Retry %s/%s after %s in %.1fs', attempt, attempts - 1,
                        type(error).__name__, delay)
            sleep(delay)


def fetch_all(client, table, columns='*', attempts=6, card_ids=None):
    result = []
    while True:
        offset = len(result)
        def page():
            query = client.table(table).select(columns).order('id')
            if card_ids is not None:
                query = query.in_('card_id', card_ids)
            return query.range(offset, offset + 499).execute().data
        rows = retry(page, attempts)
        if not rows:
            return result
        result.extend(rows)


def row_key(row, fields):
    return tuple(integer(row[field]) for field in fields)


def unique_index(rows, fields):
    result = {}
    for row in rows:
        key = row_key(row, fields)
        if key in result:
            raise ValueError(f'Duplicate key {fields}: {key}')
        result[key] = row
    return result


def normalized(name):
    return ''.join(name.casefold().split())


def style_name(name):
    value = normalized(name)
    return 'crossclaimer' if value == 'crosscatcher' else value


def tokens(value, pattern=r'[,;|]+'):
    if not value or value.strip().lower() in MISSING:
        return []
    return [part.strip() for part in re.split(pattern, value) if part.strip()]


def master_rows(client, table, path, attempts):
    saved = fetch_all(client, table, attempts=attempts)
    if path and path.exists():
        rows = read_csv(path)
        by_id = {integer(row['id']): row for row in saved}
        for row in rows:
            actual = by_id.get(integer(row['id']))
            if not actual or any(str(actual.get(k)) != str(v) for k, v in row.items() if k != 'id'):
                raise ValueError(f'{table} CSV does not match DB ID {row["id"]}')
        return rows
    if path and path != ROOT / f'{table}.csv':
        raise FileNotFoundError(path)
    return saved


def prepare(rows, cards, positions, roles):
    lookup = {}
    for card in cards:
        key = (integer(card['player_id']), card['version'])
        if key in lookup:
            raise ValueError(f'Ambiguous card mapping: {key}')
        lookup[key] = integer(card['id'])
    position_ids = {}
    for row in positions:
        name = row['name'].strip().upper()
        if name in position_ids:
            raise ValueError(f'Duplicate position: {name}')
        position_ids[name] = integer(row['id'])
    tables = {table: [] for table in KEYS}
    styles = {}
    counts = Counter()
    seen = set()
    for source in rows:
        player_id = integer(source['player_id'])
        if not player_id or player_id <= 0 or player_id in seen:
            raise ValueError(f'Invalid or duplicate player_id: {player_id}')
        seen.add(player_id)
        version = rating_version(source['overall_rating'])
        card_id = lookup.get((player_id, version))
        if card_id is None:
            raise ValueError(f'No card for player_id={player_id}, version={version}')
        counts[version] += 1
        stats = {'card_id': card_id}
        for destination, origin in STAT_MAP.items():
            if origin not in source:
                raise ValueError(f'Missing stat column: {origin}')
            value = integer(source[origin])
            if value is not None and not 0 <= value <= 99:
                raise ValueError(f'Invalid stat {origin}, player_id={player_id}')
            if value is None and destination in ('pac', 'sho', 'pas', 'dri', 'def', 'phy'):
                raise ValueError(f'Missing required stat {origin}, player_id={player_id}')
            stats[destination] = value
        tables['player_stats'].append(stats)
        primary = tokens(source.get('position'), r'[,;|/\s]+')
        if len(primary) != 1:
            raise ValueError(f'Expected one primary position: player_id={player_id}')
        names = list(dict.fromkeys(name.upper() for name in
                     primary + tokens(source.get('alternate_positions'), r'[,;|/\s]+')))
        for index, name in enumerate(names):
            if name not in position_ids:
                raise ValueError(f'Unknown position: {name}')
            tables['card_positions'].append({'card_id': card_id, 'position_id': position_ids[name],
                                             'is_primary': index == 0})
        card_styles = {}
        for token in tokens(source.get('playstyles')):
            is_plus = token.endswith('+')
            name = token.rstrip('+').strip()
            if not name:
                raise ValueError(f'Empty playstyle: player_id={player_id}')
            canonical = style_name(name)
            styles.setdefault(canonical, 'Cross Claimer' if canonical == 'crossclaimer' else name)
            card_styles[canonical] = card_styles.get(canonical, False) or is_plus
        tables['card_playstyles'].extend({'card_id': card_id, 'style_name': name, 'is_plus': plus}
                                        for name, plus in card_styles.items())
        card_roles = {}
        for token in tokens(source.get('roles') or source.get('role')):
            level = len(token) - len(token.rstrip('+'))
            if level > 2:
                raise ValueError(f'Invalid role level: {token}')
            label = token.rstrip('+').strip()
            position, label = label.split(':', 1) if ':' in label else (None, label)
            candidates = [r for r in roles if normalized(r['role_name']) == normalized(label)
                          and r['position'].upper() in names
                          and (position is None or r['position'].upper() == position.strip().upper())]
            if len(candidates) != 1:
                raise ValueError(f'Unknown or ambiguous role: {token}, player_id={player_id}')
            role_id = integer(candidates[0]['id'])
            card_roles[role_id] = max(level, card_roles.get(role_id, 0))
        tables['card_roles'].extend({'card_id': card_id, 'role_id': role_id, 'role_level': level}
                                   for role_id, level in card_roles.items())
    return tables, styles, dict(counts)


def ensure_styles(client, desired, attempts, batch_size, dry_run=False):
    def index():
        result = {}
        for row in fetch_all(client, 'playstyles', attempts=attempts):
            name = style_name(row['name'])
            if name in result:
                raise ValueError(f'Duplicate playstyle name: {name}')
            result[name] = integer(row['id'])
        return result
    existing = index()
    missing = [name for name in desired if name not in existing]
    LOG.info('Playstyle masters: %s existing, %s missing', len(existing), len(missing))
    if dry_run:
        existing.update({name: -(i + 1) for i, name in enumerate(missing)})
        return existing
    for start in range(0, len(missing), batch_size):
        batch = missing[start:start + batch_size]
        def create_missing():
            current = index()  # Reconcile a possibly committed, timed-out insert.
            payload = [{'name': desired[name]} for name in batch if name not in current]
            if payload:
                client.table('playstyles').insert(payload, returning='minimal').execute()
        retry(create_missing, attempts)
    return index() if missing else existing


def write_batch(client, table, batch, attempts, modes):
    def write():
        if modes.get(table) != 'primary_id':
            try:
                client.table(table).upsert(batch, on_conflict=','.join(KEYS[table]),
                                           returning='minimal').execute()
                modes[table] = 'natural_key'
                return
            except Exception as error:
                if str(getattr(error, 'code', '')) != '42P10':
                    raise
                modes[table] = 'primary_id'
                LOG.warning('%s has no natural-key UNIQUE constraint; reconciling primary IDs. Single writer only.', table)
        # This read happens again after every transport error, preventing duplicate
        # INSERTs when the previous request committed but its response was lost.
        saved = unique_index(fetch_all(client, table, attempts=attempts,
                                       card_ids=list({row['card_id'] for row in batch})), KEYS[table])
        changes, new = [], []
        for row in batch:
            old = saved.get(row_key(row, KEYS[table]))
            if old is None:
                new.append(row)
            elif any(old.get(k) != value for k, value in row.items()):
                changes.append(dict(row, id=old['id']))
        if changes:
            client.table(table).upsert(changes, on_conflict='id', returning='minimal').execute()
        if new:
            client.table(table).insert(new, returning='minimal').execute()
    retry(write, attempts)


def upload(client, tables, batch_size, attempts, report):
    modes = report['write_modes']
    for table, rows in tables.items():
        summary = report['tables'][table] = {'prepared': len(rows), 'uploaded': 0, 'verified': 0}
        if not rows:
            LOG.info('%s: skipped (no source data)', table)
            continue
        existing = fetch_all(client, table, attempts=attempts)
        unique_index(existing, KEYS[table])
        if table == 'card_positions':
            primary = {r['card_id']: r['position_id'] for r in rows if r['is_primary']}
            demote = [{k: r[k] for k in ('card_id', 'position_id')} | {'is_primary': False}
                      for r in existing if r.get('is_primary') and r['card_id'] in primary
                      and r['position_id'] != primary[r['card_id']]]
            for start in range(0, len(demote), batch_size):
                write_batch(client, table, demote[start:start + batch_size], attempts, modes)
        for start in range(0, len(rows), batch_size):
            batch = rows[start:start + batch_size]
            write_batch(client, table, batch, attempts, modes)
            summary['uploaded'] += len(batch)
            if start == 0 or (start // batch_size + 1) % 25 == 0 or start + len(batch) == len(rows):
                LOG.info('%s: %s/%s uploaded', table, summary['uploaded'], len(rows))
        saved = unique_index(fetch_all(client, table, attempts=attempts), KEYS[table])
        for row in rows:
            actual = saved.get(row_key(row, KEYS[table]))
            if not actual or any(actual.get(k) != value for k, value in row.items()):
                raise ValueError(f'{table}: verification failed for {row_key(row, KEYS[table])}')
        if table == 'card_positions':
            counts = Counter(r['card_id'] for r in saved.values() if r.get('is_primary'))
            if any(counts[card_id] != 1 for card_id in primary):
                raise ValueError('Primary position count must equal one per card')
        summary.update(verified=len(rows), database_rows=len(saved))
        LOG.info('%s: all %s source records verified; no duplicate keys', table, len(rows))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fc27', type=Path)
    parser.add_argument('--positions', type=Path, default=ROOT / 'positions.csv')
    parser.add_argument('--roles', type=Path, default=ROOT / 'roles.csv')
    parser.add_argument('--batch-size', type=int, default=50)
    parser.add_argument('--attempts', type=int, default=6)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--report', type=Path, default=ROOT / 'seed2-report.json')
    args = parser.parse_args()
    if not 50 <= args.batch_size <= 100 or not 1 <= args.attempts <= 6:
        parser.error('batch-size must be 50..100 and attempts must be 1..6')
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    logging.getLogger('httpx').setLevel(logging.WARNING)
    report = {'status': 'started', 'tables': {}, 'write_modes': {}, 'failures': []}
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / '.env.local')
        load_dotenv(ROOT / '.env')
        source = args.fc27 or next((ROOT / name for name in ('fc27_dataset.csv', 'players.csv')
                                   if (ROOT / name).exists()), None)
        if source is None:
            raise ValueError('No FC27 CSV; specify --fc27')
        url, key = os.getenv('VITE_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        if not url or not key:
            raise ValueError('Missing Supabase URL or service role key')
        rows = read_csv(source)
        # Check report writability before any database mutation.
        if not args.dry_run:
            args.report.write_text(json.dumps(report), encoding='utf-8')
        with stable_client(url, key) as client:
            cards = fetch_all(client, 'card_versions', 'id,player_id,version', args.attempts)
            LOG.info('Fetched %s cards for exact player/version mapping', len(cards))
            positions = master_rows(client, 'positions', args.positions, args.attempts)
            roles = master_rows(client, 'roles', args.roles, args.attempts)
            tables, desired_styles, versions = prepare(rows, cards, positions, roles)
            report.update(source=str(source), versions=versions, batch_size=args.batch_size)
            for table, values in tables.items():
                LOG.info('Prepared %s: %s rows', table, len(values))
                if values and table != 'card_playstyles':
                    unique_index(values, KEYS[table])
            styles = ensure_styles(client, desired_styles, args.attempts, args.batch_size, args.dry_run)
            tables['card_playstyles'] = [{'card_id': row['card_id'],
                'playstyle_id': styles[row['style_name']], 'is_plus': row['is_plus']}
                for row in tables['card_playstyles']]
            if args.dry_run:
                LOG.info('Dry run passed; database unchanged')
                return 0
            upload(client, tables, args.batch_size, args.attempts, report)
        report['status'] = 'complete'
        LOG.info('All requested child records uploaded and verified')
        return 0
    except Exception as error:
        report['status'] = 'failed'
        failure = {'type': type(error).__name__, 'code': str(getattr(error, 'code', ''))}
        if isinstance(error, ValueError):
            failure['detail'] = str(error)
        report['failures'].append(failure)
        LOG.error('Seeding stopped: %s', failure)
        return 1
    finally:
        if not args.dry_run:
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    raise SystemExit(main())
