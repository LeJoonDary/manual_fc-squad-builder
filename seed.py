"""Patch only card_versions.accele_type using DB height and FC27 CSV stats.

python seed.py --dry-run
python seed.py --fc27 fc27_dataset.csv --batch-size 50

All other card columns and reference/player tables are left unchanged.
Dry runs read the database and save a snapshot without writing to the database.
"""
from __future__ import annotations

import argparse
import csv
from contextlib import contextmanager
import json
import logging
import math
import os
from pathlib import Path
import random
import re
import time
import unicodedata
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
TABLES = ('card_versions',)
INTEGER_FIELDS = {'id', 'player_id', 'nation_id', 'league_id', 'club_id', 'overall',
                  'price', 'sm', 'wf', 'height', 'weight', 'age'}
MISSING = {'', 'nan', 'none', 'null', 'n/a', 'na'}
LOG = logging.getLogger('seed')

# Explicit display labels take priority over the three-letter fallback.
# Keep dataset aliases here (including men's/women's team name variants).
LEAGUE_ABBR_MAP = {
    'Premier League': 'EPL',
    'Barclays WSL': 'WSL',
    'LALIGA EA SPORTS': 'LALIGA',
    'Serie A Enilive': 'SERI',
    'Bundesliga': 'BUN',
    "Ligue 1 McDonald's": 'LIG1',
    'MLS': 'MLS',
    'NWSL': 'NWSL',
    'Liga F Moeve': 'LIGF',
    'Liga Portugal': 'POR',
    'ROSHN Saudi League': 'SPL',
    'Trendyol Süper Lig': 'TSL',
    'Eredivisie': 'ERE',
    'EFL Championship': 'EFL',
    'EFL League One': 'EFL1',
    'EFL League Two': 'EFL2',
    'Bundesliga 2': 'BUN2',
    'Ligue 2 BKT': 'LIG2',
    'Serie BKT': 'SERB',
    'LALIGA HYPERMOTION': 'LAL2',
    'Scottish Premiership': 'SPFL',
    'Liga BBVA MX': 'LMX',
    'K League 1': 'KL1',
    'CSL': 'CSL',
    'ISL': 'ISL',
    'Isuzu UTE A League': 'ALM',
}
CLUB_ABBR_MAP = {
    'Manchester United': 'MUN',
    'Manchester Utd': 'MUN',
    'Man Utd': 'MUN',
    'Real Madrid': 'RMA',
    'Manchester City': 'MCI',
    'FC Bayern München': 'FCB',
    'FC Barcelona': 'BAR',
    'Paris SG': 'PSG',
    'Paris Saint-Germain': 'PSG',
    'Arsenal': 'ARS',
    'Liverpool': 'LIV',
    'Chelsea': 'CHE',
    'Spurs': 'TOT',
    'Tottenham Hotspur': 'TOT',
    'Newcastle Utd': 'NEW',
    'Aston Villa': 'AVL',
    'Everton': 'EVE',
    'West Ham': 'WHU',
    'Brighton': 'BHA',
    "Nott'm Forest": 'NFO',
    'Crystal Palace': 'CRY',
    'Brentford': 'BRE',
    'Atlético de Madrid': 'ATM',
    'Athletic Club': 'ATH',
    'Real Sociedad': 'RSO',
    'Real Betis': 'BET',
    'Villarreal CF': 'VIL',
    'Sevilla FC': 'SEV',
    'Borussia Dortmund': 'BVB',
    'Leverkusen': 'B04',
    'RB Leipzig': 'RBL',
    'Frankfurt': 'SGE',
    'VfB Stuttgart': 'VFB',
    'VfL Wolfsburg': 'WOB',
    'Juventus': 'JUV',
    'SSC Napoli': 'NAP',
    'AS Roma': 'ROM',
    'Roma': 'ROM',
    'AC Milan': 'MIL',
    'Inter': 'INT',
    'Fiorentina': 'FIO',
    'Ajax': 'AJA',
    'FC Porto': 'FCP',
    'SL Benfica': 'BEN',
    'Sporting CP': 'SCP',
    'OL': 'OL',
    'OL Lyonnes': 'OL',
    'Marseille': 'OM',
    'Inter Miami CF': 'MIA',
    'Al Nassr': 'NAS',
    'Al Hilal': 'HIL',
    'Galatasaray': 'GAL',
    'Fenerbahçe': 'FEN',
    'Beşiktaş': 'BJK',
}


def number(value):
    if value is None or str(value).strip().lower() in MISSING:
        return None
    result = float(value)
    return result if math.isfinite(result) else None


def integer(value):
    result = number(value)
    if result is None:
        return None
    if not result.is_integer():
        raise ValueError(f'Expected integer, got {value!r}')
    return int(result)


def body_type(height, weight):
    if height is None or weight is None:
        return None
    size = 'Short' if height < 174 else 'Medium' if height <= 184 else 'Tall'
    build = 'Lean' if weight <= height - 113 else 'Stocky' if weight >= height - 95 else 'Average'
    return f'{build} {size}'


def accele_type(height, strength, agility, acceleration):
    try:
        height, strength, agility, acceleration = map(
            number, (height, strength, agility, acceleration))
    except (TypeError, ValueError, OverflowError):
        return None
    if any(v is None for v in (height, strength, agility, acceleration)):
        return None
    strength_gap = strength - agility
    if -strength_gap >= 20 and agility >= 80 and acceleration >= 80 and height <= 175:
        return 'Explosive'
    if -strength_gap >= 12 and agility >= 70 and acceleration >= 80 and height <= 182:
        return 'Mostly Explosive'
    if -strength_gap >= 4 and agility >= 65 and acceleration >= 70 and height <= 182:
        return 'Controlled Explosive'
    if strength_gap >= 20 and strength >= 80 and acceleration >= 55 and height >= 188:
        return 'Lengthy'
    if strength_gap >= 12 and strength >= 75 and acceleration >= 55 and height >= 183:
        return 'Mostly Lengthy'
    if strength_gap >= 4 and strength >= 65 and acceleration >= 55 and height >= 181:
        return 'Controlled Lengthy'
    return 'Controlled'


def read_csv(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError(f'{path}: missing or duplicate headers')
        rows = list(reader)
    if not rows or any(None in row or None in row.values() for row in rows):
        raise ValueError(f'{path}: empty CSV or malformed rows')
    return rows


def index_rows(rows, key, label):
    result = {}
    for row in rows:
        ident = integer(row.get(key))
        if ident is None or ident <= 0:
            raise ValueError(f'{label}: invalid {key}')
        if ident in result:
            raise ValueError(f'{label}: duplicate {key}={ident}; resolve snapshots first')
        result[ident] = row
    return result


def merge_physical(current, previous):
    """Left join on player_id; fill each missing measurement independently."""
    old = index_rows(previous, 'player_id', 'FC26')
    new = index_rows(current, 'player_id', 'FC27')
    merged = {}
    for pid, source in new.items():
        row = dict(source)
        for field in ('height_cm', 'weight_kg'):
            value = integer(source.get(field))
            if value is None:
                value = integer(old.get(pid, {}).get(field))
            if value is not None and value <= 0:
                raise ValueError(f'{pid}: non-positive {field}')
            row[field] = value
        merged[pid] = row
    return merged


def rating_version(rating):
    rating = integer(rating)
    if rating is None or not 0 <= rating <= 99:
        raise ValueError('overall_rating must be an integer between 0 and 99')
    return 'Gold' if rating >= 75 else 'Silver' if rating >= 65 else 'Bronze'


def prepare(fc27, fc26, directory):
    current = read_csv(fc27)
    for source in current:
        # Invalid height must not fail physical preparation before the fallback is saved.
        try:
            number(source.get('height_cm'))
        except (TypeError, ValueError, OverflowError):
            source['height_cm'] = None
    merged = merge_physical(current, read_csv(fc26))
    rows = read_csv(directory / 'new_card_versions.csv')
    cards = [{key: integer(value) if key in INTEGER_FIELDS else
              None if value.strip().lower() in MISSING else value.strip()
              for key, value in row.items()} for row in rows]
    index_rows(cards, 'id', 'card_versions')
    if {row['player_id'] for row in cards} != set(merged):
        raise ValueError('new_card_versions.csv player coverage must exactly match FC27')
    for row in cards:
        source = merged[row['player_id']]
        row['version'] = rating_version(source.get('overall_rating'))
        row['overall'] = integer(source.get('overall_rating'))
        for destination, origin in [('sm', 'skill_moves'), ('wf', 'weak_foot')]:
            row[destination] = integer(source.get(origin))
        row['preferred_foot'] = source.get('preferred_foot') or None
        # Never derive card_type from rating, edition, or version.
        # Existing DB values take precedence during upload; new cards use CSV.
        row['body_type'] = body_type(source['height_cm'], source['weight_kg'])
        # Resolved from DB height immediately before card upload; dry runs leave this null.
        row['accele_type'] = None
    json.dumps(cards, allow_nan=False)
    return {'card_versions': cards}


def prepare_acceleration_types(client, cards, fc27):
    """Preload DB heights before calculating any card; never use CSV height."""
    sources = index_rows(read_csv(fc27), 'player_id', 'FC27')
    heights = {integer(row['id']): row.get('height')
               for row in select_all(client, 'players', 'id,height')}
    for card in cards:
        source = sources.get(card['player_id'], {})
        card['accele_type'] = accele_type(heights.get(card['player_id']), *(
            source.get(key) for key in ('power_strength', 'movement_agility',
                                       'movement_acceleration')))


def preserve_card_types(client, batch):
    """Read only targeted card IDs. A failed read must never fall back to CSV."""
    existing = client.table('card_versions').select('id,player_id,card_type').in_(
        'id', [row['id'] for row in batch]).execute().data
    by_id = {integer(row['id']): row for row in existing}
    payload = []
    for row in batch:
        card = dict(row)
        old = by_id.get(row['id'])
        if old is not None:
            if integer(old['player_id']) != row['player_id']:
                raise ValueError(f"Card ID {row['id']} belongs to a different player; fix CSV mapping")
            card['card_type'] = old['card_type']
        elif not card.get('card_type'):
            raise ValueError(f"New card {row['id']} needs an explicit card_type in CSV")
        payload.append(card)
    return payload


def short_name(name, abbreviations=None):
    """Prefer a curated label; otherwise keep the original letter fallback."""
    name = name.strip()
    if abbreviations and name in abbreviations:
        return abbreviations[name]
    normalized = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    words = re.findall(r'[A-Z]+', normalized.upper())
    if not words:
        raise ValueError(f'Cannot abbreviate name: {name!r}')
    return words[0][:3] if len(words) == 1 else ''.join(word[0] for word in words)[:3]


def prepare_references(directory):
    tables = {}
    flag_cache = {}
    for table in ('nations', 'leagues', 'clubs'):
        rows = read_csv(directory / f'new_{table}.csv')
        index_rows(rows, 'id', table)
        ready = []
        for row in rows:
            item = {'id': integer(row['id']), 'name': row['name'].strip()}
            if not item['name']:
                raise ValueError(f'{table}: empty name')
            if table == 'nations':
                url = row.get('flag_url', '').strip()
                parsed = urlparse(url)
                if parsed.scheme not in ('http', 'https') or not parsed.netloc:
                    raise ValueError(f"Invalid flag URL for nation {item['id']}")
                if item['name'] in flag_cache and flag_cache[item['name']] != url:
                    raise ValueError(f"Conflicting flag URLs for {item['name']}")
                flag_cache.setdefault(item['name'], url)
                item['flag_url'] = flag_cache[item['name']]
            else:
                abbreviations = LEAGUE_ABBR_MAP if table == 'leagues' else CLUB_ABBR_MAP
                item['short_name'] = short_name(item['name'], abbreviations)
            ready.append(item)
        tables[table] = ready
    return tables


def upload_references(client, tables, attempts=6, batch_size=50, sleep=time.sleep):
    """Upsert stable CSV primary keys without replacing unrelated metadata."""
    if not 50 <= batch_size <= 100 or not 1 <= attempts <= 6:
        raise ValueError('Invalid reference upload batch size or attempts')
    report = {'tables': {}, 'failures': []}
    for table, rows in tables.items():
        uploaded = 0
        for start in range(0, len(rows), batch_size):
            batch = rows[start:start + batch_size]
            for attempt in range(1, attempts + 1):
                try:
                    existing = client.table(table).select('id,name').in_(
                        'id', [row['id'] for row in batch]).execute().data
                    names = {integer(row['id']): row['name'] for row in existing}
                    for row in batch:
                        if row['id'] in names and names[row['id']] != row['name']:
                            raise ValueError(f'{table}: stable ID/name mismatch')
                    # Existing rows only receive the requested metadata field.
                    field = 'flag_url' if table == 'nations' else 'short_name'
                    old = [{'id': row['id'], 'name': row['name'], field: row[field]}
                           for row in batch if row['id'] in names]
                    new = [row for row in batch if row['id'] not in names]
                    # Do not insert a known name under a different ID.
                    for row in new:
                        matches = client.table(table).select('id').eq('name', row['name']).limit(1).execute().data
                        if matches:
                            raise ValueError(f'{table}: name exists under another ID')
                    for payload in (old, new):
                        if payload:
                            client.table(table).upsert(payload, on_conflict='id', returning='minimal').execute()
                    uploaded += len(batch)
                    break
                except Exception as error:
                    LOG.warning('%s batch %s attempt %s/%s: %s', table,
                                start // batch_size + 1, attempt, attempts, type(error).__name__)
                    if attempt == attempts or not retryable(error):
                        report['failures'].append({'table': table, 'reason': type(error).__name__, 'rows': batch})
                        break
                    sleep(min(2 ** attempt, 32) + random.uniform(0, 1))
        report['tables'][table] = {'uploaded': uploaded, 'not_uploaded': len(rows) - uploaded}
        LOG.info('%s: uploaded=%s, not_uploaded=%s', table, uploaded, len(rows) - uploaded)
    return report


@contextmanager
def stable_client(url, key):
    """Own and close the HTTP/1.1 transport; never reuse stale idle sockets."""
    import httpx
    from supabase import create_client
    from supabase.lib.client_options import SyncClientOptions

    timeout = httpx.Timeout(connect=30, read=120, write=120, pool=30)
    with httpx.Client(http1=True, http2=False, timeout=timeout,
                      limits=httpx.Limits(max_connections=1, max_keepalive_connections=0)) as http:
        yield create_client(url, key, options=SyncClientOptions(
            httpx_client=http, postgrest_client_timeout=timeout,
            auto_refresh_token=False, persist_session=False))


def retryable(error):
    import httpcore
    import httpx

    if isinstance(error, (httpx.TransportError, httpcore.NetworkError,
                          httpcore.TimeoutException, httpcore.ProtocolError,
                          TimeoutError, ConnectionError)):
        return True
    status = getattr(getattr(error, 'response', None), 'status_code', None)
    code = str(getattr(error, 'code', ''))
    return status in (408, 429, 500, 502, 503, 504) or code in {
        '408', '429', '500', '502', '503', '504', '57014', '40001', '40P01', 'PGRST003'} or code.startswith('08')


def select_all(client, table, columns):
    """Preload a complete mapping, paging past the API response limit."""
    rows = []
    while True:
        response = client.table(table).select(columns, count='exact').order('id').range(
            len(rows), len(rows) + 999).execute()
        rows.extend(response.data)
        if response.count is None:
            raise ValueError('Missing exact count during database read')
        if len(rows) == response.count:
            return rows
        if not response.data or len(rows) > response.count:
            raise ValueError('Incomplete database read')


def upload(client, tables, attempts=6, sleep=time.sleep, batch_size=50, progress=True):
    """Patch only accele_type, once per player; retries are idempotent."""
    if set(tables) != {'card_versions'}:
        raise ValueError('Only card_versions is allowed')
    if not 50 <= batch_size <= 100 or not 1 <= attempts <= 6:
        raise ValueError('Invalid batch size or attempts')
    values = {}
    for row in tables['card_versions']:
        pid = integer(row['player_id'])
        if pid is None or pid <= 0:
            raise ValueError('Invalid player_id')
        if pid in values and values[pid] != row['accele_type']:
            raise ValueError('Conflicting acceleration types for one player')
        values[pid] = row['accele_type']
    report = {'updated_players': 0, 'updated_cards': 0, 'failures': []}
    for pid, value in values.items():
        for attempt in range(1, attempts + 1):
            try:
                response = client.table('card_versions').update(
                    {'accele_type': value}).eq('player_id', pid).execute()
                if not response.data:
                    raise ValueError('No matching cards were updated')
                report['updated_players'] += 1
                report['updated_cards'] += len(response.data)
                break
            except Exception as error:
                if attempt == attempts or not retryable(error):
                    report['failures'].append({'player_id': pid, 'reason': type(error).__name__})
                    break
                sleep(min(2 ** attempt, 32) + random.uniform(0, 1))
    return report


def patch_batches(url, key, cards, attempts, batch_size, report_path):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    batches = [cards[i:i + batch_size] for i in range(0, len(cards), batch_size)]
    report = {'updated_players': 0, 'updated_cards': 0, 'failures': []}
    def run(batch):
        with stable_client(url, key) as client:
            return upload(client, {'card_versions': batch}, attempts=attempts,
                          batch_size=batch_size, progress=False)
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(run, batch): batch for batch in batches}
        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception as error:
                result = {'updated_players': 0, 'updated_cards': 0,
                          'failures': [{'player_id': c['player_id'], 'reason': type(error).__name__}
                                       for c in futures[future]]}
            for field in ('updated_players', 'updated_cards'):
                report[field] += result[field]
            report['failures'].extend(result['failures'])
            report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
            LOG.info('Patched players=%s cards=%s failures=%s', report['updated_players'],
                     report['updated_cards'], len(report['failures']))
    return report


def resolve_source(explicit, names, directory):
    if explicit:
        return Path(explicit)
    for name in names:
        if (directory / name).is_file():
            return directory / name
    raise FileNotFoundError(f'No input found: {names}; specify --fc27/--fc26')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fc27')
    parser.add_argument('--fc26')
    parser.add_argument('--data-dir', type=Path, default=ROOT)
    parser.add_argument('--env-file', type=Path, default=ROOT / '.env')
    parser.add_argument('--dry-run', action='store_true', help='Read and calculate without database writes')
    parser.add_argument('--attempts', type=int, default=6, help='Total attempts, including initial request (1..6)')
    parser.add_argument('--batch-size', type=int, default=50, help='Rows per request (50..100; default 50)')
    parser.add_argument('--no-progress', action='store_true')
    parser.add_argument('--report', type=Path, default=ROOT / 'seed-report.json')
    args = parser.parse_args()
    if not 1 <= args.attempts <= 6:
        parser.error('--attempts must be between 1 and 6 (up to five retries)')
    if not 50 <= args.batch_size <= 100:
        parser.error('--batch-size must be between 50 and 100')
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    logging.getLogger('httpx').setLevel(logging.WARNING)
    try:
        fc27 = resolve_source(args.fc27, ('fc27_players.csv', 'players.csv', 'fc27_dataset.csv'), args.data_dir)
        # Reference/player preparation and writes are disabled for this patch-only run.
        # references = prepare_references(args.data_dir)
        # tables = prepare(fc27, fc26, args.data_dir)
        from dotenv import load_dotenv
        load_dotenv(args.env_file)
        url, key = os.getenv('VITE_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        if not url or not key:
            raise ValueError('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
        with stable_client(url, key) as client:
            before = select_all(client, 'card_versions', '*')
            sources = index_rows(read_csv(fc27), 'player_id', 'FC27')
            cards = [{'player_id': pid} for pid in sorted({integer(c['player_id']) for c in before})
                     if pid in sources]
            prepare_acceleration_types(client, cards, fc27)
            expected = {c['player_id']: c['accele_type'] for c in cards}
            changed = {integer(c['player_id']) for c in before
                       if integer(c['player_id']) in expected
                       and c.get('accele_type') != expected[integer(c['player_id'])]}
            pending = [c for c in cards if c['player_id'] in changed]
            LOG.info('Plan: %s players to patch; %s cards total', len(pending), len(before))
            snapshot = args.report.with_suffix('.before.json')
            snapshot.write_text(json.dumps(before, ensure_ascii=False, allow_nan=False), encoding='utf-8')
            if args.dry_run:
                return 0
            # upload_references(client, references) -- disabled: no reference writes.
            # players uploads -- disabled: players is read-only.
            # Full card upsert -- disabled: only the patch function below is used.
        report = patch_batches(url, key, pending, args.attempts, args.batch_size, args.report)
        with stable_client(url, key) as client:
            after = select_all(client, 'card_versions', '*')
        original = {c['id']: c for c in before}
        report['verification_mismatches'] = []
        report['other_column_changes'] = []
        for card in after:
            pid = integer(card['player_id'])
            if pid in expected and card.get('accele_type') != expected[pid]:
                report['verification_mismatches'].append(card['id'])
            old = original.get(card['id'])
            if old is None or any(card.get(k) != v for k, v in old.items() if k != 'accele_type'):
                report['other_column_changes'].append(card['id'])
        report['card_count_before'] = len(before)
        report['card_count_after'] = len(after)
        report['verified'] = (not report['failures'] and not report['verification_mismatches']
                              and not report['other_column_changes']
                              and {c['id'] for c in after} == set(original))
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
        if not report['verified']:
            LOG.error('Partial failure. See %s; fix causes and rerun the same inputs.', args.report)
            return 1
        LOG.info('accele_type patches verified; other card columns unchanged. Report: %s', args.report)
        return 0
    except (ValueError, OSError, ImportError) as error:
        LOG.error('%s', error)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
