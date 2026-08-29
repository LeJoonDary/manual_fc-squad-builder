# FC data bulk sync

`sync_data.py` collects public FC player data concurrently and bulk-upserts
PlayStyles and Roles into Supabase. It is intended to replace manual, player-by-player fixes.

## 1. Install

```bash
python -m pip install aiohttp supabase python-dotenv
```

Use Python 3.11 or newer.

## 2. Environment

Add these server-only values to `.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
FC_DATA_BASE_URL=https://your-public-fc-data-provider.example/api
FC_DATA_API_KEY=optional-provider-key
```

Never use `SERVICE_ROLE_KEY` in `main.js`, Vite variables, browser code, or Git.
The existing `.gitignore` already excludes `.env`.

## 3. Source API contract

The default adapter calls:

```text
GET {FC_DATA_BASE_URL}/players?page=1&limit=500
Authorization: Bearer {FC_DATA_API_KEY}   # only when configured
```

Accepted page envelopes are a raw array or an object using `data`, `players`,
`items`, or `results`. An object may provide `total_pages`, `totalPages`, or
`pages`, either at the root or inside `meta`.

Minimal record:

```json
{
  "name": "Achraf Hakimi",
  "cards": [
    {
      "version": "Gold Rare",
      "overall": 84,
      "playStyles": [
        { "name": "Quick Step", "isPlus": false },
        { "name": "Whipped Pass", "isPlus": false }
      ],
      "roles": [
        { "position": "RB", "name": "Attacking Wingback", "level": 1 }
      ]
    }
  ]
}
```

The normalizer also accepts snake_case, nested Supabase-style relations,
stringified JSON, separate normal/Plus fields, `traits`, `player_roles`, and
Role+/Role++ fields. If the provider uses different pagination or keys, adjust
only `fetch_source_players()`, `normalize_playstyles()`, and `normalize_roles()`.

Cards are matched in this order:

1. `database_card_id`, `card_id`, or `id` when it is a real local card ID.
2. Normalized player name + version + overall.
3. Player name + version when exactly one local card matches.

## 4. Database prerequisites

Upsert conflict targets must have unique constraints. Run once in the Supabase
SQL editor:

```sql
create unique index if not exists playstyles_name_uq
  on playstyles (name);

create unique index if not exists roles_position_name_uq
  on roles (position, role_name);

create unique index if not exists card_playstyles_identity_uq
  on card_playstyles (card_id, playstyle_id, is_plus);

create unique index if not exists card_roles_identity_uq
  on card_roles (card_id, role_id, role_level);

-- Repair an out-of-sync serial/identity sequence before inserting new catalog rows.
select setval(
  pg_get_serial_sequence('playstyles', 'id'),
  coalesce((select max(id) from playstyles), 1),
  true
);

select setval(
  pg_get_serial_sequence('roles', 'id'),
  coalesce((select max(id) from roles), 1),
  true
);
```

The script uses the service-role key because normal anonymous RLS policies should
not permit bulk database writes.

## 5. Run

Always preview first:

```bash
python sync_data.py --dry-run --verbose
```

Then synchronize:

```bash
python sync_data.py --chunk-size 250 --concurrency 8
```

Useful options:

- `--page-size 500`: source API page size.
- `--chunk-size 100..500`: rows per Supabase upsert request.
- `--concurrency 8`: concurrent source pages and DB batches.
- `--retries 3`: retries with exponential backoff for 429/5xx/network failures.
- `--timeout 30`: HTTP timeout in seconds.
- `--dry-run`: read and normalize without writing.

The final log reports matched/unmatched cards, generated relationship rows,
unknown catalog references, and elapsed time. Re-running is safe because every
write uses `upsert()` against stable unique conflict keys.
