import unittest
from unittest.mock import Mock
import seed

class PatchTests(unittest.TestCase):
    def test_patch_only_and_retry(self):
        client=Mock()
        client.table.return_value.update.return_value.eq.return_value.execute.side_effect=[ConnectionError(), Mock(data=[{'id':1}])]
        result=seed.upload(client, {'card_versions':[{'player_id':7,'accele_type':None}]}, sleep=lambda _:None)
        self.assertEqual(result['updated_cards'],1)
        self.assertFalse(result['failures'])
        for call in client.table.call_args_list:
            self.assertEqual(call.args,('card_versions',))
        for call in client.table.return_value.update.call_args_list:
            self.assertEqual(call.args,({'accele_type':None},))
        client.table.return_value.update.return_value.eq.assert_called_with('player_id',7)
        client.table.return_value.upsert.assert_not_called()
        client.table.return_value.insert.assert_not_called()

    def test_paged_read(self):
        client=Mock()
        query=client.table.return_value.select.return_value.order.return_value.range.return_value.execute
        query.side_effect=[Mock(data=[{'id':1}],count=2),Mock(data=[{'id':2}],count=2)]
        self.assertEqual(len(seed.select_all(client,'players','id,height')),2)

    def test_db_height_and_null(self):
        from unittest.mock import patch
        cards=[{'player_id':1},{'player_id':2}]
        raw=[{'player_id':str(i),'height_cm':'190','power_strength':'60','movement_agility':'80','movement_acceleration':'80'} for i in (1,2)]
        with patch('seed.read_csv',return_value=raw),patch('seed.select_all',return_value=[{'id':1,'height':175},{'id':2,'height':None}]):
            seed.prepare_acceleration_types(Mock(),cards,'csv')
        self.assertEqual([c['accele_type'] for c in cards],['Explosive',None])

if __name__=='__main__': unittest.main()
