# YouTube card reviews

1. Apply `supabase/migrations/202610040001_card_reviews.sql` to your Supabase database. It creates one review per card, a foreign key used by the missing-review query, and public read access. Writes use the service role only. If a review table already exists outside this repository, reconcile its schema before applying this migration.
2. Install: `python -m pip install -r requirements-youtube.txt`.
3. Set `YOUTUBE_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the root `.env`. Enable YouTube Data API v3 for the key. Never prefix the service key with `VITE_` or expose it in browser code.
4. Run `python fetch_youtube_reviews.py --limit 25` (25 is the default).

Cards with OVR >= 84 and no existing review are selected on the server, ordered by overall descending and ID ascending. Each selected card uses at most one search; failed requests are not retried. At a budget of 100 units/search, the default reserves up to 2,500 units. The 1–100 limit is per invocation, not a shared daily quota tracker: repeated runs and other clients also consume quota. Quota errors stop cleanly; other card errors are logged and skipped. Exit code 1 indicates a failure. Cards without results remain eligible for later runs.

Search uses `FC 26 {player_name} review shorts` and takes the best title match from three embeddable results. Titles matching the player, FC 26, review and shorts rank higher; ties preserve API relevance order. This is a heuristic: different card versions of the same player can share a result.

YouTube's `videoDuration=short` means under four minutes, not verified Shorts or verified portrait orientation. The API search cannot guarantee a true Short. See [official search documentation](https://developers.google.com/youtube/v3/docs/search/list). The UI displays results in a 9:16 player. Autoplay and playback remain subject to browser and YouTube restrictions.

The browser uses its existing anonymous Supabase client to read `card_reviews`; missing, failed or invalid review results keep the button hidden. Escape closes only the top review dialog, and closing the detail panel removes the iframe.

Checks: `npm test -- components/PlayerDetailModal.test.js`, `python -m unittest test_fetch_youtube_reviews.py`, and `npm run build`.
