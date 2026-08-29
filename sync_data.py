#!/usr/bin/env python3
"""Bulk-sync FC PlayStyles and Roles into Supabase.

Install:
    pip install aiohttp supabase python-dotenv

Configure `.env` (never expose the service key to browser code):
    SUPABASE_URL=https://YOUR_PROJECT.supabase.co
    SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
    FC_DATA_BASE_URL=https://your-public-fc-data-provider.example/api
    FC_DATA_API_KEY=optional-provider-key

Run:
    python sync_data.py --dry-run
    python sync_data.py --chunk-size 250 --concurrency 8

The source adapter expects GET `${FC_DATA_BASE_URL}/players?page=1&limit=500`.
See SYNC_DATA_README.md for the accepted JSON shape and DB prerequisites.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
import unicodedata
from dataclasses import dataclass
from typing import Any, Iterable, Iterator, Sequence, TypeVar

import aiohttp
from dotenv import load_dotenv
from supabase import Client, create_client

T = TypeVar("T")
LOG = logging.getLogger("fc-sync")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    service_role_key: str
    source_url: str
    source_api_key: str | None
    page_size: int
    chunk_size: int
    concurrency: int
    timeout_seconds: int
    retries: int
    dry_run: bool


@dataclass(frozen=True)
class CardKey:
    player_name: str
    version: str
    overall: int | None


def chunks(items: Sequence[T], size: int) -> Iterator[list[T]]:
    for start in range(0, len(items), size):
        yield list(items[start : start + size])


def normalized_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(char for char in text if not unicodedata.combining(char)).strip().casefold()


def parse_json_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not stripped:
        return []
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return stripped


def as_list(value: Any) -> list[Any]:
    parsed = parse_json_value(value)
    if parsed is None or parsed == "":
        return []
    return parsed if isinstance(parsed, list) else [parsed]


def first(record: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if record.get(key) is not None:
            return record[key]
    return default


def normalize_playstyles(card: dict[str, Any]) -> list[dict[str, Any]]:
    result: dict[tuple[str, bool], dict[str, Any]] = {}

    def add(source: Any, forced_plus: bool | None = None) -> None:
        for item in as_list(source):
            item = parse_json_value(item)
            if isinstance(item, list):
                add(item, forced_plus)
                continue
            if isinstance(item, str):
                name, is_plus = item.rstrip("+").strip(), forced_plus if forced_plus is not None else item.endswith("+")
            elif isinstance(item, dict):
                relation = first(item, "playstyles", "playStyles", "play_styles", "playstyle", "trait", default=item)
                if isinstance(relation, list):
                    add(relation, forced_plus)
                    continue
                source_object = relation if isinstance(relation, dict) else item
                name = first(source_object, "name", "playstyle_name", "playStyleName", "trait_name", "label")
                is_plus = forced_plus if forced_plus is not None else bool(
                    first(item, "is_plus", "isPlus", "plus", default=first(source_object, "is_plus", "isPlus", "plus", default=False))
                )
            else:
                continue
            if not name:
                continue
            clean_name = str(name).rstrip("+").strip()
            key = (normalized_text(clean_name), bool(is_plus) or str(name).endswith("+"))
            result[key] = {"name": clean_name, "is_plus": key[1]}

    for key in ("card_playstyles", "playstyles", "playStyles", "play_styles", "traits"):
        add(card.get(key))
    for key in ("normalPlayStyles", "normal_playstyles", "normal_play_styles"):
        add(card.get(key), False)
    for key in ("playStylePlus", "playStylesPlus", "play_style_plus", "play_styles_plus"):
        add(card.get(key), True)
    return list(result.values())


def normalize_roles(card: dict[str, Any]) -> list[dict[str, Any]]:
    result: dict[tuple[str, str, int], dict[str, Any]] = {}

    def add(source: Any, forced_level: int | None = None) -> None:
        for item in as_list(source):
            item = parse_json_value(item)
            if isinstance(item, list):
                add(item, forced_level)
                continue
            if isinstance(item, str):
                position, name = "", item.rstrip("+").strip()
                level = forced_level or (2 if item.endswith("++") else 1)
            elif isinstance(item, dict):
                relation = first(item, "roles", "role", "player_roles", "role_data", default=item)
                if isinstance(relation, list):
                    add(relation, forced_level)
                    continue
                source_object = relation if isinstance(relation, dict) else item
                position = first(source_object, "position", "pos", default=first(item, "position", default=""))
                name = first(source_object, "role_name", "roleName", "name", "label")
                raw_level = forced_level or first(item, "role_level", "roleLevel", "level", default=first(source_object, "level", default=1))
                level = 2 if str(raw_level) in {"2", "++", "Role++"} else 1
            else:
                continue
            if not name:
                continue
            clean_name = str(name).rstrip("+").strip()
            key = (normalized_text(position), normalized_text(clean_name), level)
            result[key] = {"position": str(position or "").strip(), "name": clean_name, "level": level}

    for key in ("card_roles", "roles", "player_roles"):
        add(card.get(key))
    for key in ("role_plus", "roles_plus", "rolePlus", "rolesPlus"):
        add(card.get(key), 1)
    for key in ("role_plus_plus", "roles_plus_plus", "rolePlusPlus", "rolesPlusPlus"):
        add(card.get(key), 2)
    return list(result.values())


async def request_json(session: aiohttp.ClientSession, url: str, params: dict[str, Any], settings: Settings) -> Any:
    for attempt in range(settings.retries + 1):
        try:
            async with session.get(url, params=params) as response:
                if response.status == 429 or response.status >= 500:
                    raise aiohttp.ClientResponseError(
                        response.request_info, response.history, status=response.status, message=await response.text()
                    )
                response.raise_for_status()
                return await response.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError):
            if attempt >= settings.retries:
                raise
            await asyncio.sleep(min(8, 0.5 * (2**attempt)))


def unpack_page(payload: Any) -> tuple[list[dict[str, Any]], int | None]:
    if isinstance(payload, list):
        return payload, None
    if not isinstance(payload, dict):
        raise ValueError("Source response must be a list or object")
    rows = first(payload, "data", "players", "items", "results", default=[])
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else payload
    total_pages = first(meta, "total_pages", "totalPages", "pages")
    return [row for row in as_list(rows) if isinstance(row, dict)], int(total_pages) if total_pages else None


async def fetch_source_players(settings: Settings) -> list[dict[str, Any]]:
    headers = {"Accept": "application/json"}
    if settings.source_api_key:
        headers["Authorization"] = f"Bearer {settings.source_api_key}"
    timeout = aiohttp.ClientTimeout(total=settings.timeout_seconds)
    connector = aiohttp.TCPConnector(limit=settings.concurrency)
    url = settings.source_url.rstrip("/") + "/players"
    async with aiohttp.ClientSession(headers=headers, timeout=timeout, connector=connector) as session:
        first_payload = await request_json(session, url, {"page": 1, "limit": settings.page_size}, settings)
        first_rows, total_pages = unpack_page(first_payload)
        if not total_pages and len(first_rows) < settings.page_size:
            return first_rows
        if not total_pages:
            rows = list(first_rows)
            page = 2
            while True:
                payload = await request_json(session, url, {"page": page, "limit": settings.page_size}, settings)
                page_rows, _ = unpack_page(payload)
                rows.extend(page_rows)
                if len(page_rows) < settings.page_size:
                    return rows
                page += 1
        if total_pages <= 1:
            return first_rows
        semaphore = asyncio.Semaphore(settings.concurrency)

        async def fetch_page(page: int) -> list[dict[str, Any]]:
            async with semaphore:
                payload = await request_json(session, url, {"page": page, "limit": settings.page_size}, settings)
                rows, _ = unpack_page(payload)
                return rows

        pages = await asyncio.gather(*(fetch_page(page) for page in range(2, total_pages + 1)))
        return first_rows + [row for page in pages for row in page]


def load_database_cards(client: Client) -> dict[CardKey, int]:
    result: dict[CardKey, int] = {}
    offset, page_size = 0, 1000
    while True:
        response = (
            client.table("card_versions")
            .select("id,version,overall,players(name)")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = response.data or []
        for row in rows:
            player = row.get("players") or {}
            if isinstance(player, list):
                player = player[0] if player else {}
            key = CardKey(normalized_text(player.get("name")), normalized_text(row.get("version")), row.get("overall"))
            result[key] = int(row["id"])
        if len(rows) < page_size:
            break
        offset += page_size
    return result


def iter_source_cards(players: Iterable[dict[str, Any]]) -> Iterator[tuple[dict[str, Any], dict[str, Any]]]:
    for player in players:
        cards = first(player, "cards", "card_versions", "cardVersions")
        if cards is None:
            cards = [player]
        for card in as_list(cards):
            if isinstance(card, dict):
                yield player, card


def match_card_id(
    player: dict[str, Any], card: dict[str, Any], database_cards: dict[CardKey, int], database_card_ids: set[int]
) -> int | None:
    explicit_id = first(card, "database_card_id", "card_id", "id")
    try:
        numeric_id = int(explicit_id) if explicit_id is not None else None
    except (TypeError, ValueError):
        numeric_id = None
    if numeric_id is not None and numeric_id in database_card_ids:
        return numeric_id
    name = first(card, "player_name", "playerName", default=first(player, "name", "player_name", "playerName"))
    version = first(card, "version", "rarity", "card_type", default="Gold Rare")
    overall = first(card, "overall", "ovr", "rating")
    exact = CardKey(normalized_text(name), normalized_text(version), int(overall) if overall is not None else None)
    if exact in database_cards:
        return database_cards[exact]
    candidates = [card_id for key, card_id in database_cards.items() if key.player_name == exact.player_name and key.version == exact.version]
    return candidates[0] if len(candidates) == 1 else None


def upsert_catalogs(client: Client, playstyle_names: set[str], roles: set[tuple[str, str]]) -> tuple[dict[str, int], dict[tuple[str, str], int]]:
    if playstyle_names:
        client.table("playstyles").upsert(
            [{"name": name} for name in sorted(playstyle_names)], on_conflict="name"
        ).execute()
    if roles:
        client.table("roles").upsert(
            [{"position": position, "role_name": name} for position, name in sorted(roles)],
            on_conflict="position,role_name",
        ).execute()
    playstyle_rows = client.table("playstyles").select("id,name").execute().data or []
    role_rows = client.table("roles").select("id,position,role_name").execute().data or []
    return (
        {normalized_text(row["name"]): int(row["id"]) for row in playstyle_rows},
        {(normalized_text(row["position"]), normalized_text(row["role_name"])): int(row["id"]) for row in role_rows},
    )


async def parallel_upsert(settings: Settings, table: str, rows: list[dict[str, Any]], on_conflict: str) -> int:
    if not rows or settings.dry_run:
        return len(rows)
    semaphore = asyncio.Semaphore(settings.concurrency)

    async def write(batch: list[dict[str, Any]]) -> int:
        async with semaphore:
            def execute() -> None:
                client = create_client(settings.supabase_url, settings.service_role_key)
                client.table(table).upsert(batch, on_conflict=on_conflict).execute()

            await asyncio.to_thread(execute)
            return len(batch)

    return sum(await asyncio.gather(*(write(batch) for batch in chunks(rows, settings.chunk_size))))


async def sync(settings: Settings) -> None:
    started = time.perf_counter()
    client = create_client(settings.supabase_url, settings.service_role_key)
    database_cards = await asyncio.to_thread(load_database_cards, client)
    source_players = await fetch_source_players(settings)
    LOG.info("Loaded %s DB cards and %s source players", len(database_cards), len(source_players))

    matched: list[tuple[int, list[dict[str, Any]], list[dict[str, Any]]]] = []
    unmatched = 0
    database_card_ids = set(database_cards.values())
    for player, card in iter_source_cards(source_players):
        card_id = match_card_id(player, card, database_cards, database_card_ids)
        if card_id is None:
            unmatched += 1
            continue
        matched.append((card_id, normalize_playstyles(card), normalize_roles(card)))

    playstyle_names = {item["name"] for _, styles, _ in matched for item in styles}
    role_names = {(item["position"], item["name"]) for _, _, roles in matched for item in roles if item["position"]}
    if settings.dry_run:
        existing_styles = client.table("playstyles").select("id,name").execute().data or []
        existing_roles = client.table("roles").select("id,position,role_name").execute().data or []
        playstyle_ids = {normalized_text(row["name"]): int(row["id"]) for row in existing_styles}
        role_ids = {(normalized_text(row["position"]), normalized_text(row["role_name"])): int(row["id"]) for row in existing_roles}
    else:
        playstyle_ids, role_ids = await asyncio.to_thread(upsert_catalogs, client, playstyle_names, role_names)

    playstyle_links: dict[tuple[int, int, bool], dict[str, Any]] = {}
    role_links: dict[tuple[int, int, int], dict[str, Any]] = {}
    unknown_catalog = 0
    for card_id, styles, roles in matched:
        for style in styles:
            style_id = playstyle_ids.get(normalized_text(style["name"]))
            if style_id is None:
                unknown_catalog += 1
                continue
            key = (card_id, style_id, bool(style["is_plus"]))
            playstyle_links[key] = {"card_id": card_id, "playstyle_id": style_id, "is_plus": key[2]}
        for role in roles:
            role_id = role_ids.get((normalized_text(role["position"]), normalized_text(role["name"])))
            if role_id is None:
                unknown_catalog += 1
                continue
            key = (card_id, role_id, int(role["level"]))
            role_links[key] = {"card_id": card_id, "role_id": role_id, "role_level": key[2]}

    style_count, role_count = await asyncio.gather(
        parallel_upsert(settings, "card_playstyles", list(playstyle_links.values()), "card_id,playstyle_id,is_plus"),
        parallel_upsert(settings, "card_roles", list(role_links.values()), "card_id,role_id,role_level"),
    )
    LOG.info(
        "%s: matched=%s unmatched=%s playstyle_links=%s role_links=%s unknown_catalog=%s elapsed=%.2fs",
        "DRY RUN" if settings.dry_run else "SYNCED",
        len(matched), unmatched, style_count, role_count, unknown_catalog, time.perf_counter() - started,
    )


def read_settings(args: argparse.Namespace) -> Settings:
    load_dotenv()
    required = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SERVICE_ROLE_KEY": os.getenv("SERVICE_ROLE_KEY"),
        "FC_DATA_BASE_URL": os.getenv("FC_DATA_BASE_URL"),
    }
    missing = [key for key, value in required.items() if not value]
    if missing:
        raise SystemExit(f"Missing environment variables: {', '.join(missing)}")
    return Settings(
        supabase_url=required["SUPABASE_URL"] or "",
        service_role_key=required["SERVICE_ROLE_KEY"] or "",
        source_url=required["FC_DATA_BASE_URL"] or "",
        source_api_key=os.getenv("FC_DATA_API_KEY"),
        page_size=args.page_size,
        chunk_size=args.chunk_size,
        concurrency=args.concurrency,
        timeout_seconds=args.timeout,
        retries=args.retries,
        dry_run=args.dry_run,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bulk-sync FC Roles and PlayStyles to Supabase")
    parser.add_argument("--page-size", type=int, default=500)
    parser.add_argument("--chunk-size", type=int, default=250, choices=range(100, 501), metavar="100..500")
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        asyncio.run(sync(read_settings(args)))
        return 0
    except KeyboardInterrupt:
        return 130
    except Exception:
        LOG.exception("Sync failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
