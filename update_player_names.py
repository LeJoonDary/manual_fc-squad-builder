"""Patch existing players.name/long_name from FC26, never insert or change other fields."""
import argparse
import csv
import json
import logging
import os
import re
from collections import Counter
from pathlib import Path
from dotenv import load_dotenv
from seed import stable_client
from update_gender import retry

LOG = logging.getLogger('update_player_names')


def prepare(path):
    rows = {}
    invalid = []
    conflicts = set()
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        for line, row in enumerate(csv.DictReader(stream), 2):
            ident = (row.get('player_id') or '').strip()
            if not re.fullmatch(r'[0-9]+', ident) or int(ident) <= 0:
                invalid.append(line)
                continue
            ident = int(ident)
            if row.get('short_name') is None or row.get('long_name') is None:
                invalid.append(line)
                continue
            value = {'name': row['short_name'], 'long_name': row['long_name']}
            if ident in rows and rows[ident] != value:
                conflicts.add(ident)
            rows[ident] = value
    for ident in conflicts:
        rows.pop(ident, None)
    return rows, invalid, sorted(conflicts)


def fetch_players(client):
    rows = []
    while True:
        result = retry(lambda: client.table('players').select('*', count='exact').order('id')
                       .range(len(rows), len(rows) + 999).execute())
        rows.extend(result.data)
        if result.count is not None and len(rows) == result.count:
            return {r['id']: r for r in rows}
        if not result.data or result.count is None:
            raise ValueError('Incomplete player snapshot')


def patch_player(client, ident, value):
    payload = {key: value[key] for key in ('name', 'long_name')}
    result = retry(lambda: client.table('players').update(payload).eq('id', ident).execute())
    if not result.data:
        return False
    if any(r['id'] != ident or any(r.get(k) != v for k, v in payload.items()) for r in result.data):
        raise ValueError('Patch response mismatch')
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', default='fc26_dataset.csv')
    parser.add_argument('--batch-size', type=int, default=100)
    parser.add_argument('--report', type=Path, default=Path('player-names-report.json'))
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if not 50 <= args.batch_size <= 100:
        parser.error('batch-size must be 50..100')
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    logging.getLogger('httpx').setLevel(logging.WARNING)
    load_dotenv()
    expected, invalid, conflicts = prepare(args.csv)
    url, key = os.environ['VITE_SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY']
    with stable_client(url, key) as client:
        before = fetch_players(client)
        matched = {i: v for i, v in expected.items() if i in before}
        pending = [(i, v) for i, v in matched.items() if any(before[i].get(k) != x for k, x in v.items())]
        report = dict(csv_unique_ids=len(expected), matched=len(matched), unmatched=len(expected)-len(matched),
                      unchanged=len(matched)-len(pending), pending=len(pending), updated=0,
                      disappeared=[], invalid_lines=invalid, conflicting_ids=conflicts, failures=[])
        LOG.info('Plan: matched=%s unmatched=%s unchanged=%s updates=%s', len(matched),
                 report['unmatched'], report['unchanged'], len(pending))
        snapshot = args.report.with_suffix('.before.json')
        if not snapshot.exists():
            snapshot.write_text(json.dumps(list(before.values()), ensure_ascii=False), encoding='utf-8')
        args.report.write_text(json.dumps(report, indent=2), encoding='utf-8')
        if args.dry_run:
            return 0
        for start in range(0, len(pending), args.batch_size):
            for ident, value in pending[start:start + args.batch_size]:
                try:
                    if patch_player(client, ident, value):
                        report['updated'] += 1
                    else:
                        report['disappeared'].append(ident)
                except Exception as error:
                    report['failures'].append({'id': ident, 'reason': type(error).__name__})
                    LOG.warning('Player %s failed: %s; continuing', ident, type(error).__name__)
            args.report.write_text(json.dumps(report, indent=2), encoding='utf-8')
            LOG.info('Batch %s: updated=%s/%s failures=%s', start//args.batch_size+1,
                     report['updated'], len(pending), len(report['failures']))
        after = fetch_players(client)
        report['name_mismatches'] = [i for i,v in matched.items()
                                     if i not in after or any(after[i].get(k) != x for k,x in v.items())]
        report['other_column_changes'] = [i for i,r in before.items() if i in after and
            any(after[i].get(k) != v for k,v in r.items() if k not in ('name','long_name'))]
        report['unmatched_changes'] = [i for i in before if i not in matched and before[i] != after.get(i)]
        report['row_count_before'], report['row_count_after'] = len(before), len(after)
        report['verified'] = (set(before) == set(after) and not any(report[k] for k in
            ('name_mismatches','other_column_changes','unmatched_changes','failures','disappeared')))
        args.report.write_text(json.dumps(report, indent=2), encoding='utf-8')
        LOG.info('Finished: verified=%s updated=%s', report['verified'], report['updated'])
        return 0 if report['verified'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
