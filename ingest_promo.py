"""Promo ingestion: python ingest_promo.py <file.json> [--check | --verify].
Requires psycopg[binary], requests, Pillow, python-dotenv.
Uses DATABASE_URL (or the linked Supabase pooler). All relational writes are atomic.
Storage uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY.
A summary JSON is enriched from its exact FUT.GG card URL when details are absent.
No player is inserted, no missing statistic is invented, and source JSON is untouched.
The existing schema is preserved: foot is card_versions.preferred_foot;
nation remains players.nation_id. Only players.height/weight are updated.
Body types are inherited verbatim from the player's Gold card, including reruns.
Templates are cropped, saved locally and uploaded to card-templates with upsert.
New and existing promo cards are linked to the template's public background_url.
"""
import io
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import unquote, urlsplit

# Reuse this workspace's existing optional dependency bundle when available.
ROOT = Path(__file__).resolve().parent
if (ROOT / ".sync-deps").is_dir():
    sys.path.insert(0, str(ROOT / ".sync-deps"))
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
import requests
from dotenv import load_dotenv
from PIL import Image

# Verified FUT.GG EA IDs, resolved to DB IDs by name (not assumed equal).
TRAIT_MAPPING = {'source': 'https://assets.fut.gg/ts/assets/index-CRBXmESA.js',
 'sha256': '28331abcca9ece70a7ade436da4e8d6eba43fc1e28cc91925b5b6520f9fec0a0',
 'playstyles': {'0': 'Finesse Shot',
                '1': 'Chip Shot',
                '2': 'Power Shot',
                '3': 'Dead Ball',
                '4': 'Power Header',
                '5': 'Incisive Pass',
                '6': 'Pinged Pass',
                '7': 'Long Ball Pass',
                '8': 'Tiki Taka',
                '9': 'Whipped Pass',
                '10': 'Jockey',
                '11': 'Block',
                '12': 'Intercept',
                '13': 'Anticipate',
                '14': 'Slide Tackle',
                '15': 'Bruiser',
                '16': 'Technical',
                '17': 'Rapid',
                '18': 'Flair',
                '19': 'First Touch',
                '20': 'Trickster',
                '21': 'Press Proven',
                '22': 'Quick Step',
                '23': 'Relentless',
                '24': 'Trivela',
                '25': 'Acrobatic',
                '26': 'Long Throw',
                '27': 'Aerial',
                '28': 'Far Throw',
                '29': 'Footwork',
                '30': 'Cross Claimer',
                '31': 'Rush Out',
                '32': 'Far Reach',
                '33': 'Deflector',
                '34': 'Low Driven Shot',
                '35': 'Aerial Fortress',
                '36': 'Enforcer',
                '37': 'Gamechanger',
                '38': 'Inventive',
                '39': 'Precision Header'},
 'roles': {'1': {'position': 'GK', 'name': 'Goalkeeper'},
           '2': {'position': 'GK', 'name': 'Sweeper Keeper'},
           '45': {'position': 'GK', 'name': 'Ball Playing Keeper'},
           '3': {'position': 'RB', 'name': 'Fullback'},
           '4': {'position': 'RB', 'name': 'Falseback'},
           '5': {'position': 'RB', 'name': 'Wingback'},
           '6': {'position': 'RB', 'name': 'Attacking Wingback'},
           '46': {'position': 'RB', 'name': 'Inverted Wingback'},
           '7': {'position': 'LB', 'name': 'Fullback'},
           '8': {'position': 'LB', 'name': 'Falseback'},
           '9': {'position': 'LB', 'name': 'Wingback'},
           '10': {'position': 'LB', 'name': 'Attacking Wingback'},
           '47': {'position': 'LB', 'name': 'Inverted Wingback'},
           '11': {'position': 'CB', 'name': 'Defender'},
           '12': {'position': 'CB', 'name': 'Stopper'},
           '13': {'position': 'CB', 'name': 'Ball Playing Defender'},
           '48': {'position': 'CB', 'name': 'Wideback'},
           '14': {'position': 'CDM', 'name': 'Holding'},
           '15': {'position': 'CDM', 'name': 'Centre Half'},
           '16': {'position': 'CDM', 'name': 'Deep Lying Playmaker'},
           '17': {'position': 'CDM', 'name': 'Wide Half'},
           '49': {'position': 'CDM', 'name': 'Box Crasher'},
           '18': {'position': 'CM', 'name': 'Box To Box'},
           '19': {'position': 'CM', 'name': 'Holding'},
           '20': {'position': 'CM', 'name': 'Deep Lying Playmaker'},
           '21': {'position': 'CM', 'name': 'Playmaker'},
           '22': {'position': 'CM', 'name': 'Half Winger'},
           '23': {'position': 'RM', 'name': 'Winger'},
           '24': {'position': 'RM', 'name': 'Wide Midfielder'},
           '25': {'position': 'RM', 'name': 'Wide Playmaker'},
           '26': {'position': 'RM', 'name': 'Inside Forward'},
           '27': {'position': 'LM', 'name': 'Winger'},
           '28': {'position': 'LM', 'name': 'Wide Midfielder'},
           '29': {'position': 'LM', 'name': 'Wide Playmaker'},
           '30': {'position': 'LM', 'name': 'Inside Forward'},
           '31': {'position': 'CAM', 'name': 'Playmaker'},
           '32': {'position': 'CAM', 'name': 'Shadow Striker'},
           '33': {'position': 'CAM', 'name': 'Half Winger'},
           '34': {'position': 'CAM', 'name': 'Classic 10'},
           '35': {'position': 'RW', 'name': 'Winger'},
           '36': {'position': 'RW', 'name': 'Inside Forward'},
           '37': {'position': 'RW', 'name': 'Wide Playmaker'},
           '38': {'position': 'LW', 'name': 'Winger'},
           '39': {'position': 'LW', 'name': 'Inside Forward'},
           '40': {'position': 'LW', 'name': 'Wide Playmaker'},
           '41': {'position': 'ST', 'name': 'Advanced Forward'},
           '42': {'position': 'ST', 'name': 'Poacher'},
           '43': {'position': 'ST', 'name': 'False 9'},
           '44': {'position': 'ST', 'name': 'Target Forward'}}}

FACE = dict(zip(('pac', 'sho', 'pas', 'dri', 'def', 'phy'),
                ('facePace', 'faceShooting', 'facePassing', 'faceDribbling', 'faceDefending', 'facePhysicality')))
DETAIL = {
    'acceleration': 'attributeAcceleration', 'sprint_speed': 'attributeSprintSpeed',
    'positioning': 'attributePositioning', 'finishing': 'attributeFinishing',
    'shot_power': 'attributeShotPower', 'long_shots': 'attributeLongShots',
    'volleys': 'attributeVolleys', 'penalties': 'attributePenalties',
    'vision': 'attributeVision', 'crossing': 'attributeCrossing', 'fk_accuracy': 'attributeFkAccuracy',
    'short_passing': 'attributeShortPassing', 'long_passing': 'attributeLongPassing', 'curve': 'attributeCurve',
    'agility': 'attributeAgility', 'balance': 'attributeBalance', 'reactions': 'attributeReactions',
    'ball_control': 'attributeBallControl', 'dribbling_sub': 'attributeDribbling', 'composure': 'attributeComposure',
    'interceptions': 'attributeInterceptions', 'heading_accuracy': 'attributeHeadingAccuracy',
    'def_awareness': 'attributeDefensiveAwareness', 'standing_tackle': 'attributeStandingTackle',
    'sliding_tackle': 'attributeSlidingTackle', 'jumping': 'attributeJumping', 'stamina': 'attributeStamina',
    'strength': 'attributeStrength', 'aggression': 'attributeAggression',
}
GK = {f'gk_{key}': f'attributeGk{key.title()}' for key in ('diving', 'handling', 'kicking', 'reflexes', 'positioning')}
POSITIONS = {0: 'GK', 2: 'RWB', 3: 'RB', 5: 'CB', 7: 'LB', 8: 'LWB', 10: 'CDM',
             12: 'RM', 13: 'RM', 14: 'CM', 16: 'LM', 18: 'CAM', 21: 'CF', 23: 'RW', 25: 'ST', 27: 'LW'}
ALIASES = {'PSG': 'Paris SG', 'Netherlands': 'Holland', 'Türkiye': 'Turkey',
           'Liga F': 'Liga F Moeve', 'Google Pixel Frauen-Bundesliga': 'GPFBL'}
HTTP = requests.Session()
HTTP.headers['User-Agent'] = 'Mozilla/5.0 (compatible; PromoIngest/1.0)'


def norm(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode().lower())


def number(value, name, low=0, high=99):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value or not low <= value <= high:
        raise ValueError(f'{name}: required integer {low}..{high}, got {value!r}')
    return int(value)


def first(*values):
    return next((v for v in values if v is not None), None)


def stats(card):
    listed = {row['defKey']: row.get('rating') for row in card.get('faceStats', []) if 'defKey' in row}
    nested = card.get('faceStatsV2') or {}
    result = {db: number(first(nested.get(src), listed.get(src), card.get(src), card.get(db)), src)
              for db, src in FACE.items()}
    result.update({db: number(first(card.get(src), card.get(db)), src) for db, src in DETAIL.items()})
    for db, src in GK.items():
        value = first(card.get(src), card.get(db))
        if value is not None:
            result[db] = number(value, src)
    return result


def top_level_fields(text, start):
    """Split a JS object without evaluating executable page code or nested objects."""
    depth, quote, escape, begin = 0, None, False, start + 1
    for index in range(start, len(text)):
        ch = text[index]
        if quote:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == quote:
                quote = None
            continue
        if ch in ('"', "'"):
            quote = ch
        elif ch in '{[':
            depth += 1
        elif ch in '}]':
            depth -= 1
            if depth == 0:
                yield text[begin:index]
                return
        elif ch == ',' and depth == 1:
            yield text[begin:index]
            begin = index + 1
    raise ValueError('Unterminated playerDef object')


def extract_detail(text, api_id):
    for match in re.finditer(r'\bplayerDef\s*:\s*(?:\$R\[\d+\]\s*=\s*)?\{', text):
        result = {}
        for field in top_level_fields(text, match.end() - 1):
            key, sep, value = field.partition(':')
            key = key.strip().strip('"')
            if not sep:
                continue
            # Only read inert JSON scalars. References and executable JS are ignored.
            try:
                parsed = json.loads(value.strip())
            except (ValueError, TypeError):
                continue
            if parsed is None or isinstance(parsed, (str, int, float)):
                result[key] = parsed
        if result.get('eaId') == api_id:
            return result
    raise ValueError(f'No matching playerDef for eaId={api_id}')


def enrich(card, require_body=False):
    needed = [*DETAIL.values(), 'weight']
    if require_body:
        needed.append('bodytypeCode')
    if all(card.get(key) is not None for key in needed):
        return card
    path = card.get('url')
    if not path:
        raise ValueError(f"{card.get('eaId')}: incomplete stats and no detail URL")
    url = 'https://www.fut.gg' + path if path.startswith('/') else path
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname != 'www.fut.gg' or not parsed.path.startswith('/players/'):
        raise ValueError('Detail URL must point to the FUT.GG player page')
    response = HTTP.get(url, timeout=30)
    response.raise_for_status()
    detail = extract_detail(response.text, card['eaId'])
    if detail.get('basePlayerEaId') != card.get('basePlayerEaId') or detail.get('overall') != card.get('overall'):
        raise ValueError(f"{card['eaId']}: detail identity/rating differs from input")
    # Verify common stats before mixing a snapshot with live detail data.
    for key in [*FACE.values(), *DETAIL.values()]:
        existing = first((card.get('faceStatsV2') or {}).get(key), card.get(key))
        if existing is not None and detail.get(key) != existing:
            raise ValueError(f"{card['eaId']}: source/detail mismatch for {key}")
    print(f"  Detail verified: {card['eaId']} ({card.get('commonName', '')})", flush=True)
    return {**detail, **{k: v for k, v in card.items() if v is not None}}


def asset_url(value):
    if not value:
        raise ValueError('Missing image URL')
    url = value if value.startswith('https://') else 'https://game-assets.fut.gg/' + value.lstrip('/')
    if urlsplit(url).scheme != 'https':
        raise ValueError('Expected HTTPS image URL')
    return url


def connect():
    direct = os.environ.get('DATABASE_URL')
    if not direct:
        raise ValueError('DATABASE_URL is required for transactional ingestion')
    pooler_file = ROOT / 'supabase/.temp/pooler-url'
    if pooler_file.exists():
        pooler = urlsplit(pooler_file.read_text().strip())
        return psycopg.connect(host=pooler.hostname, port=pooler.port,
            user=unquote(pooler.username), password=unquote(urlsplit(direct).password or ''),
            dbname=pooler.path.lstrip('/'), sslmode='require', connect_timeout=20,
            autocommit=True, row_factory=dict_row)
    return psycopg.connect(direct, sslmode='require', connect_timeout=20, autocommit=True, row_factory=dict_row)


def table_rows(conn, table):
    return conn.execute(sql.SQL('SELECT * FROM public.{}').format(sql.Identifier(table))).fetchall()


def resolve_entity(rows, name, league_ids=None, preferred=None):
    key = norm(ALIASES.get(name, name))
    found = [row for row in rows if norm(row['name']) == key
             and (league_ids is None or row['league_id'] in league_ids)]
    if preferred is not None and any(row['id'] == preferred for row in found):
        return preferred
    if len(found) != 1:
        raise ValueError(f'Ambiguous/missing master: {name!r}, candidates={[r["id"] for r in found]}')
    return found[0]['id']


def player_id(conn, card, nation_id):
    matches = conn.execute('SELECT DISTINCT player_id FROM card_versions WHERE api_id=%s',
                           (card['basePlayerEaId'],)).fetchall()
    if len(matches) == 1:
        return matches[0]['player_id']
    if len(matches) > 1:
        raise ValueError(f"Ambiguous base api_id: {card['basePlayerEaId']}")
    first_name, last_name = card.get('firstName', ''), card.get('lastName', '')
    names = {norm(n) for n in (card.get('commonName'), f'{first_name} {last_name}',
                               f'{first_name[:1]}. {last_name}') if n}
    found = [r for r in conn.execute('SELECT id,name,long_name FROM players WHERE nation_id=%s', (nation_id,)).fetchall()
             if norm(r['name']) in names or (r['long_name'] and norm(r['long_name']) in names)]
    if len(found) != 1:
        raise ValueError(f"Cannot uniquely identify existing player: {card.get('commonName')}")
    return found[0]['id']


def body_type(code, height, gender):
    """Fallback only: gender 0=male, 1=female; never guess unknown codes."""
    code = number(code, 'bodytypeCode', 0, 30)
    height = number(height, 'height', 100, 250)
    gender = number(gender, 'gender (0=male, 1=female)', 0, 1)
    builds = {
        0: {0: 'Lean', 1: 'Lean', 2: 'Average', 3: 'Stocky'},
        1: {0: 'Lean', 1: 'Lean', 2: 'Average', 3: 'Average', 4: 'Stocky'},
    }
    if code not in builds[gender]:
        raise ValueError(f'No fallback body type for gender={gender}, code={code}')
    size = 'Short' if height < 175 else 'Tall' if height >= 186 else 'Medium'
    return f'{builds[gender][code]} {size}'


def resolve_body_type(conn, pid, card, height):
    # The live DB uses "Gold"; accept both cases without altering its values.
    gold = conn.execute(
        "SELECT id,body_type FROM card_versions WHERE player_id=%s AND lower(version)='gold' ORDER BY id",
        (pid,)).fetchall()
    inherited = {row['body_type'] for row in gold if row['body_type'] is not None}
    if len(inherited) == 1:
        return inherited.pop()
    if len(inherited) > 1:
        raise ValueError(f'Conflicting Gold body types for player_id={pid}: {sorted(inherited)}')
    if gold:
        # Fallback is permitted only when there is no Gold card at all.
        raise ValueError(f'Gold body_type is NULL for player_id={pid}; fix the Gold source first')
    source = card if card.get('bodytypeCode') is not None else enrich(card, require_body=True)
    player = conn.execute('SELECT gender FROM players WHERE id=%s', (pid,)).fetchone()
    if player is None:
        raise ValueError(f'Missing existing player_id={pid}')
    # Use the DB's explicit Male/Female labels: source feeds may use different
    # numeric gender conventions. Numeric fallback follows the requested 0/1 rule.
    gender = {'male': 0, 'female': 1}.get(str(player['gender']).strip().lower())
    if gender is None:
        gender = source.get('gender')
    return body_type(source.get('bodytypeCode'), height, gender)


def prepare(conn, cards, version, background):
    masters = {t: table_rows(conn, t) for t in ('clubs', 'leagues', 'nations', 'positions', 'roles', 'playstyles')}
    pos_ids = {r['name']: r['id'] for r in masters['positions']}
    role_ids = {(r['position'], norm(r['role_name'])): r['id'] for r in masters['roles']}
    style_ids = {norm(r['name']): r['id'] for r in masters['playstyles']}
    prepared = []
    for card in cards:
        league_name = ALIASES.get(card['league']['name'], card['league']['name'])
        league_ids = {r['id'] for r in masters['leagues'] if norm(r['name']) == norm(league_name)}
        club_id = resolve_entity(masters['clubs'], card['club']['name'], league_ids)
        league_id = next(r['league_id'] for r in masters['clubs'] if r['id'] == club_id)
        base_nations = conn.execute('SELECT DISTINCT p.nation_id FROM players p JOIN card_versions c ON c.player_id=p.id WHERE c.api_id=%s',
                                    (card['basePlayerEaId'],)).fetchall()
        nation_id = resolve_entity(masters['nations'], card['nation']['name'],
                                   preferred=base_nations[0]['nation_id'] if len(base_nations) == 1 else None)
        pid = player_id(conn, card, nation_id)
        height, weight = number(card.get('height'), 'height', 100, 250), number(card.get('weight'), 'weight', 30, 180)
        foot = {1: 'Right', 2: 'Left', 'Right': 'Right', 'Left': 'Left'}.get(card.get('foot'))
        if not foot:
            raise ValueError(f"Unknown foot: {card.get('foot')}")
        primary = card['position'] if isinstance(card.get('position'), str) else POSITIONS[card['position']]
        positions = {pos_ids[POSITIONS[p]]: False for p in card.get('alternativePositionIds', [])}
        positions[pos_ids[primary]] = True
        role_values, style_values = {}, {}
        for field, level in (('rolesPlus', 1), ('rolesPlusPlus', 2)):
            for raw in card[field]:
                base = raw - 100 if 101 <= raw <= 149 else raw
                role = TRAIT_MAPPING['roles'][str(base)]
                if pos_ids[role['position']] not in positions:
                    raise ValueError(f"{card['eaId']}: role {raw} conflicts with card positions")
                rid = role_ids[(role['position'], norm(role['name']))]
                role_values[rid] = max(level, role_values.get(rid, 0))
        for field, fallback, plus in (('playStyleEaIds', 'playstyles', False), ('playStylePlusEaIds', 'playstylesPlus', True)):
            values = card[field] if field in card else card[fallback]
            for raw in values:
                name = TRAIT_MAPPING['playstyles'][str(raw)]
                sid = style_ids[norm(name)]
                style_values[sid] = plus or style_values.get(sid, False)
        cv = dict(player_id=pid, api_id=card['eaId'], overall=number(card['overall'], 'overall', 1), version=version,
                  club_id=club_id, league_id=league_id,
                  image_url=asset_url(card.get('imageUrl') or card.get('imagePath') or card.get('cardImageUrl')),
                  background_url=background, body_type=resolve_body_type(conn, pid, card, height),
                  sm=number(card['skillMoves'], 'skillMoves', 1, 5), wf=number(card['weakFoot'], 'weakFoot', 1, 5),
                  preferred_foot=foot, card_type='SPECIAL')
        prepared.append(dict(name=card.get('commonName', str(card['eaId'])), cv=cv,
            player=dict(height=height, weight=weight), stats=stats(card),
            card_roles=[dict(role_id=k, role_level=v) for k, v in sorted(role_values.items())],
            card_playstyles=[dict(playstyle_id=k, is_plus=v) for k, v in sorted(style_values.items())],
            card_positions=[dict(position_id=k, is_primary=v) for k, v in sorted(positions.items())]))
    return prepared


def insert(conn, table, data):
    columns = sql.SQL(',').join(map(sql.Identifier, data))
    placeholders = sql.SQL(',').join(sql.Placeholder() for _ in data)
    return conn.execute(sql.SQL('INSERT INTO public.{} ({}) VALUES ({}) RETURNING *').format(
        sql.Identifier(table), columns, placeholders), list(data.values())).fetchone()


def update(conn, table, data, key, value):
    setters = sql.SQL(',').join(sql.SQL('{}=%s').format(sql.Identifier(k)) for k in data)
    return conn.execute(sql.SQL('UPDATE public.{} SET {} WHERE {}=%s RETURNING *').format(
        sql.Identifier(table), setters, sql.Identifier(key)), [*data.values(), value]).fetchall()


def write_rows(conn, prepared):
    # The live schema has no unique(api_id,version) / unique(card_id). Serialize
    # update-or-insert upserts rather than relying on nonexistent constraints.
    conn.execute('LOCK TABLE players,card_versions,player_stats,card_roles,card_playstyles,card_positions IN SHARE ROW EXCLUSIVE MODE')
    created = 0
    for item in prepared:
        cv = item['cv']
        update(conn, 'players', item['player'], 'id', cv['player_id'])
        existing = conn.execute('SELECT id,player_id FROM card_versions WHERE api_id=%s AND version=%s', (cv['api_id'], cv['version'])).fetchall()
        if len(existing) > 1 or (existing and existing[0]['player_id'] != cv['player_id']):
            raise ValueError(f'Conflicting existing card: {cv["api_id"]}')
        if existing:
            cid = existing[0]['id']
            update(conn, 'card_versions', cv, 'id', cid)
        else:
            cid = insert(conn, 'card_versions', cv)['id']
            created += 1
        current = conn.execute('SELECT id FROM player_stats WHERE card_id=%s', (cid,)).fetchall()
        if len(current) > 1:
            raise ValueError(f'Duplicate player_stats for card_id={cid}')
        if current:
            update(conn, 'player_stats', item['stats'], 'card_id', cid)
        else:
            insert(conn, 'player_stats', {'card_id': cid, **item['stats']})
        for table in ('card_roles', 'card_playstyles', 'card_positions'):
            conn.execute(sql.SQL('DELETE FROM public.{} WHERE card_id=%s').format(sql.Identifier(table)), (cid,))
            for row in item[table]:
                insert(conn, table, {'card_id': cid, **row})
        print(f'  Staged: {item["name"]}, card_id={cid}, PAC={item["stats"]["pac"]}, body_type={cv["body_type"]}', flush=True)
    return created


def verify(conn, prepared):
    totals = dict(cards=0, stats=0, card_roles=0, card_playstyles=0, card_positions=0)
    for item in prepared:
        cv = item['cv']
        rows = conn.execute('SELECT * FROM card_versions WHERE api_id=%s AND version=%s', (cv['api_id'], cv['version'])).fetchall()
        if len(rows) != 1 or any(rows[0].get(k) != v for k, v in cv.items()):
            raise ValueError(f'Card verification failed: {cv["api_id"]}')
        cid = rows[0]['id']
        for table, expected, key, value in (
            ('players', item['player'], 'id', cv['player_id']), ('player_stats', item['stats'], 'card_id', cid)):
            actual = conn.execute(sql.SQL('SELECT * FROM public.{} WHERE {}=%s').format(sql.Identifier(table), sql.Identifier(key)), (value,)).fetchall()
            if len(actual) != 1 or any(actual[0].get(k) != v for k, v in expected.items()):
                raise ValueError(f'{table} verification failed: {cid}')
        totals['cards'] += 1
        totals['stats'] += 1
        for table in ('card_roles', 'card_playstyles', 'card_positions'):
            actual = conn.execute(sql.SQL('SELECT * FROM public.{} WHERE card_id=%s').format(sql.Identifier(table)), (cid,)).fetchall()
            keys = {'card_roles': ('role_id', 'role_level'), 'card_playstyles': ('playstyle_id', 'is_plus'),
                    'card_positions': ('position_id', 'is_primary')}[table]
            if sorted(tuple(r[k] for k in keys) for r in actual) != sorted(tuple(r[k] for k in keys) for r in item[table]):
                raise ValueError(f'{table} verification failed: {cid}')
            totals[table] += len(actual)
    return totals


def template_bytes(cards):
    urls = {asset_url(c.get('rarityImageUrl') or c.get('rarityImagePath') or
                       (c.get('rarity') or {}).get('imageUrl') or (c.get('rarity') or {}).get('imagePath')) for c in cards}
    if len(urls) != 1:
        raise ValueError('Input must use a single rarity template')
    response = HTTP.get(urls.pop(), timeout=30)
    response.raise_for_status()
    image = Image.open(io.BytesIO(response.content)).convert('RGBA')
    bbox = image.getchannel('A').getbbox()
    if bbox is None:
        raise ValueError('Template is fully transparent')
    output = io.BytesIO()
    cropped = image.crop(bbox)
    cropped.save(output, 'PNG')
    print(f'Template cropped: {image.size} -> {cropped.size}')
    return output.getvalue()


def check_schema(conn, prepared):
    for table, needed in (('players', set(prepared[0]['player'])), ('card_versions', set(prepared[0]['cv'])),
                          ('player_stats', {'card_id', *prepared[0]['stats']})):
        columns = {r['column_name'] for r in conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,)).fetchall()}
        missing = needed - columns
        if missing:
            raise ValueError(f'Schema missing {table}: {sorted(missing)}; no DB writes performed')


def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith('--'):
        raise ValueError('Usage: python ingest_promo.py <file.json> [--check | --verify]')
    mode = sys.argv[2:]
    if mode not in ([], ['--check'], ['--verify']):
        raise ValueError('Supported options: --check (no writes), --verify (read-back only)')
    source = Path(sys.argv[1])
    version = 'special_' + source.stem.replace('-', '_').replace(' ', '_')
    raw = json.loads(source.read_text(encoding='utf-8-sig'))
    if not isinstance(raw, list) or not raw:
        raise ValueError('JSON must contain a nonempty player array')
    cards, seen = [], set()
    for item in raw:
        while isinstance(item, dict) and ('playerDef' in item or 'card' in item):
            item = item.get('playerDef') or item.get('card')
        if not isinstance(item, dict) or not item.get('eaId') or item['eaId'] in seen:
            raise ValueError('Invalid or duplicate eaId in input')
        seen.add(item['eaId'])
        cards.append(enrich(item))
    load_dotenv(ROOT / '.env.local')
    load_dotenv(ROOT / '.env')
    root_url = (os.getenv('SUPABASE_URL') or os.getenv('VITE_SUPABASE_URL') or '').rstrip('/')
    if not root_url:
        raise ValueError('SUPABASE_URL is required')
    background = f'{root_url}/storage/v1/object/public/card-templates/{version}.png'
    with connect() as conn:
        prepared = prepare(conn, cards, version, background)
        check_schema(conn, prepared)
        if mode == ['--verify']:
            print('VERIFIED', json.dumps(verify(conn, prepared)))
            return
        png = template_bytes(cards)
        print(f'VALIDATED {len(cards)} cards / 6 face + 29 in-game stats; version={version}')
        if mode == ['--check']:
            return
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')
        if not key:
            raise ValueError('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY required for Storage upload')
        folder = ROOT / 'card_backgrounds'
        folder.mkdir(exist_ok=True)
        (folder / f'{version}.png').write_bytes(png)
        response = HTTP.post(f'{root_url}/storage/v1/object/card-templates/{version}.png', data=png,
            headers={'Authorization': f'Bearer {key}', 'apikey': key,
                     'Content-Type': 'image/png', 'x-upsert': 'true'}, timeout=30)
        response.raise_for_status()
        public = HTTP.get(background, timeout=30)
        public.raise_for_status()
        with Image.open(io.BytesIO(public.content)) as image:
            image.verify()
        print(f'Template saved locally and uploaded: {background}')
        with conn.transaction():
            conn.execute("SET LOCAL lock_timeout = '15s'")
            before_count = conn.execute('SELECT count(*) AS n FROM players').fetchone()['n']
            created = write_rows(conn, prepared)
            report = verify(conn, prepared)
            if conn.execute('SELECT count(*) AS n FROM players').fetchone()['n'] != before_count:
                raise ValueError('Player count changed; rolling back')
        print(f'COMMITTED created={created}, updated={len(cards)-created}; players unchanged={before_count}')
        print('VERIFIED', json.dumps(report))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except Exception as exc:
        # Never print connection strings, request headers or credentials.
        message = str(exc)
        for env_name in ('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_KEY', 'DATABASE_URL'):
            value = os.getenv(env_name)
            if value:
                message = message.replace(value, '[redacted]')
        print(f'FAILED: {type(exc).__name__}: {message}', file=sys.stderr)
        sys.exit(1)
