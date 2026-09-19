import unittest
from unittest.mock import Mock
import update_nation_flags as flags


class FlagTests(unittest.TestCase):
    def resolver(self, catalog):
        http = Mock()
        http.get.return_value.json.return_value = catalog
        return flags.FlagResolver(http), http

    def test_exact_names_and_single_cached_api_request(self):
        resolver, http = self.resolver({'no': 'Norway', 'am': 'Armenia'})
        for _ in range(3):
            self.assertEqual(resolver.resolve('Norway')['flag_url'], 'https://flagcdn.com/no.svg')
        self.assertEqual(resolver.resolve('Armenia')['flag_url'], 'https://flagcdn.com/am.svg')
        http.get.assert_called_once_with(flags.CATALOG_URL)
        self.assertEqual(len(resolver.cache), 2)

    def test_special_countries_and_congo_disambiguation(self):
        resolver, _ = self.resolver({'gb-eng': 'England', 'gb-wls': 'Wales', 'gb-sct': 'Scotland',
            'gb-nir': 'Northern Ireland', 'nl': 'Netherlands', 'kr': 'South Korea',
            'cd': 'DR Congo', 'cg': 'Republic of the Congo'})
        for name, code in [('England', 'gb-eng'), ('Wales', 'gb-wls'), ('Scotland', 'gb-sct'),
                           ('Northern Ireland', 'gb-nir'), ('Holland', 'nl'), ('Korea Republic', 'kr'),
                           ('Congo DR', 'cd'), ('Congo', 'cg')]:
            self.assertEqual(resolver.resolve(name)['code'], code)

    def test_never_fuzzy_matches_or_uses_us_state_flags(self):
        resolver, _ = self.resolver({'ge': 'Georgia', 'us-ga': 'Georgia', 'gn': 'Guinea'})
        self.assertEqual(resolver.resolve('Georgia')['code'], 'ge')
        with self.assertRaises(ValueError):
            resolver.resolve('Guinea-Bissau')

    def test_update_only_flag_url_on_exact_nation(self):
        db = Mock()
        row = {'id': 3, 'name': 'Norway', 'flag_url': 'https://flagcdn.com/no.svg'}
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = [row]
        flags.update_one(db, row)
        db.table.assert_called_once_with('nations')
        db.table.return_value.update.assert_called_once_with({'flag_url': row['flag_url']})
        db.table.return_value.insert.assert_not_called()
        db.table.return_value.upsert.assert_not_called()

    def test_verification_checks_every_other_column_and_row_count(self):
        before = [{'id': 3, 'name': 'Norway', 'flag_url': 'old', 'extra': 'keep'}]
        plan = [{'id': 3, 'flag_url': 'new'}]
        flags.verify(before, [{**before[0], 'flag_url': 'new'}], plan)
        for after in ([], [{**before[0], 'flag_url': 'new', 'extra': 'changed'}]):
            with self.assertRaises(ValueError):
                flags.verify(before, after, plan)


if __name__ == '__main__':
    unittest.main()
