"""Update only existing players.gender values; never insert rows or access other tables.

python update_gender.py
python update_gender.py --csv fc27_dataset.csv --batch-size 50 --dry-run
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
import logging
import os
from pathlib import Path
import random
import time

# These helpers do not access the database on import.
from seed import ROOT, integer, read_csv, retryable, stable_client

LOG = logging.getLogger('update_gender')
GENDER_MAP = {"Men's Football": 'Male', "Women's Football": 'Female'}
MAX_ATTEMPTS = 6  # Initial request plus at most five retries.


def retry(operation, sleep=time.sleep):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return operation()
        except Exception as error:
            if attempt == MAX_ATTEMPTS or not retryable(error):
                raise
            delay = min(2 ** attempt, 32) + random.uniform(0, 1)
            LOG.warning('Retry %s/5 after %s; waiting %.1fs', attempt, type(error).__name__, delay)
            sleep(delay)


def prepare(rows):
    expected = {}
    for row in rows:
        player_id = integer(row.get('player_id') or row.get('id'))
        if player_id is None or player_id <= 0:
            raise ValueError('CSV has an invalid player_id')
        raw = row.get('gender', '').strip()
        if raw not in GENDER_MAP:
            raise ValueError(f'Unknown gender for player_id={player_id}: {raw!r}')
        value = GENDER_MAP[raw]
        if player_id in expected and expected[player_id] != value:
            raise ValueError(f'Conflicting CSV genders for player_id={player_id}')
        expected[player_id] = value
    if not expected:
        raise ValueError('No player records in CSV')
    return expected


def fetch_players(client):
    players = {}
    offset = 0
    while True:
        rows = retry(lambda: client.table('players').select('id,gender').order('id')
                     .range(offset, offset + 499).execute().data)
        if not rows:
            return players
        for row in rows:
            player_id = integer(row['id'])
            if player_id in players:
                raise ValueError(f'Duplicate players.id: {player_id}')
            players[player_id] = row['gender']
        # Continue until an empty response, even if the server caps page size.
        offset += len(rows)


def plan_updates(expected, existing):
    missing = sorted(expected.keys() - existing.keys())
    if missing:
        raise ValueError(f'{len(missing)} CSV IDs are missing from players; first IDs: {missing[:10]}')
    groups = {'Male': [], 'Female': []}
    for player_id, gender in expected.items():
        if existing[player_id] != gender:
            groups[gender].append(player_id)
    return groups


def apply_updates(client, groups, batch_size, report, checkpoint=lambda: None):
    if not 50 <= batch_size <= 100:
        raise ValueError('batch_size must be 50..100')
    for gender, player_ids in groups.items():
        for start in range(0, len(player_ids), batch_size):
            batch = player_ids[start:start + batch_size]
            # UPDATE with a bounded primary-key filter; never INSERT or UPSERT.
            result = retry(lambda: client.table('players').update({'gender': gender})
                           .in_('id', batch).execute())
            saved = {integer(row['id']): row['gender'] for row in result.data}
            if len(result.data) != len(batch) or saved != dict.fromkeys(batch, gender):
                raise ValueError('UPDATE response did not match the requested IDs and gender')
            report['updated'] += len(batch)
            report['updated_by_gender'][gender] += len(batch)
            checkpoint()
            if start == 0 or (start // batch_size + 1) % 25 == 0 or start + len(batch) == len(player_ids):
                LOG.info('%s: %s/%s updated', gender, start + len(batch), len(player_ids))


def verify(expected, before, after):
    if before.keys() != after.keys():
        raise ValueError('players ID set changed during the run')
    mismatched = [pid for pid, value in expected.items() if after[pid] != value]
    if mismatched:
        raise ValueError(f'{len(mismatched)} gender values did not match; first IDs: {mismatched[:10]}')
    if any(after[pid] != value for pid, value in before.items() if pid not in expected):
        raise ValueError('A gender outside the CSV target set changed during the run')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', type=Path)
    parser.add_argument('--batch-size', type=int, default=50)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--report', type=Path, default=ROOT / 'update-gender-report.json')
    args = parser.parse_args()
    if not 50 <= args.batch_size <= 100:
        parser.error('--batch-size must be 50..100')
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    logging.getLogger('httpx').setLevel(logging.WARNING)
    report = {'status': 'started', 'updated': 0, 'updated_by_gender': {'Male': 0, 'Female': 0},
              'failures': [], 'batch_size': args.batch_size}

    def checkpoint():
        temporary = args.report.with_suffix(args.report.suffix + '.tmp')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(args.report)

    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / '.env.local')
        load_dotenv(ROOT / '.env')
        source = args.csv or next((ROOT / name for name in ('players.csv', 'fc27_dataset.csv')
                                   if (ROOT / name).is_file()), None)
        if source is None:
            raise ValueError('No player CSV found; specify --csv')
        expected = prepare(read_csv(source))
        report.update(source=str(source), csv_players=len(expected),
                      expected_by_gender=dict(Counter(expected.values())))
        url, key = os.getenv('VITE_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        if not url or not key:
            raise ValueError('Missing Supabase URL or service role key')
        with stable_client(url, key) as client:
            before = fetch_players(client)
            groups = plan_updates(expected, before)
            pending = sum(map(len, groups.values()))
            report.update(rows_before=len(before), planned_updates=pending,
                          already_correct=len(expected) - pending)
            LOG.info('Matched %s players; %s updates, %s already correct',
                     len(expected), pending, report['already_correct'])
            if args.dry_run:
                LOG.info('Dry run passed; no database changes')
                return 0
            checkpoint()  # Ensure the report is writable before any UPDATE.
            apply_updates(client, groups, args.batch_size, report, checkpoint)
            after = fetch_players(client)
            verify(expected, before, after)
            report.update(status='complete', verified=len(expected), rows_after=len(after),
                          player_ids_unchanged=True, verified_by_gender=dict(Counter(after[pid] for pid in expected)))
            checkpoint()
        LOG.info('Complete: %s updated, %s verified; players row count unchanged (%s)',
                 report['updated'], report['verified'], report['rows_after'])
        return 0
    except Exception as error:
        failure = {'type': type(error).__name__, 'code': str(getattr(error, 'code', ''))}
        if isinstance(error, ValueError):
            failure['detail'] = str(error)
        report['status'] = 'failed'
        report['failures'].append(failure)
        LOG.error('Update stopped: %s', failure)
        if not args.dry_run:
            checkpoint()
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
