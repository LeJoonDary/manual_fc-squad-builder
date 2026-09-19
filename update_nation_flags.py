"""Repair only nations.flag_url using the free official FlagCDN name API.

python update_nation_flags.py
python update_nation_flags.py --dry-run

REST Countries v3.1 currently returns a deprecation response, so use the
documented free JSON API: https://flagpedia.net/download/api
No player records are read, no rows are inserted, and seed.py is untouched.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path
import random
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor

import httpx
from seed import ROOT, stable_client, retryable

LOG = logging.getLogger('update_nation_flags')
CATALOG_URL = 'https://flagcdn.com/en/codes.json'
# Exact football-name exceptions; codes are validated against the live catalog.
SPECIAL_CODES = {
    'England': 'gb-eng', 'Wales': 'gb-wls', 'Scotland': 'gb-sct',
    'Northern Ireland': 'gb-nir', 'Holland': 'nl', 'Republic of Ireland': 'ie',
    "Côte d'Ivoire": 'ci', 'Czech Republic': 'cz', 'Korea Republic': 'kr',
    'Korea DPR': 'kp', 'Congo DR': 'cd', 'Congo': 'cg',
    'Cape Verde Islands': 'cv', 'China PR': 'cn', 'Chinese Taipei': 'tw',
    'St. Kitts and Nevis': 'kn', 'St. Lucia': 'lc', 'São Tomé e Príncipe': 'st',
}


def normalized(name):
    return ''.join(c for c in unicodedata.normalize('NFKD', name).casefold() if c.isalnum())


def retry(operation, sleep=time.sleep):
    for attempt in range(1, 7):
        try:
            return operation()
        except Exception as error:
            if attempt == 6 or not retryable(error):
                raise
            delay = min(2 ** attempt, 32) + random.uniform(0, 1)
            LOG.warning('Retry %s/5 after %s', attempt, type(error).__name__)
            sleep(delay)


def fetch_nations(db):
    rows = []
    while True:
        offset = len(rows)
        page = retry(lambda: db.table('nations').select('*').order('id')
                     .range(offset, offset + 99).execute().data)
        if not page:
            return rows
        rows.extend(page)


class FlagResolver:
    def __init__(self, http):
        self.http = http
        self.cache = {}  # One resolution per nation, never per player.
        self.catalog = None
        self.by_name = {}

    def resolve(self, name):
        key = normalized(name)
        if key in self.cache:
            return self.cache[key]
        if self.catalog is None:
            response = retry(lambda: self._get_catalog())
            catalog = response.json()
            if not isinstance(catalog, dict) or not catalog:
                raise ValueError('Invalid FlagCDN country catalog')
            self.catalog = {code: label for code, label in catalog.items()
                            if re.fullmatch(r'[a-z]{2}|gb-(?:eng|sct|wls|nir)', code)}
            for code, label in self.catalog.items():
                canonical = normalized(label)
                if canonical in self.by_name:
                    raise ValueError(f'Ambiguous API country name: {label}')
                self.by_name[canonical] = code
        exceptions = {normalized(label): code for label, code in SPECIAL_CODES.items()}
        code = exceptions.get(key) or self.by_name.get(key)
        if code is None or code not in self.catalog:
            raise ValueError(f'Unresolved country name: {name}')
        self.cache[key] = {'code': code, 'api_name': self.catalog[code],
                           'flag_url': f'https://flagcdn.com/{code}.svg'}
        return self.cache[key]

    def _get_catalog(self):
        response = self.http.get(CATALOG_URL)
        response.raise_for_status()
        return response


def verify_image(http, url):
    def request():
        response = http.head(url)
        response.raise_for_status()
        if response.headers.get('content-type', '').split(';')[0] != 'image/svg+xml':
            raise ValueError(f'Expected SVG flag image: {url}')
    retry(request)


def prepare(nations, resolver):
    names, ids, plan = set(), set(), []
    for row in nations:
        key = normalized(row['name'])
        if row['id'] in ids or key in names:
            raise ValueError('Duplicate nation ID or normalized name; refusing ambiguous updates')
        ids.add(row['id'])
        names.add(key)
        plan.append({'id': row['id'], 'name': row['name'], 'old_flag_url': row.get('flag_url'),
                     **resolver.resolve(row['name'])})
    if not plan:
        raise ValueError('nations is empty')
    return plan


def update_one(db, row):
    result = retry(lambda: db.table('nations').update({'flag_url': row['flag_url']})
                   .eq('id', row['id']).eq('name', row['name']).execute())
    if len(result.data) != 1 or any(result.data[0].get(k) != row[k] for k in ('id', 'name', 'flag_url')):
        raise ValueError(f'Nation UPDATE did not match expected record: {row["id"]}')


def verify(before, after, plan):
    original = {row['id']: row for row in before}
    saved = {row['id']: row for row in after}
    if len(after) != len(before) or saved.keys() != original.keys():
        raise ValueError('Nation row count or IDs changed')
    for row in plan:
        expected = {**original[row['id']], 'flag_url': row['flag_url']}
        if saved[row['id']] != expected:
            raise ValueError(f'Nation URL or other columns differ from expected: {row["id"]}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--report', type=Path, default=ROOT / 'update-nation-flags-report.json')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    logging.getLogger('httpx').setLevel(logging.WARNING)
    report = {'status': 'started', 'updated': 0, 'failures': [], 'api': CATALOG_URL}
    def save_report():
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / '.env.local')
        load_dotenv(ROOT / '.env')
        url, key = os.getenv('VITE_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        if not url or not key:
            raise ValueError('Missing Supabase URL or service role key')
        with stable_client(url, key) as db, httpx.Client(http1=True, http2=False,
                timeout=httpx.Timeout(30, connect=15), follow_redirects=True,
                limits=httpx.Limits(max_connections=4, max_keepalive_connections=4)) as http:
            before = fetch_nations(db)
            resolver = FlagResolver(http)
            plan = prepare(before, resolver)
            # Resolve and check every URL before the first database mutation.
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda row: verify_image(http, row['flag_url']), plan))
            report.update(rows_before=len(before), cached_nations=len(resolver.cache),
                          verified_image_urls=len(plan), mappings=plan)
            LOG.info('Resolved %s nations; all flag image URLs verified', len(plan))
            if args.dry_run:
                LOG.info('Dry run complete; no DB changes')
                return 0
            save_report()  # Includes old URLs for audit/recovery, before any updates.
            for row in plan:
                if row['old_flag_url'] == row['flag_url']:
                    continue
                update_one(db, row)
                report['updated'] += 1
                if report['updated'] % 25 == 0:
                    LOG.info('Updated %s/%s nations', report['updated'], len(plan))
                    save_report()
            after = fetch_nations(db)
            verify(before, after, plan)
            report.update(status='complete', verified=len(plan), rows_after=len(after),
                          other_columns_unchanged=True, already_correct=len(plan) - report['updated'])
            save_report()
        LOG.info('Complete: %s updated, %s verified; row count unchanged', report['updated'], report['verified'])
        return 0
    except Exception as error:
        failure = {'type': type(error).__name__, 'code': str(getattr(error, 'code', ''))}
        if isinstance(error, ValueError):
            failure['detail'] = str(error)
        report.update(status='failed')
        report['failures'].append(failure)
        LOG.error('Flag update stopped: %s', failure)
        if not args.dry_run:
            save_report()
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
