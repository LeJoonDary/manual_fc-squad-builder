import argparse
import html as html_lib
import json
import os
import random
import re
import sys
import time
import unicodedata
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import requests
from supabase import Client, create_client

# 1. Supabase 관리자 초기화
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
)

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("[오류] Supabase 환경 변수를 확인하세요.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

BASE_URL = "https://www.fut.gg"
TOTW_VERSION = "special_totw"
STORAGE_BUCKET = "fc-assets"
STORAGE_BASE_URL = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{STORAGE_BUCKET}"
TOTW_BG_URL = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/card-templates/special_totw_edited.png"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.fut.gg/",
}

def upload_to_supabase_storage(source_url, storage_path, content_type="image/webp"):
    if not source_url: return None
    try:
        resp = requests.get(source_url, headers=HEADERS, timeout=12)
        if resp.status_code != 200: return None
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=resp.content,
            file_options={"content-type": content_type, "upsert": "true"}
        )
        return f"{STORAGE_BASE_URL}/{storage_path}"
    except Exception as e:
        return None

def extract_asset_url_from_html(html_text, asset_type):
    full_pattern = rf'https?://game-assets\.fut\.gg/[^"\'\s)]+/{asset_type}/[^"\'\s)]+\.png'
    m = re.search(full_pattern, html_text)
    if m: return m.group(0)
    rel_pattern = rf'202\d/{asset_type}/[^"\'\s)]+\.png'
    m = re.search(rel_pattern, html_text)
    if m: return f"https://game-assets.fut.gg/cdn-cgi/image/quality=85,format=auto,width=80/{m.group(0)}"
    return None

EA_POS_MAP = {
    0: ("GK", 10), 2: ("RWB", 15), 3: ("RB", 9), 5: ("CB", 8),
    7: ("LB", 7), 8: ("LWB", 14), 10: ("CDM", 6), 12: ("RM", 13),
    13: ("RM", 13), 14: ("CM", 4), 16: ("LM", 12), 18: ("CAM", 5),
    21: ("CF", 11), 23: ("RW", 3), 25: ("ST", 1), 27: ("LW", 2),
}

EA_ROLE_TO_DB = {
    1: 48, 2: 49, 45: 47, 3: 40, 4: 39, 5: 42, 6: 38, 46: 41,
    7: 35, 8: 34, 9: 37, 10: 33, 47: 36, 11: 44, 12: 45, 13: 43, 48: 46,
    14: 31, 15: 29, 16: 30, 17: 32, 49: 28, 18: 23, 19: 26, 20: 24, 21: 27, 22: 25,
    23: 22, 24: 20, 25: 21, 26: 19, 27: 18, 28: 16, 29: 17, 30: 15, 31: 13, 32: 14,
    33: 12, 34: 11, 35: 10, 36: 8, 37: 9, 38: 7, 39: 5, 40: 6, 41: 1, 42: 3, 43: 2, 44: 4,
}

EA_PLAYSTYLE_TO_DB = {
    0: 2, 1: 25, 2: 3, 3: 16, 4: 22, 5: 4, 6: 17, 7: 12, 8: 27, 9: 5,
    10: 24, 11: 14, 12: 9, 13: 8, 14: 29, 15: 10, 16: 7, 17: 6, 18: 18,
    19: 19, 20: 28, 21: 23, 22: 1, 23: 20, 24: 13, 25: 21, 26: 30,
    27: 11, 28: 15, 29: 33, 30: 26, 31: 31, 32: 34, 33: 32, 34: 37,
    35: 39, 36: 35, 37: 38, 38: 40, 39: 36,
}

DETAIL_KEYS = {
    "acceleration": "attributeAcceleration", "sprint_speed": "attributeSprintSpeed",
    "positioning": "attributePositioning", "finishing": "attributeFinishing",
    "shot_power": "attributeShotPower", "long_shots": "attributeLongShots",
    "volleys": "attributeVolleys", "penalties": "attributePenalties",
    "vision": "attributeVision", "crossing": "attributeCrossing",
    "fk_accuracy": "attributeFkAccuracy", "short_passing": "attributeShortPassing",
    "long_passing": "attributeLongPassing", "curve": "attributeCurve",
    "agility": "attributeAgility", "balance": "attributeBalance",
    "reactions": "attributeReactions", "ball_control": "attributeBallControl",
    "dribbling_sub": "attributeDribbling", "composure": "attributeComposure",
    "interceptions": "attributeInterceptions", "heading_accuracy": "attributeHeadingAccuracy",
    "def_awareness": "attributeDefensiveAwareness", "standing_tackle": "attributeStandingTackle",
    "sliding_tackle": "attributeSlidingTackle", "jumping": "attributeJumping",
    "stamina": "attributeStamina", "strength": "attributeStrength",
    "aggression": "attributeAggression", "gk_diving": "attributeGkDiving",
    "gk_handling": "attributeGkHandling", "gk_kicking": "attributeGkKicking",
    "gk_reflexes": "attributeGkReflexes", "gk_positioning": "attributeGkPositioning",
}

LEAGUE_ALIAS_MAP = {
    "major league soccer": 7, "mls": 7, "premier league": 3,
    "laliga ea sports": 2, "laliga": 2, "la liga": 2, "bundesliga": 4,
    "ligue 1 mcdonald's": 5, "ligue 1": 5, "serie a enilive": 12, "serie a": 12,
    "liga portugal": 13, "eredivisie": 21, "bundesliga 2": 22,
    "liga bbva mx": 23, "liga mx": 23, "roshn saudi league": 14,
    "scottish premiership": 27, "trendyol süper lig": 11,
    "efl championship": 19, "k league 1": 48, "csl": 47, "chinese super league": 47,
    "österreichische fußball-bundesliga": 40, "ö. bundesliga": 40, "austrian bundesliga": 40,
    "pko bank polski ekstraklasa": 46, "ekstraklasa": 46, "lpf": 20,
    "liga profesional de fútbol": 20, "liga profesional de futbol": 20, "liga profesional": 20,
    "barclays wsl": 1, "wsl": 1, "barclays womens super league": 1, "women's super league": 1,
    "liga f moeve": 6, "liga-f-moeve": 6, "liga f": 6, "liga-f": 6,
    "arkema pl": 10, "arkema première ligue": 10, "arkema premiere ligue": 10,
    "national women's soccer league": 8, "nwsl": 8, "google pixel frauen-bundesliga": 9,
    "gpfbl": 9, "calcio a femminile": 15
}

CLUB_ALIAS_MAP = {
    "man utd": "Manchester Utd", "manchester united": "Manchester Utd",
    "ol": "OL Lyonnes", "ol lyonnes": "OL Lyonnes", "olympique lyonnais": "OL Lyonnes",
    "juventus fc": "Juventus", "juventus": "Juventus", "psg": "Paris SG", "paris saint-germain": "Paris SG",
    "ss lazio": "Latium", "lazio": "Latium", "inter": "Lombardia FC", "inter milan": "Lombardia FC",
    "ac milan": "Milano FC", "milan": "Milano FC", "atalanta": "Bergamo Calcio", "as roma": "Roma",
    "bayern munich": "FC Bayern München", "bayern münchen": "FC Bayern München"
}

NATION_ALIAS_MAP = {
    "car": "Central African Republic", "central african republic": "Central African Republic",
    "netherlands antilles": "Curaçao", "curacao": "Curaçao", "curaçao": "Curaçao",
    "ivory coast": "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire", "netherlands": "Holland", "holland": "Holland",
    "türkiye": "Turkey", "turkey": "Turkey", "south korea": "Korea Republic", "korea republic": "Korea Republic",
    "usa": "United States", "united states": "United States"
}

def get_table_columns(table_name):
    res = supabase.table(table_name).select("*").limit(1).execute()
    return set(res.data[0].keys()) if res.data else set()

def get_or_create_league(name, raw_img_url=None):
    if not name: return None
    clean = name.strip()
    alias_id = LEAGUE_ALIAS_MAP.get(clean.lower()) or LEAGUE_ALIAS_MAP.get(clean.replace("-", " ").lower())
    
    league_id = alias_id
    existing_logo = None
    if league_id:
        res = supabase.table("leagues").select("id, logo_url").eq("id", league_id).execute()
        if res.data: existing_logo = res.data[0].get("logo_url")
    else:
        res = supabase.table("leagues").select("id, logo_url").ilike("name", clean).execute()
        if res.data:
            league_id = res.data[0]["id"]
            existing_logo = res.data[0].get("logo_url")
        else:
            max_res = supabase.table("leagues").select("id").order("id", desc=True).limit(1).execute()
            league_id = (max_res.data[0]["id"] + 1) if max_res.data else 100
            supabase.table("leagues").insert({"id": league_id, "name": clean}).execute()

    if (not existing_logo or "fc-assets" not in str(existing_logo)) and raw_img_url:
        uploaded_url = upload_to_supabase_storage(raw_img_url, f"leagues/{league_id}.png", "image/png")
        if uploaded_url:
            supabase.table("leagues").update({"logo_url": uploaded_url}).eq("id", league_id).execute()

    return league_id

def get_or_create_club(name, league_id=None, raw_logo_url=None):
    if not name: return None
    clean = name.strip()
    if clean.lower() in CLUB_ALIAS_MAP: clean = CLUB_ALIAS_MAP[clean.lower()]
    else:
        unslug = re.sub(r"^\d+-", "", clean).replace("-", " ")
        clean = CLUB_ALIAS_MAP.get(unslug.lower(), unslug.title())

    club_id = None
    existing_logo = None
    if league_id:
        res = supabase.table("clubs").select("id, logo_url").ilike("name", clean).eq("league_id", league_id).execute()
        if res.data:
            club_id = res.data[0]["id"]
            existing_logo = res.data[0].get("logo_url")
    if not club_id:
        res = supabase.table("clubs").select("id, logo_url").ilike("name", clean).execute()
        if res.data:
            club_id = res.data[0]["id"]
            existing_logo = res.data[0].get("logo_url")

    if not club_id:
        max_res = supabase.table("clubs").select("id").order("id", desc=True).limit(1).execute()
        club_id = (max_res.data[0]["id"] + 1) if max_res.data else 1000
        payload = {"id": club_id, "name": clean}
        if league_id: payload["league_id"] = league_id
        supabase.table("clubs").insert(payload).execute()

    if (not existing_logo or "fc-assets" not in str(existing_logo)) and raw_logo_url:
        uploaded_url = upload_to_supabase_storage(raw_logo_url, f"clubs/{club_id}.png", "image/png")
        if uploaded_url:
            supabase.table("clubs").update({"logo_url": uploaded_url}).eq("id", club_id).execute()

    return club_id

def get_or_create_nation(name):
    if not name: return None
    clean = name.strip()
    canonical_name = NATION_ALIAS_MAP.get(clean.lower(), clean)
    res = supabase.table("nations").select("id").ilike("name", canonical_name).execute()
    if res.data: return res.data[0]["id"]
    try:
        max_res = supabase.table("nations").select("id").order("id", desc=True).limit(1).execute()
        next_id = (max_res.data[0]["id"] + 1) if max_res.data else 300
        supabase.table("nations").insert({"id": next_id, "name": canonical_name}).execute()
        return next_id
    except Exception:
        return None

def get_totw_urls(limit=23, stop_at="tzolakis"):
    target_url = f"{BASE_URL}/players/?page=1&rarity_id=%5B3%5D&sorts=-created_at"
    print(f"▶ TOTW 최신 목록 조회 중: {target_url}")
    resp = requests.get(target_url, headers=HEADERS, timeout=12)
    if resp.status_code != 200: return []
    soup = BeautifulSoup(resp.text, "html.parser")
    urls = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if re.match(r"^/players/\d+-[^/]+/27-\d+/?$", href):
            full_url = f"{BASE_URL}{href.rstrip('/')}/"
            if full_url not in urls:
                urls.append(full_url)
                if stop_at and stop_at.lower() in href.lower():
                    print(f"  [확인] 지정 종료 대상({stop_at}) 발견.")
                    break
                if len(urls) >= limit: break
    print(f"✔ 총 {len(urls)}개 대상 카드 링크 확보 완료")
    return urls

def player_def_fields(text, api_id):
    for match in re.finditer(r"\bplayerDef\s*:\s*(?:\$R\[\d+\]\s*=\s*)?\{", text):
        depth, quote, escaped = 1, None, False
        begin = match.end()
        fields = {}
        for index in range(begin, len(text)):
            ch = text[index]
            if quote:
                if escaped: escaped = False
                elif ch == "\\": escaped = True
                elif ch == quote: quote = None
                continue
            if ch in ('"', "'"): quote = ch
            elif ch in "{[": depth += 1
            elif ch in "}]": depth -= 1
            if (ch == "," and depth == 1) or depth == 0:
                key, sep, value = text[begin:index].partition(":")
                if sep:
                    value = re.sub(r"^\s*\$R\[\d+\]\s*=\s*", "", value)
                    try: fields[key.strip().strip('"\'')] = json.loads(value)
                    except ValueError: pass
                begin = index + 1
            if depth == 0: break
        if fields.get("eaId") == api_id or str(fields.get("eaId")) == str(api_id) or fields.get("basePlayerEaId") == api_id:
            return fields
    raise ValueError(f"No matching playerDef for eaId={api_id}")

def owned_ids(card, *keys):
    for key in keys:
        if key in card and isinstance(card[key], list):
            return [int(v) for v in card[key] if isinstance(v, (int, str)) and str(v).isdigit()]
    return []

def parse_card_page(url):
    clean_url = url.split("?")[0].rstrip("/") + "/"
    resp = requests.get(clean_url, headers=HEADERS, timeout=12)
    if resp.status_code != 200: return None

    m_ids = re.search(r"/(\d+)-[^/]+/27-(\d+)/?", clean_url)
    if not m_ids: return None
    player_id = int(m_ids.group(1))
    card_api_id = int(m_ids.group(2))

    html_text = resp.text
    soup = BeautifulSoup(html_text, "html.parser")
    card = player_def_fields(html_text, card_api_id)

    info_text = ""
    for el in soup.find_all(["div", "section"]):
        if "Player Information" in el.get_text():
            info_text = el.get_text(separator="\n", strip=True)
            break

    def get_info(label):
        m = re.search(rf"{label}\n+([^\n]+)", info_text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    name = get_info("Name") or card.get("commonName") or "Unknown"
    nation_name = get_info("Nation") or (card.get("nation", {}).get("name") if isinstance(card.get("nation"), dict) else None)
    league_name = (card.get("league", {}).get("name") if isinstance(card.get("league"), dict) else None) or get_info("League")
    club_name = (card.get("club", {}).get("name") if isinstance(card.get("club"), dict) else None) or get_info("Club")

    # ★ 클럽 및 리그 이미지 URL HTML 추출
    club_img_url = extract_asset_url_from_html(html_text, "club")
    league_img_url = extract_asset_url_from_html(html_text, "league")

    # ★ 선수 페이스 컷아웃 사진 fc-assets/players/ 폴더 업로드
    raw_img_path = card.get("imagePath")
    player_img_url = f"https://game-assets.fut.gg/cdn-cgi/image/quality=85,format=auto,width=500/{raw_img_path}" if raw_img_path else None
    uploaded_player_img = None
    if player_img_url:
        uploaded_player_img = upload_to_supabase_storage(player_img_url, f"players/{card_api_id}.webp", "image/webp")

    # ★ 헤드샷 여부 자동 감지
    has_dynamic = card.get("hasDynamic")
    card_type = "SPECIAL_HEADSHOT" if has_dynamic is False else "TOTW"

    overall = int(card.get("overall") or 80)
    preferred_foot = get_info("Foot") or {1: "Right", 2: "Left"}.get(card.get("foot"), "Right")
    clean_full = soup.get_text(separator=" ", strip=True)
    m_acc = re.search(r"AcceleRATE(?:\s*2\.0)?\s*[:\n\s\-]*(Mostly\s+Explosive|Controlled\s+Explosive|Explosive|Mostly\s+Lengthy|Controlled\s+Lengthy|Lengthy|Controlled)", clean_full, re.IGNORECASE)
    accele_type = " ".join(w.capitalize() for w in m_acc.group(1).split()) if m_acc else "Controlled"
    body_type = get_info("Body Type") or "Average Medium"

    raw_wf = get_info("Weak Foot") or ""
    m_wf = re.search(r"(\d)", raw_wf)
    wf = int(m_wf.group(1)) if m_wf else int(card.get("weakFoot") or 3)

    raw_sm = get_info("Skill Moves") or ""
    m_sm = re.search(r"(\d)", raw_sm)
    sm = int(m_sm.group(1)) if m_sm else int(card.get("skillMoves") or 3)

    primary_pos_str, primary_pid = EA_POS_MAP.get(card.get("position"), ("ST", 1))
    sec_pos_ids = [EA_POS_MAP[p][1] for p in owned_ids(card, "alternativePositionIds") if p in EA_POS_MAP and EA_POS_MAP[p][1] != primary_pid]

    role_values = {}
    for field, level in (("rolesPlus", 1), ("rolesPlusPlus", 2)):
        for raw in owned_ids(card, field):
            base = raw - 100 if 101 <= raw <= 149 else raw
            if base in EA_ROLE_TO_DB:
                rid = EA_ROLE_TO_DB[base]
                role_values[rid] = max(level, role_values.get(rid, 0))
    roles_list = [{"role_id": rid, "level": level} for rid, level in role_values.items()]

    style_values = {}
    for fields, plus in ((("playStyleEaIds", "playstyles"), False), (("playStylePlusEaIds", "playstylesPlus"), True)):
        for raw in owned_ids(card, *fields):
            if raw in EA_PLAYSTYLE_TO_DB:
                sid = EA_PLAYSTYLE_TO_DB[raw]
                style_values[sid] = plus or style_values.get(sid, False)
    playstyles_list = [{"playstyle_id": sid, "is_plus": plus} for sid, plus in style_values.items()]

    is_gk = primary_pos_str == "GK"
    if is_gk:
        raw_spd = card.get("gkFaceSpeed")
        final_spd = int(raw_spd) if raw_spd and int(raw_spd) > 0 else int(card.get("attributeSprintSpeed") or 0)
        face_stats = {
            "pac": int(card.get("gkFaceDiving") or 0), "sho": int(card.get("gkFaceHandling") or 0),
            "pas": int(card.get("gkFaceKicking") or 0), "dri": int(card.get("gkFaceReflexes") or 0),
            "def": final_spd, "phy": int(card.get("gkFacePositioning") or 0),
        }
    else:
        face_stats = {
            "pac": int(card.get("facePace") or 0), "sho": int(card.get("faceShooting") or 0),
            "pas": int(card.get("facePassing") or 0), "dri": int(card.get("faceDribbling") or 0),
            "def": int(card.get("faceDefending") or 0), "phy": int(card.get("facePhysicality") or 0),
        }

    detail_stats = {}
    for db_k, pdef_k in DETAIL_KEYS.items():
        if pdef_k in card and card[pdef_k] is not None:
            detail_stats[db_k] = int(card[pdef_k])

    if is_gk:
        detail_stats["sprint_speed"] = face_stats["def"]
        detail_stats["acceleration"] = face_stats["def"]
        detail_stats["gk_diving"] = face_stats["pac"]
        detail_stats["gk_handling"] = face_stats["sho"]
        detail_stats["gk_kicking"] = face_stats["pas"]
        detail_stats["gk_reflexes"] = face_stats["dri"]
        detail_stats["gk_positioning"] = face_stats["phy"]

    return {
        "player_id": player_id,
        "api_id": card_api_id,
        "name": name,
        "nation_name": nation_name,
        "league_name": league_name,
        "league_raw_url": league_img_url,
        "club_name": club_name,
        "club_raw_url": club_img_url,
        "overall": overall,
        "card_type": card_type,
        "image_url": uploaded_player_img,
        "primary_position_str": primary_pos_str,
        "primary_pos_id": primary_pid,
        "secondary_pos_ids": sec_pos_ids,
        "roles": roles_list,
        "playstyles": playstyles_list,
        "preferred_foot": preferred_foot,
        "skill_moves": sm,
        "weak_foot": wf,
        "body_type": body_type,
        "accele_type": accele_type,
        "face_stats": face_stats,
        "detail_stats": detail_stats,
    }

def insert_totw_card(data):
    p_id = data["player_id"]
    card_api_id = data["api_id"]
    name = data["name"]

    league_id = get_or_create_league(data.get("league_name"), raw_img_url=data.get("league_raw_url"))
    club_id = get_or_create_club(data.get("club_name"), league_id=league_id, raw_logo_url=data.get("club_raw_url"))
    nation_id = get_or_create_nation(data.get("nation_name"))

    player_cols = get_table_columns("players")
    player_payload = {"id": p_id, "name": name}
    if nation_id and "nation_id" in player_cols: player_payload["nation_id"] = nation_id
    if club_id and "club_id" in player_cols: player_payload["club_id"] = club_id
    if league_id and "league_id" in player_cols: player_payload["league_id"] = league_id

    p_exist = supabase.table("players").select("id").eq("id", p_id).execute()
    if p_exist.data: supabase.table("players").update(player_payload).eq("id", p_id).execute()
    else: supabase.table("players").insert(player_payload).execute()

    cv_cols = get_table_columns("card_versions")
    cv_payload = {
        "player_id": p_id,
        "overall": data.get("overall", 80),
        "version": TOTW_VERSION,
        "card_type": data.get("card_type", "TOTW"),
        "background_url": TOTW_BG_URL,
    }
    if "api_id" in cv_cols: cv_payload["api_id"] = card_api_id
    if "image_url" in cv_cols and data.get("image_url"):
        cv_payload["image_url"] = data["image_url"]
    if nation_id and "nation_id" in cv_cols: cv_payload["nation_id"] = nation_id
    if club_id and "club_id" in cv_cols: cv_payload["club_id"] = club_id
    if league_id and "league_id" in cv_cols: cv_payload["league_id"] = league_id
    if "body_type" in cv_cols and data.get("body_type"): cv_payload["body_type"] = data["body_type"]
    if "wf" in cv_cols: cv_payload["wf"] = data.get("weak_foot", 3)
    if "sm" in cv_cols: cv_payload["sm"] = data.get("skill_moves", 3)
    if "preferred_foot" in cv_cols: cv_payload["preferred_foot"] = data.get("preferred_foot", "Right")
    if "accele_type" in cv_cols: cv_payload["accele_type"] = data.get("accele_type", "Controlled")

    exist_cv = supabase.table("card_versions").select("id").eq("api_id", card_api_id).execute()
    if not exist_cv.data:
        exist_cv = supabase.table("card_versions").select("id").eq("player_id", p_id).eq("version", TOTW_VERSION).execute()

    if exist_cv.data:
        card_id = exist_cv.data[0]["id"]
        supabase.table("card_versions").update(cv_payload).eq("id", card_id).execute()
        status_label = f"기존 카드(ID: {card_id}) 갱신"
    else:
        ins_cv = supabase.table("card_versions").insert(cv_payload).execute()
        card_id = ins_cv.data[0]["id"] if ins_cv.data else None
        status_label = f"신규 카드(ID: {card_id}) 생성"

    if not card_id: return

    cp_cols = get_table_columns("card_positions")
    cp_fk = "card_id" if "card_id" in cp_cols else "card_version_id"
    supabase.table("card_positions").delete().eq(cp_fk, card_id).execute()
    pos_batch = [{cp_fk: card_id, "position_id": data["primary_pos_id"], "is_primary": True}]
    for sec_pid in data.get("secondary_pos_ids", []):
        pos_batch.append({cp_fk: card_id, "position_id": sec_pid, "is_primary": False})
    supabase.table("card_positions").insert(pos_batch).execute()

    cr_cols = get_table_columns("card_roles")
    cr_fk = "card_id" if "card_id" in cr_cols else "card_version_id"
    supabase.table("card_roles").delete().eq(cr_fk, card_id).execute()
    if data.get("roles"):
        role_batch = []
        for r in data["roles"]:
            row = {cr_fk: card_id, "role_id": r["role_id"]}
            if "role_level" in cr_cols: row["role_level"] = r["level"]
            elif "level" in cr_cols: row["level"] = r["level"]
            role_batch.append(row)
        supabase.table("card_roles").insert(role_batch).execute()

    cpl_cols = get_table_columns("card_playstyles")
    cpl_fk = "card_id" if "card_id" in cpl_cols else "card_version_id"
    supabase.table("card_playstyles").delete().eq(cpl_fk, card_id).execute()
    if data.get("playstyles"):
        ps_batch = []
        for p in data["playstyles"]:
            row = {cpl_fk: card_id, "playstyle_id": p["playstyle_id"]}
            if "is_plus" in cpl_cols: row["is_plus"] = p["is_plus"]
            ps_batch.append(row)
        supabase.table("card_playstyles").insert(ps_batch).execute()

    ps_cols = get_table_columns("player_stats")
    ps_fk = "card_version_id" if "card_version_id" in ps_cols else "card_id"
    ps_payload = {ps_fk: card_id}
    for k in ["pac", "sho", "pas", "dri", "def", "phy"]:
        val = data["face_stats"].get(k)
        if k in ps_cols and val is not None: ps_payload[k] = val
    for k, v in data["detail_stats"].items():
        if k in ps_cols and v is not None: ps_payload[k] = v

    exist_ps = supabase.table("player_stats").select("id").eq(ps_fk, card_id).limit(1).execute()
    if exist_ps.data: supabase.table("player_stats").update(ps_payload).eq(ps_fk, card_id).execute()
    else: supabase.table("player_stats").insert(ps_payload).execute()

    print(f"  ✔ [{data.get('overall')} {data.get('primary_position_str')}] {name} ({data['card_type']}) ➔ {status_label}")

def run_pipeline(limit=23, stop_at="tzolakis"):
    print("=" * 65)
    print(f"🚀 TOTW 일괄 파이프라인 시작 (버전: {TOTW_VERSION}, 최대 {limit}명)")
    print("=" * 65)

    urls = get_totw_urls(limit=limit, stop_at=stop_at)
    if not urls:
        print("[종료] 파싱할 URL이 없습니다.")
        return

    success = 0
    for i, url in enumerate(urls, 1):
        print(f"\n[{i}/{len(urls)}] 진행 중: {url}")
        parsed = parse_card_page(url)
        if parsed:
            insert_totw_card(parsed)
            success += 1

        if i < len(urls):
            delay = random.uniform(3.5, 5.0)
            print(f"  ⏳ 봇 차단 방지 대기 중: {delay:.2f}초...")
            time.sleep(delay)

    print("\n" + "=" * 65)
    print(f"🎉 TOTW 총 {success}/{len(urls)}명 무오류 일괄 적재 완료!")
    print("=" * 65)

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="FUT.GG TOTW 일괄 자동 적재기")
    parser.add_argument("--limit", type=int, default=23, help="수집할 카드 개수 (기본 23)")
    parser.add_argument("--stop-at", type=str, default="tzolakis", help="수집 중단 대상 슬러그")
    args = parser.parse_args()

    run_pipeline(limit=args.limit, stop_at=args.stop_at)