import unittest
from unittest.mock import MagicMock
from fetch_youtube_reviews import collect, choose_review, missing_cards


class ReviewTests(unittest.TestCase):
    def test_success_upserts_review_for_card(self):
        from unittest.mock import patch
        db, youtube = MagicMock(), MagicMock()
        youtube.search.return_value.list.return_value.execute.return_value = {'items': [{
            'id': {'videoId': 'abcdefghijk'}, 'snippet': {
                'title': 'FC 26 Pelé review shorts', 'channelTitle': 'Reviewer',
                'thumbnails': {'high': {'url': 'https://example.com/thumb.jpg'}}}}]}
        with patch('fetch_youtube_reviews.missing_cards', return_value=[{
                'id': 123, 'overall': 95, 'players': {'name': 'Pelé'}}]):
            self.assertEqual(collect(db, youtube, 25), 0)
        db.table.assert_called_once_with('card_reviews')
        data = db.table.return_value.upsert.call_args.args[0]
        self.assertEqual(data['card_id'], 123)
        self.assertEqual(data['youtube_video_id'], 'abcdefghijk')
        self.assertEqual(data['channel_title'], 'Reviewer')
        self.assertEqual(db.table.return_value.upsert.call_args.kwargs, {'on_conflict': 'card_id'})

    def test_missing_query_is_ordered_and_bounded(self):
        db = MagicMock()
        query = db.table.return_value
        for method in ('select', 'gte', 'is_', 'order', 'limit'):
            getattr(query, method).return_value = query
        query.execute.return_value.data = []
        self.assertEqual(missing_cards(db, 25), [])
        query.is_.assert_called_once_with('card_reviews', 'null')
        query.limit.assert_called_once_with(25)
        query.order.assert_any_call('overall', desc=True)

    def test_selection_prefers_relevant_review(self):
        items = [{'id': {'videoId': 'abcdefghijk'}, 'snippet': {'title': 'Other player'}},
                 {'id': {'videoId': '12345678901'}, 'snippet': {'title': 'FC 26 Pele review #shorts'}}]
        self.assertEqual(choose_review(items, 'Pelé'), items[1])

    def test_network_failure_continues_but_quota_stops(self):
        from unittest.mock import patch
        cards = [{'id': i, 'overall': 90, 'players': {'name': 'Pelé'}} for i in range(3)]
        for quota in (False, True):
            with self.subTest(quota=quota), patch('fetch_youtube_reviews.missing_cards', return_value=cards):
                db, youtube = MagicMock(), MagicMock()
                error = OSError('network')
                if quota:
                    error.content = b'{"error":{"errors":[{"reason":"quotaExceeded"}]}}'
                youtube.search.return_value.list.return_value.execute.side_effect = [error, {'items': []}, {'items': []}]
                self.assertEqual(collect(db, youtube, 3), 1)
                self.assertEqual(youtube.search.return_value.list.call_count, 1 if quota else 3)
                db.table.assert_not_called()


if __name__ == '__main__':
    unittest.main()
