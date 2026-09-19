import unittest
from unittest.mock import Mock, patch

import seed2


def source(pid=42, rating=75, **extra):
    return {**{name: '60' for name in seed2.STAT_MAP.values()},
            'player_id': str(pid), 'overall_rating': str(rating), 'position': 'ST',
            'alternate_positions': 'ST, CAM LW', 'playstyles': 'Finesse Shot, Finesse Shot+, Cross Catcher',
            **extra}


POSITIONS = [{'id': 1, 'name': 'ST'}, {'id': 2, 'name': 'CAM'}, {'id': 3, 'name': 'LW'}]


class Seed2Tests(unittest.TestCase):
    def test_versions_use_database_card_ids_and_stat_names(self):
        rows = [source(i, score) for i, score in enumerate([64, 65, 74, 75], 1)]
        cards = [{'id': 900 + i, 'player_id': i, 'version': version}
                 for i, version in enumerate(['Bronze', 'Silver', 'Silver', 'Gold'], 1)]
        tables, styles, counts = seed2.prepare(rows, cards, POSITIONS, [])
        self.assertEqual([r['card_id'] for r in tables['player_stats']], [901, 902, 903, 904])
        self.assertEqual(tables['player_stats'][0]['dribbling_sub'], 60)
        self.assertEqual(counts, {'Bronze': 1, 'Silver': 2, 'Gold': 1})
        self.assertEqual(tables['card_positions'][:3], [
            {'card_id': 901, 'position_id': 1, 'is_primary': True},
            {'card_id': 901, 'position_id': 2, 'is_primary': False},
            {'card_id': 901, 'position_id': 3, 'is_primary': False}])
        self.assertEqual(tables['card_playstyles'][0]['is_plus'], True)
        self.assertEqual(styles['crossclaimer'], 'Cross Claimer')
        self.assertEqual(tables['card_roles'], [])

    def test_card_mapping_missing_or_ambiguous_stops(self):
        card = {'id': 7, 'player_id': 42, 'version': 'Gold'}
        for cards in ([], [dict(card, version='Silver')], [card, dict(card, id=8)]):
            with self.assertRaises(ValueError):
                seed2.prepare([source()], cards, POSITIONS, [])

    def test_roles_only_from_explicit_source(self):
        cards = [{'id': 7, 'player_id': 42, 'version': 'Gold'}]
        roles = [{'id': 10, 'position': 'ST', 'role_name': 'Advanced Forward'}]
        tables, _, _ = seed2.prepare([source(roles='ST: Advanced Forward++')], cards, POSITIONS, roles)
        self.assertEqual(tables['card_roles'], [{'card_id': 7, 'role_id': 10, 'role_level': 2}])
        with self.assertRaises(ValueError):
            seed2.prepare([source(roles='Unknown Role')], cards, POSITIONS, roles)

    def test_invalid_stats_and_positions_fail_preflight(self):
        cards = [{'id': 7, 'player_id': 42, 'version': 'Gold'}]
        for row in (source(pace=''), source(shooting='100'), source(position='XYZ')):
            with self.assertRaises(ValueError):
                seed2.prepare([row], cards, POSITIONS, [])

    def test_pagination_continues_after_short_server_page(self):
        client = Mock()
        execute = client.table.return_value.select.return_value.order.return_value.range.return_value.execute
        execute.side_effect = [Mock(data=[{'id': 1}]), Mock(data=[{'id': 2}]), Mock(data=[])]
        self.assertEqual(seed2.fetch_all(client, 'positions'), [{'id': 1}, {'id': 2}])

    def test_retry_only_transient_errors(self):
        operation = Mock(side_effect=[ConnectionError(), 7])
        sleep = Mock()
        self.assertEqual(seed2.retry(operation, sleep=sleep), 7)
        sleep.assert_called_once()
        operation = Mock(side_effect=ValueError('invalid'))
        with self.assertRaises(ValueError):
            seed2.retry(operation, sleep=sleep)
        self.assertEqual(operation.call_count, 1)

    def test_lost_insert_response_is_reconciled_before_retry(self):
        client = Mock()
        client.table.return_value.insert.return_value.execute.side_effect = ConnectionError()
        rows = [{'card_id': 7, 'pac': 60}]
        with patch('seed2.fetch_all', side_effect=[[], [dict(rows[0], id=100)]]), \
             patch('seed2.retry', side_effect=lambda op, attempts: retry_no_sleep(op, attempts)):
            seed2.write_batch(client, 'player_stats', rows, 2, {'player_stats': 'primary_id'})
        self.assertEqual(client.table.return_value.insert.call_count, 1)

    def test_upload_batches_and_verify_all_values(self):
        rows = [{'card_id': i, 'pac': 60} for i in range(1, 102)]
        report = {'tables': {}, 'write_modes': {}}
        with patch('seed2.fetch_all', side_effect=[[], [dict(r, id=i) for i, r in enumerate(rows)]]), \
             patch('seed2.write_batch') as write:
            seed2.upload(Mock(), {'player_stats': rows}, 50, 6, report)
        self.assertEqual([len(c.args[2]) for c in write.call_args_list], [50, 50, 1])
        self.assertEqual(report['tables']['player_stats']['verified'], 101)

    def test_missing_unique_constraint_uses_existing_primary_id(self):
        class NoUniqueConstraint(Exception):
            code = '42P10'
        client = Mock()
        client.table.return_value.upsert.return_value.execute.side_effect = [NoUniqueConstraint(), None]
        rows = [{'card_id': 7, 'pac': 61}]
        modes = {}
        with patch('seed2.fetch_all', return_value=[{'id': 99, 'card_id': 7, 'pac': 60}]):
            seed2.write_batch(client, 'player_stats', rows, 6, modes)
        self.assertEqual(modes['player_stats'], 'primary_id')
        self.assertEqual(client.table.return_value.upsert.call_args.kwargs['on_conflict'], 'id')
        self.assertEqual(client.table.return_value.upsert.call_args.args[0][0]['id'], 99)
        client.table.return_value.insert.assert_not_called()

    def test_missing_playstyle_is_created_and_resolved(self):
        client = Mock()
        with patch('seed2.fetch_all', side_effect=[[], [], [{'id': 77, 'name': 'New Style'}]]):
            result = seed2.ensure_styles(client, {'newstyle': 'New Style'}, 6, 50)
        self.assertEqual(result, {'newstyle': 77})
        client.table.return_value.insert.assert_called_once_with(
            [{'name': 'New Style'}], returning='minimal')


retry_no_sleep = lambda operation, attempts: ORIGINAL_RETRY(operation, attempts, sleep=lambda _: None)
ORIGINAL_RETRY = seed2.retry

if __name__ == '__main__':
    unittest.main()
