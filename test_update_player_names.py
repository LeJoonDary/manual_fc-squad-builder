import unittest
from unittest.mock import Mock, patch
from update_player_names import patch_player

class NamePatchTests(unittest.TestCase):
    def test_exact_id_and_only_names(self):
        client = Mock()
        client.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {'id': 123, 'name': 'Short', 'long_name': 'Full', 'height': 190}]
        self.assertTrue(patch_player(client,123,{'name':'Short','long_name':'Full','height':1}))
        client.table.assert_called_once_with('players')
        client.table.return_value.update.assert_called_once_with({'name':'Short','long_name':'Full'})
        client.table.return_value.update.return_value.eq.assert_called_once_with('id',123)
        client.table.return_value.insert.assert_not_called()
        client.table.return_value.upsert.assert_not_called()

    def test_missing_player_never_inserted(self):
        client=Mock()
        client.table.return_value.update.return_value.eq.return_value.execute.return_value.data=[]
        self.assertFalse(patch_player(client,123,{'name':'Short','long_name':'Full'}))
        client.table.return_value.insert.assert_not_called()
        client.table.return_value.upsert.assert_not_called()

if __name__=='__main__': unittest.main()
