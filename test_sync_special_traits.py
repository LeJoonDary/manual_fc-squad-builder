import copy
import json
import unittest

from sync_special_traits import ROOT, normalize, verify


class SpecialTraitsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cards = json.loads((ROOT / 'special_cards.json').read_text(encoding='utf-8'))
        cls.mapping = json.loads((ROOT / 'data/special-trait-mapping.json').read_text(encoding='utf-8'))
        cls.styles = [{'id': int(i) + 1000, 'name': name} for i, name in cls.mapping['playstyles'].items()]
        cls.roles = [{'id': int(i) + 2000, 'position': role['position'], 'role_name': role['name']}
                     for i, role in cls.mapping['roles'].items()]
        cls.versions = [{'id': c['eaId'], 'api_id': c['eaId']} for c in cls.cards]

    def build(self, cards=None, versions=None):
        return normalize(cards if cards is not None else self.cards,
                         versions if versions is not None else self.versions,
                         self.styles, self.roles, self.mapping)

    def test_named_regressions_and_all_cards(self):
        plan, targets, preserved = self.build()
        self.assertEqual(len(targets), 353)
        self.assertEqual(preserved, [])
        self.assertIn({'card_id': 237067, 'role_id': 2043, 'role_level': 2}, plan['card_roles'])
        self.assertIn({'card_id': 237067, 'role_id': 2032, 'role_level': 2}, plan['card_roles'])
        self.assertIn({'card_id': 275243, 'playstyle_id': 1006, 'is_plus': False}, plan['card_playstyles'])
        self.assertIn({'card_id': 37576, 'playstyle_id': 1034, 'is_plus': True}, plan['card_playstyles'])

    def test_empty_category_is_preserved(self):
        cards = copy.deepcopy(self.cards)
        cards[0]['playstyles'] = cards[0]['playstylesPlus'] = []
        plan, _, preserved = self.build(cards)
        self.assertIn({'card_id': cards[0]['eaId'], 'table': 'card_playstyles'}, preserved)
        self.assertFalse(any(r['card_id'] == cards[0]['eaId'] for r in plan['card_playstyles']))

    def test_highest_grade_wins_duplicates(self):
        cards = copy.deepcopy(self.cards)
        cards[0]['playstyles'] += [34, 34]
        cards[0]['rolesPlus'] += [41, 41]
        plan, _, _ = self.build(cards)
        self.assertEqual([r['is_plus'] for r in plan['card_playstyles'] if r['card_id'] == 37576 and r['playstyle_id'] == 1034], [True])
        self.assertEqual([r['role_level'] for r in plan['card_roles'] if r['card_id'] == 37576 and r['role_id'] == 2041], [2])

    def test_unknown_trait_fails(self):
        cards = copy.deepcopy(self.cards)
        cards[0]['playstyles'].append(999)
        with self.assertRaises(KeyError):
            self.build(cards)

    def test_wrong_position_fails(self):
        cards = copy.deepcopy(self.cards)
        cards[0]['rolesPlus'].append(1)
        with self.assertRaises(ValueError):
            self.build(cards)

    def test_missing_card_fails(self):
        with self.assertRaises(ValueError):
            self.build(versions=self.versions[1:])

    def test_verification_detects_duplicate_and_wrong_grade(self):
        plan, _, _ = self.build()
        actual = copy.deepcopy(plan)
        actual['card_roles'].append(actual['card_roles'][0])
        with self.assertRaises(ValueError):
            verify(actual, plan)
        actual = copy.deepcopy(plan)
        actual['card_roles'][0]['role_level'] = 9
        with self.assertRaises(ValueError):
            verify(actual, plan)

    def test_mapping_is_one_to_one(self):
        self.assertEqual(len(set(self.mapping['playstyles'].values())), 40)
        self.assertEqual(self.mapping['playstyles']['10'], 'Jockey')
        self.assertEqual(self.mapping['playstyles']['15'], 'Bruiser')


if __name__ == '__main__':
    unittest.main()
