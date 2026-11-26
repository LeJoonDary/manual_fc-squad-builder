import os
import sys
import re
import json
import time
import random
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

# fc-assets 및 card-templates 버킷 경로 설정
STORAGE_BUCKET = "fc-assets"
STORAGE_BASE_URL = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{STORAGE_BUCKET}"
TEMPLATE_BASE_URL = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/card-templates"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.fut.gg/",
}

_WARNED_MISSING_COLS = False
_TOKEN_STORE_CACHE = None
_SBC_PRICE_CACHE = None  # tuple: (sbc_by_set_id, sbc_by_card_id)


# -------------------------------------------------------------
# 숫자/금액/카드타입/목록 페이지 파싱 헬퍼 (토큰, SBC 가격, 시즌패스)
# -------------------------------------------------------------
def parse_coin_amount(raw_val):
    """'335.4K', '1.2M', '80,000', 80000 형태를 정수 코인으로 변환"""
    if raw_val is None:
        return None
    if isinstance(raw_val, (int, float)):
        val = int(round(raw_val))
        return val if val > 0 else None

    s = str(raw_val).strip().upper().replace(",", "").replace(" ", "")
    m = re.match(r"^(\d+(?:\.\d+)?)([KM])?$", s)
    if not m:
        return None
    num = float(m.group(1))
    unit = m.group(2)
    if unit == "K":
        num *= 1_000
    elif unit == "M":
        num *= 1_000_000
    val = int(round(num))
    return val if val > 0 else None


def normalize_card_type(raw_type):
    """--card-type 입력값 정규화 (소문자 -> 대문자, TOCKEN 오타 자동 보정)"""
    if not raw_type:
        return None
    normalized = raw_type.strip().upper().replace("-", "_").replace(" ", "_")
    normalized = normalized.replace("TOCKEN", "TOKEN")
    return normalized


def parse_token_store_html(html_text):
    """/token-store/ HTML + JS에서 {card_api_id: token_cost} 추출"""
    token_map = {}

    js_pattern = re.compile(
        r'tokenCost\s*:\s*(\d+)\b[^\}]{0,600}?player\s*:\s*(?:\$R\[\d+\]\s*=\s*)?\{[^\}]{0,160}?eaId\s*:\s*(\d+)',
        re.DOTALL,
    )
    for m in js_pattern.finditer(html_text):
        cost = int(m.group(1))
        ea_id = int(m.group(2))
        if cost > 0:
            token_map[ea_id] = cost

    soup = BeautifulSoup(html_text, "html.parser")
    for a in soup.find_all("a", href=re.compile(r"/players/\d+-[^/]+/27-(\d+)/?")):
        m_id = re.search(r"/27-(\d+)/?", a["href"])
        if not m_id:
            continue
        ea_id = int(m_id.group(1))
        if ea_id in token_map:
            continue
        parent = a.parent
        if not parent:
            continue
        for part in parent.get_text("|", strip=True).split("|"):
            clean_num = part.strip().replace(",", "")
            if clean_num.isdigit():
                val = int(clean_num)
                if 1 <= val <= 100000:
                    token_map[ea_id] = val
                    break

    return token_map


def get_token_store_map():
    """FUT.GG /token-store/ 페이지를 1회만 조회해 메모리 캐싱"""
    global _TOKEN_STORE_CACHE
    if _TOKEN_STORE_CACHE is not None:
        return _TOKEN_STORE_CACHE

    _TOKEN_STORE_CACHE = {}
    try:
        resp = requests.get(f"{BASE_URL}/token-store/", headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            _TOKEN_STORE_CACHE = parse_token_store_html(resp.text)
            print(f"  🪙 [Token Store 캐시 완료] 토큰 선수 {len(_TOKEN_STORE_CACHE)}명 확인")
        else:
            print(f"  ⚠️ Token Store 조회 실패 (HTTP {resp.status_code})")
    except Exception as e:
        print(f"  ⚠️ Token Store 조회 예외: {e}")

    return _TOKEN_STORE_CACHE


def parse_sbc_players_html(html_text):
    """/sbc/category/players/ JS 데이터에서 실제 코인 가격(cost) 추출 (scoreRequirement 다이아 제외)"""
    sbc_by_set = {}
    sbc_by_card = {}

    total_pages = 1
    m_tp = re.search(r"totalPages\s*:\s*(\d+)", html_text)
    if m_tp:
        total_pages = max(1, int(m_tp.group(1)))

    # 각 SBC 항목 시작 지점 매칭 (예: eaId:186,slug:"27-186-ronald-araujo")
    item_matches = list(
        re.finditer(r'\beaId\s*:\s*(\d+)\s*,\s*slug\s*:\s*"\d+-\1-[^"]+"', html_text)
    )

    for idx, m in enumerate(item_matches):
        sbc_ea_id = int(m.group(1))
        start = m.start()
        end = (
            item_matches[idx + 1].start()
            if idx + 1 < len(item_matches)
            else min(len(html_text), start + 6000)
        )
        chunk = html_text[start:min(end, start + 6000)]

        # 콘솔 실제 코인 가격만 추출 (scoreRequirement 및 costPc 제외, null이면 스킵)
        m_cost = re.search(r'\bcost\s*:\s*(\d+)\b', chunk)
        if not m_cost:
            continue

        coin_cost = int(m_cost.group(1))
        if coin_cost <= 0:
            continue

        sbc_by_set[sbc_ea_id] = coin_cost

        # 보상 선수 카드 api_id(playerEaId) 보조 인덱스 매핑
        for p_ea_id in re.findall(r'\bplayerEaId\s*:\s*(\d+)\b', chunk):
            sbc_by_card[int(p_ea_id)] = coin_cost

    return sbc_by_set, sbc_by_card, total_pages


def get_sbc_price_map():
    """FUT.GG /sbc/category/players/ 및 /sbc/category/icons/를 1회 조회해 메모리 캐싱"""
    global _SBC_PRICE_CACHE
    if _SBC_PRICE_CACHE is not None:
        return _SBC_PRICE_CACHE

    sbc_by_set = {}
    sbc_by_card = {}
    categories = ("players", "icons")

    for cat in categories:
        try:
            resp = requests.get(f"{BASE_URL}/sbc/category/{cat}/", headers=HEADERS, timeout=15)
            if resp.status_code != 200:
                print(f"  ⚠️ SBC 목록({cat}) 조회 실패 (HTTP {resp.status_code})")
                continue

            s_set, s_card, total_pages = parse_sbc_players_html(resp.text)
            sbc_by_set.update(s_set)
            sbc_by_card.update(s_card)

            for page in range(2, min(total_pages, 10) + 1):
                time.sleep(0.4)
                p_resp = requests.get(
                    f"{BASE_URL}/sbc/category/{cat}/?page={page}",
                    headers=HEADERS,
                    timeout=15,
                )
                if p_resp.status_code == 200:
                    p_set, p_card, _ = parse_sbc_players_html(p_resp.text)
                    sbc_by_set.update(p_set)
                    sbc_by_card.update(p_card)
        except Exception as e:
            print(f"  ⚠️ SBC 목록({cat}) 조회 예외: {e}")

    print(f"  🧩 [SBC 가격 캐시 완료] 활성 선수/아이콘 SBC {len(sbc_by_set)}건 확인")
    _SBC_PRICE_CACHE = (sbc_by_set, sbc_by_card)
    return _SBC_PRICE_CACHE


def extract_acquisition_info(html_text, clean_full, card, card_api_id, override_type=None):
    """토큰 상점, SBC 목록, playerDef에서 토큰/SBC 가격/시즌패스/목표 여부 자동 추출"""
    token_cost = None
    sbc_price = None
    season_pass_level = None

    # 1) Token Store 매핑 확인 (/token-store/ 캐시 1순위)
    token_map = get_token_store_map()
    if int(card_api_id) in token_map:
        token_cost = token_map[int(card_api_id)]

    if token_cost is None:
        m_token = re.search(r"Token\s+Store\s+Cost\s*[:\s]*([\d,]+)", clean_full, re.IGNORECASE)
        if m_token:
            try:
                val = int(m_token.group(1).replace(",", ""))
                if val > 0:
                    token_cost = val
            except ValueError:
                pass

    # 2) SBC 여부 및 SBC 예상 가격 추출 (/sbc/category/players/ 캐시 1순위)
    sbc_set_ea_id = card.get("sbcSetEaId")
    is_sbc = bool(
        card.get("isSbcItem") is True
        or sbc_set_ea_id
        or card.get("sbcChallengeEaId")
        or (override_type and "sbc" in str(override_type).lower())
    )

    if is_sbc:
        sbc_by_set, sbc_by_card = get_sbc_price_map()
        if sbc_set_ea_id is not None:
            try:
                sbc_price = sbc_by_set.get(int(sbc_set_ea_id))
            except (TypeError, ValueError):
                pass
        if sbc_price is None:
            sbc_price = sbc_by_card.get(int(card_api_id))

    if sbc_price is None:
        m_sbc = re.search(r"SBC\s+(?:Price|Cost)\s*[:\s]*([\d,.]+\s*[KM]?)", clean_full, re.IGNORECASE)
        if m_sbc:
            sbc_price = parse_coin_amount(m_sbc.group(1))
            if sbc_price:
                is_sbc = True

    # 3) 시즌 패스 레벨 추출
    for key in ("premiumSeasonPassLevel", "standardSeasonPassLevel"):
        lvl = card.get(key)
        if lvl is not None:
            try:
                val = int(lvl)
                if val > 0:
                    season_pass_level = val
                    break
            except (TypeError, ValueError):
                pass

    if season_pass_level is None:
        m_sp = re.search(
            r"Season\s+Pass\s*(?:Level|Lv\.?)\s*[:\s]*(\d+)",
            clean_full,
            re.IGNORECASE,
        )
        if m_sp:
            val = int(m_sp.group(1))
            if val > 0:
                season_pass_level = val

    # 4) 목표(Objective) 보상 카드 여부
    is_objective = bool(
        card.get("isObjectiveItem") is True
        or card.get("objectiveGroupEaId")
        or card.get("objectiveGroupObjectiveEaId")
    )

    return {
        "token_cost": token_cost,
        "sbc_price": sbc_price,
        "season_pass_level": season_pass_level,
        "is_sbc": is_sbc,
        "is_objective": is_objective,
    }


# -------------------------------------------------------------
# Storage 업로드 및 HTML 직통 에셋 추출 헬퍼
# -------------------------------------------------------------
def upload_to_supabase_storage(source_url, storage_path, content_type="image/webp"):
    if not source_url:
        return None
    try:
        resp = requests.get(source_url, headers=HEADERS, timeout=12)
        if resp.status_code != 200:
            return None

        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=resp.content,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        public_url = f"{STORAGE_BASE_URL}/{storage_path}"
        print(f"  ☁ [Storage 업로드 완료] {storage_path}")
        return public_url
    except Exception as e:
        print(f"  ⚠️ Storage 업로드 실패 ({storage_path}): {e}")
        return None


def extract_asset_url_from_html(html_text, asset_type):
    """HTML 본문 전체에서 /club/ 또는 /league/ 이미지 URL 직접 추출"""
    full_pattern = rf'https?://game-assets\.fut\.gg/[^"\'\s)]+/{asset_type}/[^"\'\s)]+\.png'
    m = re.search(full_pattern, html_text)
    if m:
        return m.group(0)

    rel_pattern = rf'202\d/{asset_type}/[^"\'\s)]+\.png'
    m = re.search(rel_pattern, html_text)
    if m:
        return f"https://game-assets.fut.gg/cdn-cgi/image/quality=85,format=auto,width=80/{m.group(0)}"
    return None


# -------------------------------------------------------------
# EA 고유 ID -> DB ID 1:1 직결 매핑
# -------------------------------------------------------------
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
    "dribbling": "attributeDribbling", "composure": "attributeComposure",
    "interceptions": "attributeInterceptions", "heading_accuracy": "attributeHeadingAccuracy",
    "def_awareness": "attributeDefensiveAwareness", "standing_tackle": "attributeStandingTackle",
    "sliding_tackle": "attributeSlidingTackle", "jumping": "attributeJumping",
    "stamina": "attributeStamina", "strength": "attributeStrength",
    "aggression": "attributeAggression", "gk_diving": "attributeGkDiving",
    "gk_handling": "attributeGkHandling", "gk_kicking": "attributeGkKicking",
    "gk_reflexes": "attributeGkReflexes", "gk_positioning": "attributeGkPositioning",
}

def normalize_league_key(name):
    """리그명 정규화: 특수 아포스트로피(’/‘), 악센트(é/ü/ó/č/ž 등), 하이픈/공백 통일"""
    if not name:
        return ""
    s = str(name).strip()
    s = s.replace("\u2019", "'").replace("\u2018", "'").replace("`", "'").replace("\u00b4", "'")
    s = s.replace("ß", "ss").replace("ẞ", "ss").replace("ø", "o").replace("Ø", "o").replace("ł", "l").replace("Ł", "l")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[-_/]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


LEAGUE_ALIAS_MAP = {
    # 1~15: 주요 5대 리그, 여자 주요 리그, 주요 글로벌 리그
    "barclays wsl": 1, "wsl": 1, "barclays women's super league": 1,
    "barclays womens super league": 1, "women's super league": 1, "womens super league": 1,
    "laliga ea sports": 2, "laliga": 2, "la liga": 2,
    "premier league": 3,
    "bundesliga": 4,
    "ligue 1 mcdonald's": 5, "ligue 1 mcdonalds": 5, "ligue 1": 5,
    "liga f moeve": 6, "liga f": 6,
    "mls": 7, "major league soccer": 7,
    "nwsl": 8, "national women's soccer league": 8, "national womens soccer league": 8,
    "gpfbl": 9, "google pixel frauen bundesliga": 9, "frauen bundesliga": 9,
    "arkema pl": 10, "arkema premiere ligue": 10,
    "trendyol super lig": 11, "super lig": 11, "tsl": 11,
    "serie a enilive": 12, "serie a": 12,
    "liga portugal": 13, "liga portugal betclic": 13,
    "roshn saudi league": 14, "saudi pro league": 14,
    "calcio a femminile": 15, "serie a femminile": 15,
    # 16~40
    "nederland vrouwen liga": 16, "vrouwen eredivisie": 16, "azerion vrouwen eredivisie": 16,
    "1a pro league": 17, "jupiler pro league": 17,
    "hellas liga": 18, "super league greece": 18,
    "efl championship": 19,
    "lpf": 20, "liga profesional de futbol": 20, "liga profesional": 20,
    "eredivisie": 21,
    "bundesliga 2": 22, "2. bundesliga": 22,
    "liga bbva mx": 23, "liga mx": 23,
    "united emirates league": 24, "uae pro league": 24,
    "eliteserien": 25,
    "metropolitan division": 26, "3f superliga": 26, "danish superliga": 26,
    "scottish premiership": 27,
    "sverige liga": 28, "obos damallsvenskan": 28, "damallsvenskan": 28,
    "ceska liga": 29, "chance liga": 29, "fortuna liga": 29,
    "laliga hypermotion": 30,
    "liga portugal feminino": 31, "liga bpi": 31,
    "conmebol libertadores": 32, "libertadores": 32,
    "ukrayina liha": 33,
    "liga hrvatska": 34,
    "conmebol sudamericana": 35, "sudamericana": 35,
    "liga do brasil": 36,
    "magyar liga": 37,
    "ceska liga zen": 38,
    "brack super league": 39, "credit suisse super league": 39, "swiss super league": 39, "cssl": 39,
    "o. bundesliga": 40, "osterreichische fussball bundesliga": 40, "austrian bundesliga": 40, "admiral bundesliga": 40,
    # 41~63 + 특수 리그
    "liga colombia": 41,
    "serie bkt": 42, "serie b": 42,
    "ligue 2 bkt": 43, "ligue 2": 43,
    "norge kvinner liga": 44, "toppserien": 44,
    "liga cyprus": 45,
    "ekstraklasa": 46, "pko bank polski ekstraklasa": 46, "pko bp ekstraklasa": 46,
    "csl": 47, "chinese super league": 47,
    "k league 1": 48,
    "scottish women's league": 49, "scottish womens league": 49, "swpl": 49,
    "liga bulgaria": 50,
    "liga azerbaijan": 51,
    "efl league one": 52,
    "schweizer damen liga": 53, "axa women's super league": 53, "axa womens super league": 53,
    "allsvenskan": 54,
    "superliga": 55, "superliga romania": 55,
    "thailand league": 56,
    "isuzu ute a league": 57, "a league": 57, "a league men": 57,
    "isl": 58, "indian super league": 58,
    "iceland league": 59,
    "sse airtricity men's premier division": 60, "sse airtricity mens premier division": 60,
    "3. liga": 61,
    "finnliiga": 62, "veikkausliiga": 62,
    "efl league two": 63,
    "icons": 2118, "icon": 2118, "fut icons": 2118,
    "partners league": 2265,
}

def normalize_text_key(name):
    """이름 정규화: 특수 아포스트로피(’/‘), 대시, 악센트(é/ü/ó/ñ 등), 하이픈/공백 통일"""
    if not name:
        return ""
    s = str(name).strip()
    s = s.replace("\u2019", "'").replace("\u2018", "'").replace("`", "'").replace("\u00b4", "'")
    s = s.replace("ß", "ss").replace("ẞ", "ss").replace("ø", "o").replace("Ø", "o").replace("ł", "l").replace("Ł", "l")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[-_/]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


INVALID_ENTITY_NAMES = {"", "-", "\u2013", "\u2014", "unknown", "none", "null", "n/a", "n a"}

SPECIAL_CLUB_ID_MAP = {
    "icon": 112658,
    "icons": 112658,
    "fut icons": 112658,
    "club 113307": 113307,
    "partnerships": 113307,
    "partners league": 113307,
    "hall of fut": 132794,
}

CLUB_ALIAS_MAP = {
    "man utd": "Manchester Utd",
    "manchester united": "Manchester Utd",
    "ol": "OL Lyonnes",
    "ol lyonnes": "OL Lyonnes",
    "olympique lyonnais": "OL Lyonnes",
    "juventus fc": "Juventus",
    "juventus": "Juventus",
    "psg": "Paris SG",
    "paris saint germain": "Paris SG",
    "ss lazio": "Latium",
    "lazio": "Latium",
    "inter": "Lombardia FC",
    "inter milan": "Lombardia FC",
    "internazionale": "Lombardia FC",
    "ac milan": "Milano FC",
    "milan": "Milano FC",
    "atalanta": "Bergamo Calcio",
    "atalanta bc": "Bergamo Calcio",
    "as roma": "Roma",
    "bayern munich": "FC Bayern München",
    "bayern munchen": "FC Bayern München",
    "fc bayern munchen": "FC Bayern München",
    # DB 정제 시 확인된 중복 클럽 별칭
    "london city lionesses": "London City",
    "amed": "Amed Sportif Faaliyetler",
    "boston legacy": "Boston Legacy FC",
    "losc": "LOSC Lille",
    "diriyah": "Al Diriyah",
    "como 1907": "Como",
    "denver summit": "Denver Summit FC",
    "bologna fc": "Bologna",
    "venezia fc": "Venezia",
    "abha": "Abha Club",
    "academico": "Académico de Viseu FC",
    "academico de viseu": "Académico de Viseu FC",
    "logrono united": "DUX Logroño",
    "cagliari calcio": "Cagliari",
    "frosinone calcio": "Frosinone",
    "acf fiorentina": "Fiorentina",
    "us saint malo": "US Saint-Malo",
    "club 113307": "Partnerships",
}

NATION_ID_MAP = {
    "netherlands": 16,
    "holland": 16,
    "australia": 36,
    "korea republic": 49,
    "south korea": 49,
    "korea": 49,
    "kosovo": 51,
    "congo dr": 61,
    "dr congo": 61,
    "democratic republic of the congo": 61,
    "saudi arabia": 63,
    "bosnia and herzegovina": 65,
    "bosnia herzegovina": 65,
    "bosnia": 65,
    "dominican republic": 77,
}

NATION_ALIAS_MAP = {
    "netherlands": "Netherlands",
    "holland": "Netherlands",
    "bosnia herzegovina": "Bosnia and Herzegovina",
    "bosnia and herzegovina": "Bosnia and Herzegovina",
    "bosnia": "Bosnia and Herzegovina",
    "czechia": "Czech Republic",
    "czech republic": "Czech Republic",
    "south korea": "Korea Republic",
    "korea republic": "Korea Republic",
    "korea": "Korea Republic",
    "usa": "United States",
    "united states": "United States",
    "turkiye": "Turkey",
    "turkey": "Turkey",
    "ivory coast": "Côte d'Ivoire",
    "cote d'ivoire": "Côte d'Ivoire",
    "cote d ivoire": "Côte d'Ivoire",
    "dr congo": "Congo DR",
    "congo dr": "Congo DR",
    "democratic republic of the congo": "Congo DR",
    "cape verde": "Cape Verde Islands",
    "cape verde islands": "Cape Verde Islands",
    "netherlands antilles": "Curaçao",
    "curacao": "Curaçao",
    "car": "Central African Republic",
    "central african republic": "Central African Republic",
    "ireland": "Republic of Ireland",
    "republic of ireland": "Republic of Ireland",
    "china": "China PR",
    "china pr": "China PR",
}


def get_table_columns(table_name):
    res = supabase.table(table_name).select("*").limit(1).execute()
    return set(res.data[0].keys()) if res.data else set()


def get_or_create_league(name, raw_img_url=None):
    if not name:
        return None
    clean = name.strip()
    norm = normalize_league_key(clean)
    if clean.lower() in INVALID_ENTITY_NAMES or norm in INVALID_ENTITY_NAMES:
        return None

    alias_id = LEAGUE_ALIAS_MAP.get(norm)
    if alias_id is None:
        alias_id = LEAGUE_ALIAS_MAP.get(norm.replace("'", ""))

    league_id = alias_id
    existing_logo = None
    if league_id:
        res = supabase.table("leagues").select("id, logo_url").eq("id", league_id).execute()
        if res.data:
            existing_logo = res.data[0].get("logo_url")
    else:
        res = supabase.table("leagues").select("id, logo_url").ilike("name", clean).order("id").execute()
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
    if not name:
        return None
    raw_clean = str(name).strip()
    norm_raw = normalize_text_key(raw_clean)
    if raw_clean.lower() in INVALID_ENTITY_NAMES or norm_raw in INVALID_ENTITY_NAMES:
        return None

    # 슬러그 접두 숫자 제거 후 정규화 키 생성
    unslug = re.sub(r"^\d+-", "", raw_clean).strip()
    norm_key = normalize_text_key(unslug)
    if norm_key in INVALID_ENTITY_NAMES:
        return None

    # 0) 특수 클럽(ICON, Partnerships/Club 113307, HALL OF FUT) 고정 ID 매핑
    #    - HALL OF FUT(132794): 단일 리그에 귀속되지 않으므로 기존 clubs.league_id(NULL) 유지
    #    - Partnerships(113307): DB 명칭이 Club 113307이든 Partnerships든 중복 생성 없이 113307 고정
    special_club_id = SPECIAL_CLUB_ID_MAP.get(norm_key)
    if special_club_id:
        res_sp = supabase.table("clubs").select("id, logo_url").eq("id", special_club_id).execute()
        if res_sp.data:
            existing_logo = res_sp.data[0].get("logo_url")
            if (not existing_logo or "fc-assets" not in str(existing_logo)) and raw_logo_url:
                uploaded_url = upload_to_supabase_storage(raw_logo_url, f"clubs/{special_club_id}.png", "image/png")
                if uploaded_url:
                    supabase.table("clubs").update({"logo_url": uploaded_url}).eq("id", special_club_id).execute()
            return special_club_id

    # NWSL(리그 8) 소속 선수가 Portland Timbers로 잡힐 경우 여자 팀(Portland Thorns)으로 보정
    if league_id == 8 and norm_key == "portland timbers":
        clean = "Portland Thorns"
    elif norm_key in CLUB_ALIAS_MAP:
        clean = CLUB_ALIAS_MAP[norm_key]
    elif "-" in unslug and " " not in unslug:
        clean = unslug.replace("-", " ").title()
    else:
        clean = unslug

    target_norm = normalize_text_key(clean)
    club_id = None
    existing_logo = None

    # 1) 같은 리그 내 정확 일치 (최소 정식 ID 우선)
    if league_id:
        res = (
            supabase.table("clubs")
            .select("id, name, logo_url")
            .eq("league_id", league_id)
            .ilike("name", clean)
            .order("id")
            .execute()
        )
        if res.data:
            club_id = res.data[0]["id"]
            existing_logo = res.data[0].get("logo_url")
        else:
            # 같은 리그 내 악센트/하이픈/대소문자 차이 보정 매칭
            league_clubs = (
                supabase.table("clubs")
                .select("id, name, logo_url")
                .eq("league_id", league_id)
                .order("id")
                .execute()
            )
            for row in (league_clubs.data or []):
                if normalize_text_key(row.get("name")) == target_norm:
                    club_id = row["id"]
                    existing_logo = row.get("logo_url")
                    break

    # 2) 리그 미지정 또는 해당 리그에서 못 찾은 경우 전체 클럽에서 최소 정식 ID 우선 조회
    if not club_id:
        res = (
            supabase.table("clubs")
            .select("id, logo_url")
            .ilike("name", clean)
            .order("id")
            .execute()
        )
        if res.data:
            club_id = res.data[0]["id"]
            existing_logo = res.data[0].get("logo_url")

    # 3) 신규 클럽 생성
    if not club_id:
        max_res = supabase.table("clubs").select("id").order("id", desc=True).limit(1).execute()
        club_id = (max_res.data[0]["id"] + 1) if max_res.data else 1000
        payload = {"id": club_id, "name": clean}
        if league_id:
            payload["league_id"] = league_id
        supabase.table("clubs").insert(payload).execute()

    if (not existing_logo or "fc-assets" not in str(existing_logo)) and raw_logo_url:
        uploaded_url = upload_to_supabase_storage(raw_logo_url, f"clubs/{club_id}.png", "image/png")
        if uploaded_url:
            supabase.table("clubs").update({"logo_url": uploaded_url}).eq("id", club_id).execute()

    return club_id


def get_or_create_nation(name):
    if not name:
        return None
    raw_clean = str(name).strip()
    norm = normalize_text_key(raw_clean)
    if raw_clean.lower() in INVALID_ENTITY_NAMES or norm in INVALID_ENTITY_NAMES:
        return None

    # 1) 중복이 자주 발생한 국가 ID 고정 매핑 최우선 적용
    fixed_id = NATION_ID_MAP.get(norm) or NATION_ID_MAP.get(norm.replace("'", ""))
    if fixed_id:
        res_fixed = supabase.table("nations").select("id").eq("id", fixed_id).execute()
        if res_fixed.data:
            return fixed_id

    canonical_name = (
        NATION_ALIAS_MAP.get(norm)
        or NATION_ALIAS_MAP.get(norm.replace("'", ""))
        or raw_clean
    )

    # 2) 정규화 명칭 1차 조회 (최소 정식 ID 우선)
    res = supabase.table("nations").select("id").ilike("name", canonical_name).order("id").execute()
    if res.data:
        return res.data[0]["id"]

    # 3) 공백, 'and', 하이픈 누락 대비 퍼지 검색 (2단어 이상)
    words = [
        w for w in re.split(r"[\s\-_]+", canonical_name)
        if w.lower() not in ["and", "of", "the", "pr", "dr", "republic", "islands"]
    ]
    if len(words) >= 2:
        pattern = "%" + "%".join(words) + "%"
        res_fuzzy = supabase.table("nations").select("id").ilike("name", pattern).order("id").execute()
        if res_fuzzy.data:
            return res_fuzzy.data[0]["id"]

    # 4) DB에 기존 국가가 전혀 없을 때만 신규 생성
    try:
        max_res = supabase.table("nations").select("id").order("id", desc=True).limit(1).execute()
        next_id = (max_res.data[0]["id"] + 1) if max_res.data else 300
        supabase.table("nations").insert({"id": next_id, "name": canonical_name}).execute()
        return next_id
    except Exception:
        return None



def extract_player_urls_from_squad(squad_url):
    clean_url = squad_url.strip()
    print(f"▶ 프로모 스쿼드 페이지 로드 중: {clean_url}")
    resp = requests.get(clean_url, headers=HEADERS, timeout=15)
    if resp.status_code != 200:
        print(f"[오류] HTTP {resp.status_code} 발생")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    found_urls = []
    for a in soup.find_all("a", href=True):
        m = re.search(r"/players/(\d+-[^/]+/27-\d+)/?", a["href"])
        if m:
            full_card_url = f"{BASE_URL}/players/{m.group(1)}/"
            if full_card_url not in found_urls:
                found_urls.append(full_card_url)

    print(f"✔ 총 {len(found_urls)}명의 프로모 선수 카드 링크 추출 완료")
    return found_urls


def player_def_fields(text, card_api_id, player_id=None):
    candidates = []
    for match in re.finditer(r"\bplayerDef\s*:\s*(?:\$R\[\d+\]\s*=\s*)?\{", text):
        depth, quote, escaped = 1, None, False
        begin = match.end()
        fields = {}
        for index in range(begin, len(text)):
            ch = text[index]
            if quote:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == quote:
                    quote = None
                continue
            if ch in ('"', "'"):
                quote = ch
            elif ch in "{[":
                depth += 1
            elif ch in "}]":
                depth -= 1
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
    raise ValueError("playerDef 파싱 실패")


def owned_ids(card, *keys):
    for key in keys:
        if key in card and isinstance(card[key], list):
            return [int(v) for v in card[key] if isinstance(v, (int, str)) and str(v).isdigit()]
    return []


def extract_display_name(card, fallback_info_name=None):
    """카드 표시명 추출: commonName(예: Pedri, Vini Jr.) 최우선, 없을 때만 풀네임 사용"""
    common = (card.get("commonName") or "").strip() if isinstance(card, dict) else ""
    if common:
        return common
    first = (card.get("firstName") or "").strip() if isinstance(card, dict) else ""
    last = (card.get("lastName") or "").strip() if isinstance(card, dict) else ""
    full_from_card = " ".join(p for p in (first, last) if p).strip()
    if full_from_card:
        return full_from_card
    if fallback_info_name and str(fallback_info_name).strip():
        return str(fallback_info_name).strip()
    return "Unknown"


def detect_version_info(
    soup,
    card,
    override_version=None,
    override_bg=None,
    override_type=None,
    is_force_headshot=False,
    acq_info=None,
):
    acq_info = acq_info or {}

    if override_version:
        version = override_version
    else:
        rarity_name = None
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

        if not rarity_name and isinstance(card.get("rarity"), dict) and card["rarity"].get("name"):
            r_name = card["rarity"]["name"].strip()
            if r_name.lower() != "special":
                rarity_name = r_name

        if not rarity_name:
            rarity_name = "Special"

        slug = re.sub(r"[^a-zA-Z0-9]+", "_", rarity_name.strip()).lower().strip("_")
        if slug in ["special", "special_special"]:
            version = "special"
        elif not slug.startswith("special_") and slug not in ["gold", "silver", "bronze", "icon", "hero"]:
            version = f"special_{slug}"
        else:
            version = slug

    background_url = override_bg or f"{TEMPLATE_BASE_URL}/{version}_edited.png"

    has_dynamic = card.get("hasDynamic")
    v_low = version.lower()

    if override_type:
        card_type = normalize_card_type(override_type)
    elif is_force_headshot:
        card_type = "SPECIAL_HEADSHOT"
    elif acq_info.get("token_cost"):
        card_type = "SPECIAL_TOKEN"
    elif acq_info.get("is_sbc") or acq_info.get("sbc_price") or "sbc" in v_low:
        card_type = "POTM" if "potm" in v_low else "SPECIAL_SBC"
    elif acq_info.get("season_pass_level"):
        card_type = "SPECIAL_SEASON"
    elif acq_info.get("is_objective"):
        card_type = "SPECIAL_OBJ"
    elif has_dynamic is False:
        card_type = "SPECIAL_HEADSHOT"
    elif "potm" in v_low:
        card_type = "POTM"
    elif "totw" in v_low:
        card_type = "TOTW"
    else:
        card_type = "SPECIAL"

    return version, background_url, card_type


def parse_card_page(
    url,
    custom_version=None,
    custom_bg=None,
    custom_type=None,
    force_headshot=False,
    custom_token_cost=None,
    custom_sbc_price=None,
    custom_season_level=None,
):
    clean_url = url.split("?")[0].rstrip("/") + "/"
    resp = requests.get(clean_url, headers=HEADERS, timeout=12)
    if resp.status_code != 200:
        print(f"  [오류] HTTP {resp.status_code}")
        return None

    m_ids = re.search(r"/(\d+)-[^/]+/27-(\d+)/?", clean_url)
    if not m_ids:
        return None
    player_id = int(m_ids.group(1))
    card_api_id = int(m_ids.group(2))

    html_text = resp.text
    soup = BeautifulSoup(html_text, "html.parser")
    card = player_def_fields(html_text, card_api_id, player_id)
    clean_full = soup.get_text(separator=" ", strip=True)

    acq_info = extract_acquisition_info(
        html_text,
        clean_full,
        card,
        card_api_id=card_api_id,
        override_type=custom_type,
    )
    if custom_token_cost is not None:
        acq_info["token_cost"] = int(custom_token_cost)
    if custom_sbc_price is not None:
        parsed_sbc = parse_coin_amount(custom_sbc_price)
        if parsed_sbc is not None:
            acq_info["sbc_price"] = parsed_sbc
            acq_info["is_sbc"] = True
    if custom_season_level is not None:
        acq_info["season_pass_level"] = int(custom_season_level)

    info_text = ""
    for el in soup.find_all(["div", "section"]):
        if "Player Information" in el.get_text():
            info_text = el.get_text(separator="\n", strip=True)
            break

    def get_info(label):
        m = re.search(rf"{label}\n+([^\n]+)", info_text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    name = extract_display_name(card, get_info("Name"))
    nation_name = card.get("nation", {}).get("name") if isinstance(card.get("nation"), dict) else get_info("Nation")
    league_name = card.get("league", {}).get("name") if isinstance(card.get("league"), dict) else get_info("League")
    club_name = card.get("club", {}).get("name") if isinstance(card.get("club"), dict) else get_info("Club")

    club_img_url = extract_asset_url_from_html(html_text, "club")
    league_img_url = extract_asset_url_from_html(html_text, "league")

    raw_img_path = card.get("imagePath")
    player_img_url = f"https://game-assets.fut.gg/cdn-cgi/image/quality=85,format=auto,width=500/{raw_img_path}" if raw_img_path else None
    uploaded_player_img = None
    if player_img_url:
        uploaded_player_img = upload_to_supabase_storage(player_img_url, f"players/{card_api_id}.webp", "image/webp")

    raw_body_type = get_info("Body Type")
    body_type = (
        None
        if (not raw_body_type or raw_body_type.strip().lower() in INVALID_ENTITY_NAMES)
        else raw_body_type.strip()
    )
    accele_type = "Controlled"
    m_acc = re.search(
        r"AcceleRATE(?:\s*2\.0)?\s*[:\n\s\-]*(Mostly\s+Explosive|Controlled\s+Explosive|Explosive|Mostly\s+Lengthy|Controlled\s+Lengthy|Lengthy|Controlled)",
        clean_full,
        re.IGNORECASE,
    )
    if m_acc:
        accele_type = " ".join(w.capitalize() for w in m_acc.group(1).split())

    height = int(card.get("height") or 180)
    weight = int(card.get("weight") or 75)
    preferred_foot = {1: "Right", 2: "Left"}.get(card.get("foot"), "Right")
    sm = int(card.get("skillMoves") or 3)
    wf = int(card.get("weakFoot") or 3)
    overall = int(card.get("overall") or 80)

    is_partners_card = (
        normalize_league_key(league_name) == "partners league"
        or normalize_text_key(club_name) in ("club 113307", "partnerships", "partners league")
    )
    version, background_url, card_type = detect_version_info(
        soup,
        card,
        custom_version,
        custom_bg,
        custom_type,
        is_force_headshot=(force_headshot or is_partners_card),
        acq_info=acq_info,
    )

    primary_pos_str, primary_pid = EA_POS_MAP.get(card.get("position"), ("ST", 1))
    sec_pos_ids = [
        EA_POS_MAP[p][1]
        for p in owned_ids(card, "alternativePositionIds")
        if p in EA_POS_MAP and EA_POS_MAP[p][1] != primary_pid
    ]

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
        "height": height,
        "weight": weight,
        "overall": overall,
        "version": version,
        "card_type": card_type,
        "background_url": background_url,
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
        "token_cost": acq_info["token_cost"],
        "sbc_price": acq_info["sbc_price"],
        "season_pass_level": acq_info["season_pass_level"],
    }


def save_to_supabase(data):
    global _WARNED_MISSING_COLS
    if not data:
        return

    p_id = data["player_id"]
    card_api_id = data["api_id"]
    name = data["name"]

    league_id = get_or_create_league(data.get("league_name"), raw_img_url=data.get("league_raw_url"))
    club_id = get_or_create_club(data.get("club_name"), league_id=league_id, raw_logo_url=data.get("club_raw_url"))
    nation_id = get_or_create_nation(data.get("nation_name"))

    player_cols = get_table_columns("players")
    player_payload = {"id": p_id, "name": name}
    if nation_id and "nation_id" in player_cols:
        player_payload["nation_id"] = nation_id
    if club_id and "club_id" in player_cols:
        player_payload["club_id"] = club_id
    if league_id and "league_id" in player_cols:
        player_payload["league_id"] = league_id
    if "height" in player_cols and data.get("height"):
        player_payload["height"] = data["height"]
    if "weight" in player_cols and data.get("weight"):
        player_payload["weight"] = data["weight"]

    p_exist = supabase.table("players").select("id, name").eq("id", p_id).execute()
    if p_exist.data:
        existing_name = (p_exist.data[0].get("name") or "").strip()
        update_payload = {k: v for k, v in player_payload.items() if k != "id"}
        if existing_name and existing_name.lower() != "unknown":
            update_payload.pop("name", None)
        if update_payload:
            supabase.table("players").update(update_payload).eq("id", p_id).execute()
    else:
        supabase.table("players").insert(player_payload).execute()

    cv_cols = get_table_columns("card_versions")
    cv_payload = {
        "player_id": p_id,
        "overall": data["overall"],
        "version": data["version"],
        "card_type": data["card_type"],
        "background_url": data["background_url"],
    }
    if "api_id" in cv_cols:
        cv_payload["api_id"] = card_api_id
    if "image_url" in cv_cols and data.get("image_url"):
        cv_payload["image_url"] = data["image_url"]
    if nation_id and "nation_id" in cv_cols:
        cv_payload["nation_id"] = nation_id
    if club_id and "club_id" in cv_cols:
        cv_payload["club_id"] = club_id
    if league_id and "league_id" in cv_cols:
        cv_payload["league_id"] = league_id
    if "body_type" in cv_cols and data.get("body_type"):
        cv_payload["body_type"] = data["body_type"]
    if "wf" in cv_cols:
        cv_payload["wf"] = data.get("weak_foot", 3)
    if "sm" in cv_cols:
        cv_payload["sm"] = data.get("skill_moves", 3)
    if "preferred_foot" in cv_cols:
        cv_payload["preferred_foot"] = data.get("preferred_foot", "Right")
    if "accele_type" in cv_cols:
        cv_payload["accele_type"] = data.get("accele_type", "Controlled")

    missing_cols = []
    for col_name in ("sbc_price", "token_cost", "season_pass_level"):
        val = data.get(col_name)
        if val is not None:
            if col_name in cv_cols:
                cv_payload[col_name] = val
            else:
                missing_cols.append(col_name)
    if missing_cols and not _WARNED_MISSING_COLS:
        print(f"  ⚠️ [안내] card_versions 테이블에 {', '.join(missing_cols)} 컬럼이 없어 해당 값은 저장되지 않습니다.")
        _WARNED_MISSING_COLS = True

    exist_cv = supabase.table("card_versions").select("id").eq("api_id", card_api_id).execute()
    if not exist_cv.data:
        exist_cv = supabase.table("card_versions").select("id").eq("player_id", p_id).eq("version", data["version"]).execute()

    if exist_cv.data:
        card_id = exist_cv.data[0]["id"]
        supabase.table("card_versions").update(cv_payload).eq("id", card_id).execute()
        status_label = f"기존 카드(ID: {card_id}) 갱신"
    else:
        ins_cv = supabase.table("card_versions").insert(cv_payload).execute()
        card_id = ins_cv.data[0]["id"] if ins_cv.data else None
        status_label = f"신규 카드(ID: {card_id}) 생성"

    if not card_id:
        return

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
            if "role_level" in cr_cols:
                row["role_level"] = r["level"]
            elif "level" in cr_cols:
                row["level"] = r["level"]
            role_batch.append(row)
        supabase.table("card_roles").insert(role_batch).execute()

    cpl_cols = get_table_columns("card_playstyles")
    cpl_fk = "card_id" if "card_id" in cpl_cols else "card_version_id"
    supabase.table("card_playstyles").delete().eq(cpl_fk, card_id).execute()
    if data.get("playstyles"):
        ps_batch = []
        for p in data["playstyles"]:
            row = {cpl_fk: card_id, "playstyle_id": p["playstyle_id"]}
            if "is_plus" in cpl_cols:
                row["is_plus"] = p["is_plus"]
            ps_batch.append(row)
        supabase.table("card_playstyles").insert(ps_batch).execute()

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

    extra_tags = []
    if data.get("token_cost"):
        extra_tags.append(f"토큰: {data['token_cost']:,}")
    if data.get("sbc_price"):
        extra_tags.append(f"SBC가: {data['sbc_price']:,} C")
    if data.get("season_pass_level"):
        extra_tags.append(f"시즌패스: Lv.{data['season_pass_level']}")
    extra_str = f" | {' / '.join(extra_tags)}" if extra_tags else ""

    print(f"  ✔ [{data['overall']} {data['primary_position_str']}] {name} ({data['card_type']}{extra_str}) ➔ {status_label}")


def run_promo_pipeline(
    target_url,
    override_version=None,
    override_bg=None,
    override_type=None,
    force_headshot=False,
    custom_token_cost=None,
    custom_sbc_price=None,
    custom_season_level=None,
):
    print("=" * 70)
    print("🚀 FUT.GG 프로모 스쿼드 일괄 동기화 파이프라인 (토큰상점/SBC/시즌패스 자동 연동)")
    print(f"   • 대상 URL: {target_url}")
    if override_type:
        print(f"   • 강제 카드타입: {normalize_card_type(override_type)}")
    print("=" * 70)

    if re.search(r"/players/\d+-[^/]+/27-\d+/?", target_url):
        card_urls = [target_url]
    else:
        card_urls = extract_player_urls_from_squad(target_url)

    if not card_urls:
        print("[종료] 적재할 카드 URL을 찾지 못했습니다.")
        return

    success = 0
    total = len(card_urls)
    for idx, card_url in enumerate(card_urls, 1):
        print(f"\n[{idx}/{total}] 수집 중: {card_url}")
        parsed = parse_card_page(
            card_url,
            custom_version=override_version,
            custom_bg=override_bg,
            custom_type=override_type,
            force_headshot=force_headshot,
            custom_token_cost=custom_token_cost,
            custom_sbc_price=custom_sbc_price,
            custom_season_level=custom_season_level,
        )
        if parsed:
            save_to_supabase(parsed)
            success += 1

        if idx < total:
            delay = random.uniform(3.5, 5.0)
            print(f"  ⏳ 봇 차단 방지 대기 중: {delay:.2f}초...")
            time.sleep(delay)

    print("\n" + "=" * 70)
    print(f"🎉 프로모 스쿼드 총 {success}/{total}명 무오류 일괄 적재 완료!")
    print("=" * 70)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="FUT.GG 프로모 스쿼드 일괄 자동 적재기")
    parser.add_argument("url", nargs="?", help="FUT.GG 스쿼드 또는 프로모 페이지 URL")
    parser.add_argument("--version", help="카드 버전 명칭 수동 지정")
    parser.add_argument("--bg", help="배경 템플릿 이미지 URL 수동 지정")
    parser.add_argument(
        "--card-type",
        help="카드 유형 수동 지정 (예: SPECIAL, SPECIAL_SBC, SPECIAL_TOKEN, SPECIAL_SEASON)",
    )
    parser.add_argument("--headshot", action="store_true", help="헤드샷 카드 강제 지정")
    parser.add_argument("--token-cost", type=int, help="토큰 가격 수동 지정 (예: 300)")
    parser.add_argument("--sbc-price", type=str, help="SBC 예상 코인 가격 수동 지정 (예: 335.4K 또는 80000)")
    parser.add_argument("--season-level", type=int, help="시즌 패스 레벨 수동 지정 (예: 25)")
    args = parser.parse_args()

    input_url = args.url if args.url else input("FUT.GG 프로모 스쿼드 URL을 입력하세요: ").strip()
    if input_url:
        run_promo_pipeline(
            input_url,
            override_version=args.version,
            override_bg=args.bg,
            override_type=args.card_type,
            force_headshot=args.headshot,
            custom_token_cost=args.token_cost,
            custom_sbc_price=args.sbc_price,
            custom_season_level=args.season_level,
        )
