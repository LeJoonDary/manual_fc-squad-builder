import unittest
from unittest.mock import Mock, patch
import seed


class SeedTests(unittest.TestCase):
    def test_reference_names_and_cached_flags(self):
        for name, expected in [('Premier League', 'PL'), ('Bundesliga', 'BUN'),
                               ('FC Bayern München', 'FBM'), ('Paris Saint-Germain', 'PSG')]:
            self.assertEqual(seed.short_name(name), expected)
        tables = seed.prepare_references(seed.ROOT)
        for table in ('leagues', 'clubs'):
            self.assertTrue(all(__import__('re').fullmatch('[A-Z0-9]{1,6}', r['short_name'])
                                for r in tables[table]))
        self.assertEqual(len(tables['nations']), 164)
        self.assertTrue(all(r['flag_url'].startswith('https://') for r in tables['nations']))

    def test_curated_abbreviations_take_priority_and_keep_fallback(self):
        for name, expected in [('Premier League', 'EPL'), ('Barclays WSL', 'WSL'),
                               ('LALIGA EA SPORTS', 'LALIGA'), ('Serie A Enilive', 'SERI'),
                               ('Bundesliga', 'BUN'), ("Ligue 1 McDonald's", 'LIG1')]:
            self.assertEqual(seed.short_name(name, seed.LEAGUE_ABBR_MAP), expected)
        for name in ('Manchester United', 'Manchester Utd', 'Man Utd'):
            self.assertEqual(seed.short_name(name, seed.CLUB_ABBR_MAP), 'MUN')
        self.assertEqual(seed.short_name('Real Madrid', seed.CLUB_ABBR_MAP), 'RMA')
        self.assertEqual(seed.short_name('Manchester City', seed.CLUB_ABBR_MAP), 'MCI')
        self.assertEqual(seed.short_name('FC Bayern München', seed.CLUB_ABBR_MAP), 'FCB')
        self.assertEqual(seed.short_name('Example Football Club', seed.CLUB_ABBR_MAP), 'EFC')
        self.assertEqual(seed.short_name('Premier League', seed.CLUB_ABBR_MAP), 'PL')
        tables = seed.prepare_references(seed.ROOT)
        for table, mapping in [('leagues', seed.LEAGUE_ABBR_MAP), ('clubs', seed.CLUB_ABBR_MAP)]:
            for row in tables[table]:
                self.assertEqual(row['short_name'], mapping.get(row['name'], seed.short_name(row['name'])))

    def test_reference_upsert_preserves_other_fields_and_rejects_id_reuse(self):
        client = Mock()
        response = client.table.return_value.select.return_value.in_.return_value.execute.return_value
        response.data = [{'id': 1, 'name': 'Premier League'}]
        rows = {'leagues': [{'id': 1, 'name': 'Premier League', 'short_name': 'PL'}]}
        report = seed.upload_references(client, rows)
        self.assertFalse(report['failures'])
        client.table.return_value.upsert.assert_called_once_with(
            rows['leagues'], on_conflict='id', returning='minimal')
        client.table.return_value.upsert.reset_mock()
        response.data[0]['name'] = 'Other League'
        self.assertTrue(seed.upload_references(client, rows)['failures'])
        client.table.return_value.upsert.assert_not_called()

    def test_body_boundaries(self):
        for height, size in [(173, 'Short'), (174, 'Medium'), (184, 'Medium'), (185, 'Tall')]:
            for weight, build in [(height - 113, 'Lean'), (height - 112, 'Average'),
                                  (height - 96, 'Average'), (height - 95, 'Stocky')]:
                self.assertEqual(seed.body_type(height, weight), f'{build} {size}')
        self.assertIsNone(seed.body_type(180, None))
        self.assertIsNone(seed.body_type(None, 70))

    def test_all_acceleration_types(self):
        cases = [((183, 80, 60, 70, 82), 'Lengthy'),
                 ((174, 72, 60, 70, 76), 'Mostly Lengthy'),
                 ((183, 65, 60, 70, 70), 'Controlled Lengthy'),
                 ((175, 60, 80, 82, 70), 'Explosive'),
                 ((180, 60, 72, 76, 70), 'Mostly Explosive'),
                 ((175, 60, 65, 70, 70), 'Controlled Explosive'),
                 ((180, 60, 60, 70, 70), 'Controlled')]
        for values, expected in cases:
            self.assertEqual(seed.accele_type(*values), expected)
        for i in range(5):
            values = [180, 60, 60, 70, 70]
            values[i] = None
            self.assertIsNone(seed.accele_type(*values))
        self.assertEqual(seed.accele_type(183, 72, 60, 70, 76), 'Mostly Lengthy')

    def test_merge_and_null_json(self):
        result = seed.merge_physical(
            [{'player_id': '1', 'height_cm': '180', 'weight_kg': ''}, {'player_id': '2'}],
            [{'player_id': '1', 'height_cm': '190', 'weight_kg': '70'}])
        self.assertEqual((result[1]['height_cm'], result[1]['weight_kg']), (180, 70))
        self.assertIsNone(result[2]['height_cm'])
        self.assertIsNone(result[2]['weight_kg'])
        self.assertIsNone(seed.number('NaN'))
        self.assertIsNone(seed.number('inf'))
        with self.assertRaises(ValueError):
            seed.merge_physical([{'player_id': '1'}, {'player_id': '1'}], [])

    def test_retry_batches_and_failure_dependencies(self):
        client = Mock()
        client.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []
        client.table.return_value.upsert.return_value.execute.side_effect = [
            ConnectionError(), None, None, None]
        tables = {name: [] for name in seed.TABLES}
        tables['card_versions'] = [{'id': i, 'player_id': i, 'card_type': 'normal'} for i in range(1, 102)]
        report = seed.upload(client, tables, attempts=2, sleep=lambda _: None, progress=False)
        self.assertFalse(report['failures'])
        calls = client.table.return_value.upsert.call_args_list
        self.assertEqual([len(c.args[0]) for c in calls], [50, 50, 50, 1])
        self.assertEqual(report['tables']['card_versions']['uploaded'], 101)
        self.assertTrue(all(call.args == ('card_versions',) for call in client.table.call_args_list))
        with self.assertRaises(ValueError):
            seed.upload(client, {'players': []}, progress=False)

    def test_network_errors_backoff_and_continuation(self):
        import httpx
        import httpcore
        errors = [httpx.ReadTimeout('read'), httpx.PoolTimeout('pool'),
                  httpx.RemoteProtocolError('closed'), httpcore.ReadTimeout(),
                  httpcore.ConnectError()]
        client = Mock()
        client.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []
        client.table.return_value.upsert.return_value.execute.side_effect = errors + [None, None]
        tables = {name: [] for name in seed.TABLES}
        tables['card_versions'] = [{'id': i, 'player_id': i, 'card_type': 'normal'} for i in range(1, 52)]
        sleep = Mock()
        with patch('seed.random.uniform', return_value=0):
            report = seed.upload(client, tables, sleep=sleep, progress=False)
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [2, 4, 8, 16, 32])
        self.assertEqual(report['tables']['card_versions']['uploaded'], 51)
        client.table.return_value.upsert.return_value.execute.side_effect = [httpx.ReadTimeout('read')] * 6 + [None]
        report = seed.upload(client, tables, sleep=lambda _: None, progress=False)
        self.assertEqual(report['tables']['card_versions'], {'uploaded': 1, 'not_uploaded': 50})
        self.assertEqual(len(report['failures']), 1)

    def test_http11_transport_and_timeout_used_by_sdk(self):
        import httpx
        actual_client = httpx.Client
        observed = []
        def transport_client(**kwargs):
            observed.append(kwargs)
            kwargs['transport'] = httpx.MockTransport(
                lambda request: httpx.Response(201, json=[]))
            return actual_client(**kwargs)
        with patch('httpx.Client', side_effect=transport_client):
            with seed.stable_client('https://example.supabase.co', 'test-key') as client:
                session = client.postgrest.session
                client.table('card_versions').upsert([{'id': 1, 'player_id': 1, 'card_type': 'normal'}]).execute()
                self.assertEqual(session.timeout.read, 120)
                self.assertEqual(session.timeout.pool, 30)
                self.assertFalse(session.is_closed)
            self.assertTrue(session.is_closed)
        self.assertFalse(observed[0]['http2'])
        self.assertTrue(observed[0]['http1'])
        self.assertEqual(observed[0]['limits'].max_keepalive_connections, 0)

    def test_permanent_failure_and_progress(self):
        from io import StringIO
        client = Mock()
        client.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []
        client.table.return_value.upsert.return_value.execute.side_effect = ValueError('invalid')
        tables = {name: [] for name in seed.TABLES}
        tables['card_versions'] = [{'id': 1, 'player_id': 1, 'card_type': 'normal'}]
        with patch('sys.stderr', new_callable=StringIO) as output:
            report = seed.upload(client, tables)
        self.assertIn('100%', output.getvalue())
        self.assertIn('failed=1', output.getvalue())
        self.assertEqual(client.table.return_value.upsert.call_count, 1)
        self.assertEqual(len(report['failures']), 1)


    def test_rating_boundaries(self):
        for rating, version in [(0, 'Bronze'), (64, 'Bronze'), (65, 'Silver'),
                                (74, 'Silver'), (75, 'Gold'), (99, 'Gold')]:
            self.assertEqual(seed.rating_version(rating), version)
        for rating in (None, '', 'NaN', 74.5, -1, 100):
            with self.assertRaises(ValueError):
                seed.rating_version(rating)

    def test_db_card_types_preserved_and_id_collision_blocked(self):
        client = Mock()
        response = client.table.return_value.select.return_value.in_.return_value.execute.return_value
        response.data = [{'id': i, 'player_id': i, 'card_type': kind}
                         for i, kind in enumerate(['normal', 'icon', 'hero', 'special', None], 1)]
        batch = [{'id': i, 'player_id': i, 'card_type': 'NORMAL', 'version': 'Gold'} for i in range(1, 7)]
        payload = seed.preserve_card_types(client, batch)
        self.assertEqual([row['card_type'] for row in payload], ['normal', 'icon', 'hero', 'special', None, 'NORMAL'])
        self.assertTrue(all(row['version'] == 'Gold' for row in payload))
        self.assertEqual(batch[0]['card_type'], 'NORMAL')
        response.data[0]['player_id'] = 999
        with self.assertRaises(ValueError):
            seed.preserve_card_types(client, batch)
        self.assertFalse(client.table.return_value.upsert.called)

    def test_failed_db_read_never_writes_csv_type(self):
        import httpx
        client = Mock()
        client.table.return_value.select.return_value.in_.return_value.execute.side_effect = httpx.ReadTimeout('read')
        report = seed.upload(client, {'card_versions': [{'id': 1, 'player_id': 1, 'card_type': 'normal'}]},
                             sleep=lambda _: None, progress=False)
        self.assertFalse(client.table.return_value.upsert.called)
        self.assertEqual(len(report['failures']), 1)

    def test_prepare_uses_raw_rating_and_only_card_csv(self):
        raw = [{'player_id': '1', 'overall_rating': '64', 'edition': 'fc27'}]
        templates = [{'id': '7', 'player_id': '1', 'overall': '99', 'version': 'fc27', 'card_type': 'hero'}]
        with patch('seed.read_csv', side_effect=[raw, [], templates]) as read:
            tables = seed.prepare(seed.ROOT / 'players.csv', seed.ROOT / 'fc26.csv', seed.ROOT)
        self.assertEqual(set(tables), {'card_versions'})
        self.assertEqual(tables['card_versions'][0]['overall'], 64)
        self.assertEqual(tables['card_versions'][0]['version'], 'Bronze')
        self.assertEqual(tables['card_versions'][0]['card_type'], 'hero')
        self.assertEqual(read.call_args_list[-1].args[0].name, 'new_card_versions.csv')


if __name__ == '__main__':
    unittest.main()
