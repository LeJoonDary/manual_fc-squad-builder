import os
import sys
import re
import json
import argparse
import requests
import unicodedata
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Supabase 관리자 클라이언트 초기화
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
)

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("[오류] Supabase 환경 변수(URL, KEY)를 확인하세요.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
BASE_URL = "https://www.fut.gg"
STORAGE_BASE_URL = "https://iqfbyjvnzthixbxeuewk.supabase.co/storage/v1/object/public/card-templates"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# -------------------------------------------------------------
# EA 고유 ID -> 우리 DB ID 1:1 직결 매핑 사전
# -------------------------------------------------------------
EA_POS_MAP = {
    0: ("GK", 10), 2: ("RWB", 15), 3: ("RB", 9), 5: ("CB", 8),
    7: ("LB", 7), 8: ("LWB", 14), 10: ("CDM", 6), 12: ("RM", 13),
    13: ("RM", 13), 14: ("CM", 4), 16: ("LM", 12), 18: ("CAM", 5),
    21: ("CF", 11), 23: ("RW", 3), 25: ("ST", 1), 27: ("LW", 2),
}

EA_ROLE_TO_DB = {
    1: 48, 2: 49, 45: 47,
    3: 40, 4: 39, 5: 42, 6: 38, 46: 41,
    7: 35, 8: 34, 9: 37, 10: 33, 47: 36,
    11: 44, 12: 45, 13: 43, 48: 46,
    14: 31, 15: 29, 16: 30, 17: 32, 49: 28,
    18: 23, 19: 26, 20: 24, 21: 27, 22: 25,
    23: 22, 24: 20, 25: 21, 26: 19,
    27: 18, 28: 16, 29: 17, 30: 15,
    31: 13, 32: 14, 33: 12, 34: 11,
    35: 10, 36: 8, 37: 9,
    38: 7, 39: 5, 40: 6,
    41: 1, 42: 3, 43: 2, 44: 4,
}

EA_PLAYSTYLE_TO_DB = {
    0: 2, 1: 25, 2: 3, 3: 16, 4: 22, 5: 4, 6: 17, 7: 12, 8: 27, 9: 5,
    10: 24, 11: 14, 12: 9, 13: 8, 14: 29, 15: 10, 16: 7, 17: 6, 18: 18,
    19: 19, 20: 28, 21: 23, 22: 1, 23: 20, 24: 13, 25: 21, 26: 30,
    27: 11, 28: 15, 29: 33, 30: 26, 31: 31, 32: 34, 33: 32, 34: 37,
    35: 39, 36: 35, 37: 38, 38: 40, 39: 36,
}

DETAIL_KEYS = {
    "acceleration": "attributeAcceleration",
    "sprint_speed": "attributeSprintSpeed",
    "positioning": "attributePositioning",
    "finishing": "attributeFinishing",
    "shot_power": "attributeShotPower",
    "long_shots": "attributeLongShots",
    "volleys": "attributeVolleys",
    "penalties": "attributePenalties",
    "vision": "attributeVision",
    "crossing": "attributeCrossing",
    "fk_accuracy": "attributeFkAccuracy",
    "short_passing": "attributeShortPassing",
    "long_passing": "attributeLongPassing",
    "curve": "attributeCurve",
    "agility": "attributeAgility",
    "balance": "attributeBalance",
    "reactions": "attributeReactions",
    "ball_control": "attributeBallControl",
    "dribbling_sub": "attributeDribbling",
    "composure": "attributeComposure",
    "interceptions": "attributeInterceptions",
    "heading_accuracy": "attributeHeadingAccuracy",
    "def_awareness": "attributeDefensiveAwareness",
    "standing_tackle": "attributeStandingTackle",
    "sliding_tackle": "attributeSlidingTackle",
    "jumping": "attributeJumping",
    "stamina": "attributeStamina",
    "strength": "attributeStrength",
    "aggression": "attributeAggression",
}

LEAGUE_ALIAS_MAP = {
    "major league soccer": 7, "mls": 7, "premier league": 3,
    "laliga ea sports": 2, "laliga": 2, "la liga": 2, "bundesliga": 4,
    "ligue 1 mcdonald's": 5, "ligue 1": 5, "serie a enilive": 12, "serie a": 12,
    "liga portugal": 13, "eredivisie": 21, "bundesliga 2": 22,
    "liga bbva mx": 23, "liga mx": 23, "roshn saudi league": 14,
    "scottish premiership": 27, "trendyol süper lig": 11, "barclays wsl": 1,
    "liga f moeve": 6, "liga f": 6, "national women's soccer league": 8, "nwsl": 8,
    "google pixel frauen-bundesliga": 9, "gpfbl": 9, "arkema première ligue": 10,
    "efl championship": 19, "k league 1": 48
}

CLUB_ALIAS_MAP = {
    "ss lazio": "latium", "lazio": "latium", "inter": "lombardia fc",
    "inter milan": "lombardia fc", "ac milan": "milano fc", "milan": "milano fc",
    "atalanta": "bergamo calcio", "as roma": "roma", "bayern munich": "fc bayern münchen",
    "bayern münchen": "fc bayern münchen", "bayern": "fc bayern münchen",
    "manchester united": "man utd"
}

def get_table_columns(table_name):
    res = supabase.table(table_name).select("*").limit(1).execute()
    return set(res.data[0].keys()) if res.data else set()

def get_or_create_league(name):
    if not name:
        return None
    clean = name.strip()
    alias_id = LEAGUE_ALIAS_MAP.get(clean.lower())
    if alias_id:
        return alias_id
    res = supabase.table("leagues").select("id").ilike("name", clean).execute()
    if res.data:
        return res.data[0]["id"]
    try:
        max_res = supabase.table("leagues").select("id").order("id", desc=True).limit(1).execute()
        next_id = (max_res.data[0]["id"] + 1) if max_res.data else 100
        supabase.table("leagues").insert({"id": next_id, "name": clean}).execute()
        return next_id
    except Exception:
        return None

# 국가 명칭 별칭 사전
NATION_ALIAS_MAP = {
    "netherlands": 16,
    "holland": 16,
    "türkiye": 33,
    "turkey": 33,
    "korea republic": 49,
    "south korea": 49,
    "korea": 49,
}


def get_or_create_nation(name):
  if not name:
    return None
  clean = name.strip()

  # 별칭 사전 우선 매핑 (Netherlands -> 16)
  alias_id = NATION_ALIAS_MAP.get(clean.lower())
  if alias_id:
    return alias_id

  res = supabase.table("nations").select("id").ilike("name", clean).execute()
  if res.data:
    return res.data[0]["id"]
  try:
    max_res = (
        supabase.table("nations")
        .select("id")
        .order("id", desc=True)
        .limit(1)
        .execute()
    )
    next_id = (max_res.data[0]["id"] + 1) if max_res.data else 300
    supabase.table("nations").insert({"id": next_id, "name": clean}).execute()
    return next_id
  except Exception:
    return None

def get_or_create_club(name, league_id=None):
    if not name:
        return None
    clean = name.strip()
    if clean.lower() in CLUB_ALIAS_MAP:
        clean = CLUB_ALIAS_MAP[clean.lower()]
    res = supabase.table("clubs").select("id").ilike("name", clean).execute()
    if res.data:
        return res.data[0]["id"]
    try:
        club_cols = get_table_columns("clubs")
        max_res = supabase.table("clubs").select("id").order("id", desc=True).limit(1).execute()
        next_id = (max_res.data[0]["id"] + 1) if max_res.data else 1000
        payload = {"id": next_id, "name": clean}
        if league_id and "league_id" in club_cols:
            payload["league_id"] = league_id
        supabase.table("clubs").insert(payload).execute()
        return next_id
    except Exception:
        return None

def player_def_fields(text, card_api_id, player_id=None):
    candidates = []
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
                    try:
                        fields[key.strip().strip('"\'')] = json.loads(value)
                    except ValueError:
                        pass
                begin = index + 1
            if depth == 0:
                break
        candidates.append(fields)
        if (
            fields.get("eaId") == card_api_id
            or str(fields.get("eaId")) == str(card_api_id)
            or (player_id and fields.get("basePlayerEaId") == player_id)
            or (player_id and fields.get("eaId") == player_id)
        ):
            return fields

    if candidates:
        return candidates[0]
    raise ValueError("FUT.GG 페이지에서 playerDef 데이터를 찾지 못했습니다.")

def owned_ids(card, *keys):
    for key in keys:
        if key in card:
            values = card[key]
            if values is None:
                return []
            if isinstance(values, list):
                return [int(v) for v in values if isinstance(v, (int, str)) and str(v).isdigit()]
    return []

def detect_version_info(soup, card, override_version=None, override_bg=None, override_type=None):
    """제목/H1 기반 정밀 버전 판별 (special_special 방지)"""
    if override_version:
        version = override_version
    else:
        rarity_name = None

        # 1순위: 페이지 제목(<title>) 또는 <h1> 태그에서 실제 프로모 명칭 추출 (예: POTM Bundesliga)
        candidate_texts = []
        if soup.find("h1"):
            candidate_texts.append(soup.find("h1").get_text())
        if soup.find("title"):
            candidate_texts.append(soup.find("title").get_text())

        for text in candidate_texts:
            m = re.search(r"[-–]\s*(.*?)\s*\d{2}\s*OVR", text, re.IGNORECASE)
            if m:
                c_name = m.group(1).strip()
                if c_name.lower() not in ["special", "player"]:
                    rarity_name = c_name
                    break

        # 2순위: JSON rarity
        if not rarity_name and isinstance(card.get("rarity"), dict) and card["rarity"].get("name"):
            r_name = card["rarity"]["name"].strip()
            if r_name.lower() != "special":
                rarity_name = r_name

        if not rarity_name:
            rarity_name = "Special"

        slug = re.sub(r"[^a-zA-Z0-9]+", "_", rarity_name.strip()).lower().strip("_")
        
        # 3. special_special 방지 및 슬러그화
        if slug in ["special", "special_special"]:
            version = "special"
        elif not slug.startswith("special_") and slug not in ["gold", "silver", "bronze", "icon", "hero"]:
            version = f"special_{slug}"
        else:
            version = slug

    if override_bg:
        background_url = override_bg
    else:
        background_url = f"{STORAGE_BASE_URL}/{version}_edited.png"

    if override_type:
        card_type = override_type
    else:
        v_low = version.lower()
        if "potm" in v_low:
            card_type = "POTM"
        elif "totw" in v_low:
            card_type = "TOTW"
        elif "sbc" in v_low:
            card_type = "SPECIAL_SBC"
        else:
            card_type = "SPECIAL"

    return version, background_url, card_type

def parse_card_page(url, custom_version=None, custom_bg=None, custom_type=None):
    clean_url = url.split("?")[0].rstrip("/") + "/"
    print(f"▶ FUT.GG 데이터 수집 중: {clean_url}")
    resp = requests.get(clean_url, headers=HEADERS, timeout=12)
    if resp.status_code != 200:
        print(f"[오류] HTTP {resp.status_code}")
        return None

    m_ids = re.search(r"/(\d+)-[^/]+/27-(\d+)/?", clean_url)
    if not m_ids:
        print("[오류] URL 형식이 올바르지 않습니다.")
        return None
    player_id = int(m_ids.group(1))
    card_api_id = int(m_ids.group(2))

    html_text = resp.text
    soup = BeautifulSoup(html_text, "html.parser")
    card = player_def_fields(html_text, card_api_id, player_id)

    # 기본 정보
    info_text = ""
    for el in soup.find_all(["div", "section"]):
        if "Player Information" in el.get_text():
            info_text = el.get_text(separator="\n", strip=True)
            break

    def get_info(label):
        m = re.search(rf"{label}\n+([^\n]+)", info_text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    name = card.get("commonName") or get_info("Name") or "Unknown"
    nation_name = card.get("nation", {}).get("name") if isinstance(card.get("nation"), dict) else get_info("Nation")
    league_name = card.get("league", {}).get("name") if isinstance(card.get("league"), dict) else get_info("League")
    club_name = card.get("club", {}).get("name") if isinstance(card.get("club"), dict) else get_info("Club")
    body_type = get_info("Body Type") or "Average Medium"
    accele_type = get_info("AcceleRATE") or "Controlled"

    # 키, 몸무게 정밀 파싱 (FUT.GG 화면 기준 우선)
    height = 180
    m_h = re.search(r"(\d{3})\s*cm", info_text)
    if m_h:
        height = int(m_h.group(1))
    elif card.get("height"):
        height = int(card["height"])

    weight = 75
    m_w = re.search(r"(\d{2,3})\s*kg", info_text)
    if m_w:
        weight = int(m_w.group(1))
    elif card.get("weight"):
        weight = int(card["weight"])

    foot_raw = card.get("foot")
    preferred_foot = {1: "Right", 2: "Left"}.get(foot_raw, get_info("Foot") or "Right")
    sm = int(card.get("skillMoves") or 3)
    wf = int(card.get("weakFoot") or 3)
    overall = int(card.get("overall") or 80)

    # 버전 및 배경 URL 자동 결정
    version, background_url, card_type = detect_version_info(soup, card, custom_version, custom_bg, custom_type)

    # 1. 주 포지션 & 부 포지션 (EA ID 1:1 매핑)
    if "position" in card and card["position"] in EA_POS_MAP:
        primary_pos_str, primary_pid = EA_POS_MAP[card["position"]]
    else:
        primary_pos_str = (get_info("Position") or "ST").upper()
        primary_pid = 1
        for ea_id, (p_str, db_pid) in EA_POS_MAP.items():
            if p_str == primary_pos_str:
                primary_pid = db_pid
                break

    sec_pos_ids = []
    for raw in owned_ids(card, "alternativePositionIds"):
        if raw in EA_POS_MAP:
            pid = EA_POS_MAP[raw][1]
            if pid != primary_pid and pid not in sec_pos_ids:
                sec_pos_ids.append(pid)

    # 2. 롤스 (rolesPlus=1, rolesPlusPlus=2)
    role_values = {}
    for field, level in (("rolesPlus", 1), ("rolesPlusPlus", 2)):
        for raw in owned_ids(card, field):
            base = raw - 100 if 101 <= raw <= 149 else raw
            if base in EA_ROLE_TO_DB:
                rid = EA_ROLE_TO_DB[base]
                role_values[rid] = max(level, role_values.get(rid, 0))
    roles_list = [{"role_id": rid, "level": level} for rid, level in role_values.items()]

    # 3. 플레이스타일
    style_values = {}
    for fields, plus in ((("playStyleEaIds", "playstyles"), False), (("playStylePlusEaIds", "playstylesPlus"), True)):
        for raw in owned_ids(card, *fields):
            if raw in EA_PLAYSTYLE_TO_DB:
                sid = EA_PLAYSTYLE_TO_DB[raw]
                style_values[sid] = plus or style_values.get(sid, False)
    playstyles_list = [{"playstyle_id": sid, "is_plus": plus} for sid, plus in style_values.items()]

    # 4. 페이스 6대 스탯
    face_stats = {
        "pac": int(card.get("facePace") or card.get("gkFaceDiving") or 0),
        "sho": int(card.get("faceShooting") or card.get("gkFaceHandling") or 0),
        "pas": int(card.get("facePassing") or card.get("gkFaceKicking") or 0),
        "dri": int(card.get("faceDribbling") or card.get("gkFaceReflexes") or 0),
        "def": int(card.get("faceDefending") or card.get("gkFaceSpeed") or 0),
        "phy": int(card.get("facePhysicality") or card.get("gkFacePositioning") or 0),
    }

    # 5. 세부 29개 스탯
    detail_stats = {}
    for db_k, pdef_k in DETAIL_KEYS.items():
        if pdef_k in card and card[pdef_k] is not None:
            detail_stats[db_k] = int(card[pdef_k])

    if "def_awareness" in detail_stats:
        detail_stats["defensive_awareness"] = detail_stats["def_awareness"]
    if "fk_accuracy" in detail_stats:
        detail_stats["free_kick_accuracy"] = detail_stats["fk_accuracy"]
    if "dribbling_sub" in detail_stats:
        detail_stats["dribbling"] = detail_stats["dribbling_sub"]

    return {
        "player_id": player_id,
        "api_id": card_api_id,
        "name": name,
        "nation_name": nation_name,
        "league_name": league_name,
        "club_name": club_name,
        "height": height,
        "weight": weight,
        "overall": overall,
        "version": version,
        "card_type": card_type,
        "background_url": background_url,
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

def save_to_supabase(data):
    if not data:
        return

    p_id = data["player_id"]
    card_api_id = data["api_id"]
    name = data["name"]

    print("=" * 60)
    print(f"🚀 [{data['overall']} {data['primary_position_str']}] {name} 적재 시작")
    print(f"   • 소속: {data['club_name']} | {data['league_name']} | {data['nation_name']}")
    print(f"   • 신체: {data['height']}cm / {data['weight']}kg")
    print(f"   • 버전: {data['version']} ({data['card_type']})")
    print(f"   • 템플릿: {data['background_url']}")
    print("=" * 60)

    # 1. nations, leagues, clubs 안전 적재
    league_id = get_or_create_league(data.get("league_name"))
    nation_id = get_or_create_nation(data.get("nation_name"))
    club_id = get_or_create_club(data.get("club_name"), league_id=league_id)

    # 2. players 마스터 레코드 (키, 몸무게 포함 갱신)
    player_cols = get_table_columns("players")
    player_payload = {"id": p_id, "name": name}
    if nation_id and "nation_id" in player_cols: player_payload["nation_id"] = nation_id
    if club_id and "club_id" in player_cols: player_payload["club_id"] = club_id
    if league_id and "league_id" in player_cols: player_payload["league_id"] = league_id
    if "height" in player_cols and data.get("height"): player_payload["height"] = data["height"]
    if "weight" in player_cols and data.get("weight"): player_payload["weight"] = data["weight"]

    p_exist = supabase.table("players").select("id").eq("id", p_id).execute()
    if p_exist.data:
        supabase.table("players").update(player_payload).eq("id", p_id).execute()
    else:
        supabase.table("players").insert(player_payload).execute()
    print("✔ [1/5] players 마스터 연동 및 키/몸무게 갱신 완료")

    # 3. card_versions 메인 레코드
    cv_cols = get_table_columns("card_versions")
    cv_payload = {
        "player_id": p_id,
        "overall": data["overall"],
        "version": data["version"],
        "card_type": data["card_type"],
        "background_url": data["background_url"],
    }
    if "api_id" in cv_cols: cv_payload["api_id"] = card_api_id
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
        exist_cv = supabase.table("card_versions").select("id").eq("player_id", p_id).eq("version", data["version"]).execute()

    if exist_cv.data:
        card_id = exist_cv.data[0]["id"]
        supabase.table("card_versions").update(cv_payload).eq("id", card_id).execute()
        print(f"✔ [2/5] card_versions 기존 레코드(ID: {card_id}) 갱신 완료 [중복 방지]")
    else:
        ins_cv = supabase.table("card_versions").insert(cv_payload).execute()
        card_id = ins_cv.data[0]["id"] if ins_cv.data else None
        print(f"✔ [2/5] card_versions 신규 카드 생성 완료 (ID: {card_id})")

    if not card_id:
        print("[오류] card_id 획득 실패")
        return

    # 4. card_positions 적재
    cp_cols = get_table_columns("card_positions")
    cp_fk = "card_id" if "card_id" in cp_cols else "card_version_id"
    supabase.table("card_positions").delete().eq(cp_fk, card_id).execute()

    pos_batch = [{cp_fk: card_id, "position_id": data["primary_pos_id"], "is_primary": True}]
    for sec_pid in data.get("secondary_pos_ids", []):
        pos_batch.append({cp_fk: card_id, "position_id": sec_pid, "is_primary": False})
    supabase.table("card_positions").insert(pos_batch).execute()
    print(f"✔ [3/5] card_positions 적재 완료 (주 포지션: {data['primary_position_str']}, 부 포지션: {len(data['secondary_pos_ids'])}개)")

    # 5. card_roles 적재
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
    print(f"✔ [4/5] card_roles 적재 완료 ({len(data.get('roles', []))}개 Role)")

    # 6. card_playstyles 적재
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
    print(f"✔ [5/5] card_playstyles 적재 완료 ({len(data.get('playstyles', []))}개 특성)")

    # 7. player_stats 적재
    ps_cols = get_table_columns("player_stats")
    ps_fk = "card_version_id" if "card_version_id" in ps_cols else "card_id"
    ps_payload = {ps_fk: card_id}

    for k in ["pac", "sho", "pas", "dri", "def", "phy"]:
        val = data["face_stats"].get(k)
        if k in ps_cols and val is not None:
            ps_payload[k] = val

    for k, v in data["detail_stats"].items():
        if k in ps_cols and v is not None:
            ps_payload[k] = v

    exist_ps = supabase.table("player_stats").select("id").eq(ps_fk, card_id).limit(1).execute()
    if exist_ps.data:
        supabase.table("player_stats").update(ps_payload).eq(ps_fk, card_id).execute()
    else:
        supabase.table("player_stats").insert(ps_payload).execute()
    print("✔ [보너스] player_stats (6대 페이스 스탯 + 29개 세부 스탯) 적재 완료")

    print("=" * 60)
    print(f"🎉 {name} (Card ID: {card_id}) 완전 동기화 성공!")
    print("=" * 60)

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="FUT.GG 단일 카드 URL 범용 자동 적재기")
    parser.add_argument("url", nargs="?", help="FUT.GG 카드 상세 URL")
    parser.add_argument("--version", help="카드 버전 명칭 수동 지정 (기본값: 자동 감지)")
    parser.add_argument("--bg", help="배경 템플릿 이미지 URL 수동 지정 (기본값: 자동 생성)")
    parser.add_argument("--card-type", help="카드 유형 수동 지정 (기본값: POTM/TOTW/SPECIAL 자동 감지)")
    args = parser.parse_args()

    target_url = args.url if args.url else input("FUT.GG 카드 URL을 입력하세요: ").strip()
    if target_url:
        parsed = parse_card_page(
            target_url,
            custom_version=args.version,
            custom_bg=args.bg,
            custom_type=args.card_type
        )
        if parsed:
            save_to_supabase(parsed)