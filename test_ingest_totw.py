import unittest
from unittest.mock import patch
from types import SimpleNamespace

import ingest_totw as totw


URL = 'https://www.fut.gg/players/262642-zeki-amdouni/27-50594290/'


class CardOwnershipTests(unittest.TestCase):
  def parse(self, fields):
    # A global dictionary and another card must never supply ownership.
    text = '''<script>
      dictionary:{playstyles:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,
        17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33]},
      playerDef:{eaId:123,position:0,alternativePositionIds:[7],
        rolesPlus:[1],rolesPlusPlus:[],playstyles:[0],playstylesPlus:[]},
      playerDef:$R[19]={eaId:50594290,position:25,''' + fields + '}</script>'
    with patch.object(totw.requests, 'get', return_value=SimpleNamespace(status_code=200, text=text)):
      return totw.parse_card_page(URL)

  def test_serialized_arrays_and_dictionary_isolation(self):
    card = self.parse('''alternativePositionIds:$R[23]=[18,18,25],
      rolesPlus:$R[26]=[31],rolesPlusPlus:$R[27]=[131,144],
      playstyles:$R[24]=[34,5,16],playstylesPlus:$R[25]=[16]''')
    self.assertEqual(card['secondary_pos_ids'], [5])
    self.assertEqual(card['roles'], [{'role_id': 13, 'level': 2}, {'role_id': 4, 'level': 2}])
    self.assertEqual(card['playstyles'], [
      {'playstyle_id': 37, 'is_plus': False},
      {'playstyle_id': 4, 'is_plus': False},
      {'playstyle_id': 7, 'is_plus': True}])

  def test_empty_arrays_and_aliases(self):
    card = self.parse('''alternativePositionIds:[],rolesPlus:[],rolesPlusPlus:[],
      playStyleEaIds:[],playStylePlusEaIds:[]''')
    self.assertEqual(card['secondary_pos_ids'], [])
    self.assertEqual(card['roles'], [])
    self.assertEqual(card['playstyles'], [])

  def test_unresolved_or_missing_arrays_fail_instead_of_erasing_traits(self):
    for value in ('$R[99]', '{}', '[true]'):
      with self.subTest(value=value), self.assertRaises(ValueError):
        self.parse(f'alternativePositionIds:{value}')

  def test_wrong_card_fails(self):
    with self.assertRaises(ValueError):
      totw.player_def_fields('playerDef:{eaId:1}', 50594290)


if __name__ == '__main__':
  unittest.main()
