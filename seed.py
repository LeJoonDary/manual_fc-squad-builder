"""Seed ONLY card_versions, preserving existing database card_type values.

python seed.py --dry-run
python seed.py --fc27 fc27_dataset.csv --batch-size 50

new_card_versions.csv supplies stable card IDs and foreign-key mappings.
FC27 supplies ratings/stats; FC26 fills missing physical measurements only.
No reads or writes to nations, leagues, clubs or players are performed.
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
import time

ROOT = Path(__file__).resolve().parent
TABLES = ('card_versions',)
INTEGER_FIELDS = {'id', 'player_id', 'nation_id', 'league_id', 'club_id', 'overall',
                  'price', 'sm', 'wf', 'height', 'weight', 'age'}
MISSING = {'', 'nan', 'none', 'null', 'n/a', 'na'}
LOG = logging.getLogger('seed')


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


def accele_type(height, strength, agility, acceleration, sprint_speed):
    if any(v is None for v in (height, strength, agility, acceleration, sprint_speed)):
        return None
    strength_gap = strength - agility
    speed_gap = sprint_speed - acceleration
    if height >= 183 and strength_gap >= 20 and speed_gap >= 12:
        return 'Lengthy'
    if height >= 174 and strength_gap >= 12 and speed_gap >= 6:
        return 'Mostly Lengthy'
    if height >= 183 and strength_gap >= 5:
        return 'Controlled Lengthy'
    if height <= 175 and -strength_gap >= 20 and -speed_gap >= 12:
        return 'Explosive'
    if height <= 180 and -strength_gap >= 12 and -speed_gap >= 6:
        return 'Mostly Explosive'
    if height <= 175 and -strength_gap >= 5:
        return 'Controlled Explosive'
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
    merged = merge_physical(read_csv(fc27), read_csv(fc26))
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
        row['accele_type'] = accele_type(source['height_cm'], *(
            number(source.get(key)) for key in ('power_strength', 'movement_agility',
                                                'movement_acceleration', 'movement_sprint_speed')))
    json.dumps(cards, allow_nan=False)
    return {'card_versions': cards}


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


def upload(client, tables, attempts=6, sleep=time.sleep, batch_size=50, progress=True):
    """Initial attempt + up to five retries. Progress measures processed rows."""
    from tqdm import tqdm
    from tqdm.contrib.logging import logging_redirect_tqdm

    if not 50 <= batch_size <= 100 or not 1 <= attempts <= 6:
        raise ValueError('batch_size must be 50..100 and attempts must be 1..6')
    if set(tables) != {'card_versions'}:
        raise ValueError('Only card_versions is allowed')
    succeeded = {table: set() for table in TABLES}
    report = {'tables': {}, 'failures': []}
    with logging_redirect_tqdm(), tqdm(total=sum(map(len, tables.values())),
                                      desc='Overall processed', unit='row',
                                      disable=not progress, dynamic_ncols=True) as overall:
        for table in TABLES:
            ready = tables['card_versions']
            batches = math.ceil(len(ready) / batch_size)
            good_batches = bad_batches = 0
            for start in range(0, len(ready), batch_size):
                batch = ready[start:start + batch_size]
                batch_number = start // batch_size + 1
                for attempt in range(1, attempts + 1):
                    try:
                        payload = preserve_card_types(client, batch)
                        client.table('card_versions').upsert(payload, on_conflict='id', returning='minimal').execute()
                        succeeded[table].update(row['id'] for row in batch)
                        good_batches += 1
                        LOG.info('%s batch %s/%s OK (%s rows)', table, batch_number, batches, len(batch))
                        break
                    except Exception as error:
                        # Do not log exception messages: HTTP errors may contain credentials.
                        LOG.warning('%s batch %s attempt %s/%s: %s', table, batch_number,
                                    attempt, attempts, type(error).__name__)
                        if attempt == attempts or not retryable(error):
                            bad_batches += 1
                            report['failures'].append({'table': table, 'reason': type(error).__name__, 'rows': batch})
                            LOG.error('%s batch %s/%s FAILED; continuing', table, batch_number, batches)
                            break
                        else:
                            delay = min(2 ** attempt, 32) + random.uniform(0, 1)
                            LOG.warning('Retry %s/%s in %.1fs', attempt, attempts - 1, delay)
                            sleep(delay)
                overall.set_postfix(table=table, batch=f'{batch_number}/{batches}',
                                    ok=good_batches, failed=bad_batches)
                overall.update(len(batch))
            count = len(succeeded[table])
            report['tables'][table] = {'uploaded': count, 'not_uploaded': len(tables[table]) - count}
            LOG.info('%s: uploaded=%s, not_uploaded=%s', table, count, len(tables[table]) - count)
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
    parser.add_argument('--dry-run', action='store_true', help='Validate and summarize without database access')
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
    try:
        fc27 = resolve_source(args.fc27, ('fc27_players.csv', 'players.csv', 'fc27_dataset.csv'), args.data_dir)
        fc26 = resolve_source(args.fc26, ('fc26_players.csv', 'fc26_dataset.csv'), args.data_dir)
        tables = prepare(fc27, fc26, args.data_dir)
        for table, rows in tables.items():
            LOG.info('Prepared %s: %s rows', table, len(rows))
        for version in ('Gold', 'Silver', 'Bronze'):
            LOG.info('%s: %s', version, sum(r['version'] == version for r in tables['card_versions']))
        LOG.info('Only card_versions will be written; DB card_type is preserved on upload.')
        if args.dry_run:
            return 0
        from dotenv import load_dotenv
        load_dotenv(args.env_file)
        url, key = os.getenv('VITE_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        if not url or not key:
            raise ValueError('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
        # Verify report destination before any upload.
        with args.report.open('w', encoding='utf-8') as stream:
            json.dump({'status': 'started'}, stream)
        with stable_client(url, key) as client:
            report = upload(client, tables, args.attempts, batch_size=args.batch_size,
                            progress=not args.no_progress)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
        if report['failures']:
            LOG.error('Partial failure. See %s; fix causes and rerun the same inputs.', args.report)
            return 1
        LOG.info('card_versions uploaded successfully. Report: %s', args.report)
        return 0
    except (ValueError, OSError, ImportError) as error:
        LOG.error('%s', error)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
