import unittest
from unittest.mock import Mock, patch

import update_gender as gender


class GenderTests(unittest.TestCase):
    def test_exact_mapping_and_duplicate_rows(self):
        rows = [{'player_id': '10', 'gender': "Men's Football"},
                {'player_id': '20', 'gender': "Women's Football"}]
        self.assertEqual(gender.prepare(rows + rows), {10: 'Male', 20: 'Female'})
        with self.assertRaises(ValueError):
            gender.prepare(rows + [{'player_id': '10', 'gender': "Women's Football"}])
        for value in ('', 'Unknown', 'Male'):
            with self.assertRaises(ValueError):
                gender.prepare([{'player_id': '1', 'gender': value}])

    def test_missing_ids_stop_and_correct_values_are_skipped(self):
        self.assertEqual(gender.plan_updates({1: 'Male', 2: 'Female'},
                                            {1: 'Male', 2: "Women's Football", 3: 'Male'}),
                         {'Male': [], 'Female': [2]})
        with self.assertRaises(ValueError):
            gender.plan_updates({1: 'Male'}, {})

    def test_only_gender_updates_to_players_in_bounded_batches(self):
        client = Mock()
        def execute():
            value = client.table.return_value.update.call_args.args[0]['gender']
            ids = client.table.return_value.update.return_value.in_.call_args.args[1]
            return Mock(data=[{'id': pid, 'gender': value} for pid in ids])
        client.table.return_value.update.return_value.in_.return_value.execute.side_effect = execute
        report = {'updated': 0, 'updated_by_gender': {'Male': 0, 'Female': 0}}
        gender.apply_updates(client, {'Male': list(range(1, 102)), 'Female': [102]}, 50, report)
        self.assertEqual(report['updated'], 102)
        self.assertEqual([len(c.args[1]) for c in client.table.return_value.update.return_value.in_.call_args_list],
                         [50, 50, 1, 1])
        self.assertTrue(all(c.args == ('players',) for c in client.table.call_args_list))
        self.assertTrue(all(set(c.args[0]) == {'gender'} for c in client.table.return_value.update.call_args_list))
        client.table.return_value.insert.assert_not_called()
        client.table.return_value.upsert.assert_not_called()

    def test_at_most_five_retries_and_no_retry_for_invalid_data(self):
        operation = Mock(side_effect=ConnectionError())
        sleep = Mock()
        with patch('update_gender.random.uniform', return_value=0):
            with self.assertRaises(ConnectionError):
                gender.retry(operation, sleep=sleep)
        self.assertEqual(operation.call_count, 6)
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [2, 4, 8, 16, 32])
        operation = Mock(side_effect=ValueError('invalid'))
        with self.assertRaises(ValueError):
            gender.retry(operation, sleep=sleep)
        self.assertEqual(operation.call_count, 1)

    def test_verification_detects_wrong_values_or_changed_ids(self):
        expected, before = {1: 'Male'}, {1: "Men's Football", 2: 'Female'}
        gender.verify(expected, before, {1: 'Male', 2: 'Female'})
        for after in ({1: 'Male'}, {1: 'Male', 2: 'Female', 3: 'Male'},
                      {1: 'Female', 2: 'Female'}, {1: 'Male', 2: 'Male'}):
            with self.assertRaises(ValueError):
                gender.verify(expected, before, after)


if __name__ == '__main__':
    unittest.main()
