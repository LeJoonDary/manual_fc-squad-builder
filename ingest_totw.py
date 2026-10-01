import argparse
import html as html_lib
import json
import os
from pathlib import Path
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

supabase: Client = None
if SUPABASE_URL and SERVICE_ROLE_KEY:
  try:
    supabase = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
  except Exception as e:
    pass

BASE_URL = "https://www.fut.gg"
TOTW_VERSION = "special_totw"
TOTW_BG_URL = "https://iqfbyjvnzthixbxeuewk.supabase.co/storage/v1/object/public/card-templates/special_totw_edited.png"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# -------------------------------------------------------------
# EA 고유 ID -> 우리 DB ID 1:1 직결 매핑 사전
# -------------------------------------------------------------
# 1. EA Position ID -> (포지션 약칭, 우리 DB position_id)
EA_POS_MAP = {
    0: ("GK", 10),
    2: ("RWB", 15),
    3: ("RB", 9),
    5: ("CB", 8),
    7: ("LB", 7),
    8: ("LWB", 14),
    10: ("CDM", 6),
    12: ("RM", 13),
    13: ("RM", 13),
    14: ("CM", 4),
    16: ("LM", 12),
    18: ("CAM", 5),
    21: ("CF", 11),
    23: ("RW", 3),
    25: ("ST", 1),
    27: ("LW", 2),
}

# 2. EA Role ID -> 우리 DB role_id (1~49)
EA_ROLE_TO_DB = {
    1: 48,
    2: 49,
    45: 47,  # GK
    3: 40,
    4: 39,
    5: 42,
    6: 38,
    46: 41,  # RB
    7: 35,
    8: 34,
    9: 37,
    10: 33,
    47: 36,  # LB
    11: 44,
    12: 45,
    13: 43,
    48: 46,  # CB
    14: 31,
    15: 29,
    16: 30,
    17: 32,
    49: 28,  # CDM
    18: 23,
    19: 26,
    20: 24,
    21: 27,
    22: 25,  # CM
    23: 22,
    24: 20,
    25: 21,
    26: 19,  # RM
    27: 18,
    28: 16,
    29: 17,
    30: 15,  # LM
    31: 13,
    32: 14,
    33: 12,
    34: 11,  # CAM
    35: 10,
    36: 8,
    37: 9,  # RW
    38: 7,
    39: 5,
    40: 6,  # LW
    41: 1,
    42: 3,
    43: 2,
    44: 4,  # ST
}

# 3. EA Playstyle ID -> 우리 DB playstyle_id (1~40)
EA_PLAYSTYLE_TO_DB = {
    0: 2,  # Finesse Shot
    1: 25,  # Chip Shot
    2: 3,  # Power Shot
    3: 16,  # Dead Ball
    4: 22,  # Power Header
    5: 4,  # Incisive Pass
    6: 17,  # Pinged Pass
    7: 12,  # Long Ball Pass
    8: 27,  # Tiki Taka
    9: 5,  # Whipped Pass
    10: 24,  # Jockey
    11: 14,  # Block
    12: 9,  # Intercept
    13: 8,  # Anticipate
    14: 29,  # Slide Tackle
    15: 10,  # Bruiser
    16: 7,  # Technical
    17: 6,  # Rapid
    18: 18,  # Flair
    19: 19,  # First Touch
    20: 28,  # Trickster
    21: 23,  # Press Proven
    22: 1,  # Quick Step
    23: 20,  # Relentless
    24: 13,  # Trivela
    25: 21,  # Acrobatic
    26: 30,  # Long Throw
    27: 11,  # Aerial
    28: 15,  # Far Throw
    29: 33,  # Footwork
    30: 26,  # Cross Claimer
    31: 31,  # Rush Out
    32: 34,  # Far Reach
    33: 32,  # Deflector
    34: 37,  # Low Driven Shot
    35: 39,  # Aerial Fortress
    36: 35,  # Enforcer
    37: 38,  # Gamechanger
    38: 40,  # Inventive
    39: 36,  # Precision Header
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
    "major league soccer": 7,
    "mls": 7,
    "premier league": 3,
    "laliga ea sports": 2,
    "laliga": 2,
    "la liga": 2,
    "bundesliga": 4,
    "ligue 1 mcdonald's": 5,
    "ligue 1": 5,
    "serie a enilive": 12,
    "serie a": 12,
    "liga portugal": 13,
    "eredivisie": 21,
    "bundesliga 2": 22,
    "liga bbva mx": 23,
    "liga mx": 23,
    "roshn saudi league": 14,
    "saudi pro league": 14,
    "scottish premiership": 27,
    "trendyol süper lig": 11,
    "süper lig": 11,
    "barclays wsl": 1,
    "liga f moeve": 6,
    "liga f": 6,
    "national women's soccer league": 8,
    "nwsl": 8,
    "google pixel frauen-bundesliga": 9,
    "gpfbl": 9,
    "arkema première ligue": 10,
    "arkema pl": 10,
    "efl championship": 19,
    "k league 1": 48,
    "hellas liga": 18,
    "1a pro league": 17,
    "eliteserien": 25,
    "allsvenskan": 54,
    "ö. bundesliga": 40,
    "superliga": 55,
    "ekstraklasa": 46,
}

CLUB_ALIAS_MAP = {
    "ss lazio": "latium",
    "lazio": "latium",
    "inter": "lombardia fc",
    "inter milan": "lombardia fc",
    "ac milan": "milano fc",
    "milan": "milano fc",
    "atalanta": "bergamo calcio",
    "as roma": "roma",
}


def get_table_columns(table_name):
  res = supabase.table(table_name).select("*").limit(1).execute()
  return set(res.data[0].keys()) if res.data else set()


def get_or_create_league(name):
  if not name:
    return None
  clean_name = name.strip()
  alias_id = LEAGUE_ALIAS_MAP.get(clean_name.lower())
  if alias_id:
    return alias_id
  res = supabase.table("leagues").select("id").ilike("name", clean_name).execute()
  if res.data:
    return res.data[0]["id"]
  try:
    max_res = (
        supabase.table("leagues")
        .select("id")
        .order("id", desc=True)
        .limit(1)
        .execute()
    )
    next_id = (max_res.data[0]["id"] + 1) if max_res.data else 100
    supabase.table("leagues").insert(
        {"id": next_id, "name": clean_name}
    ).execute()
    return next_id
  except Exception:
    return None


def get_or_create_nation(name):
  if not name:
    return None
  clean_name = name.strip()
  res = supabase.table("nations").select("id").ilike("name", clean_name).execute()
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
    supabase.table("nations").insert(
        {"id": next_id, "name": clean_name}
    ).execute()
    return next_id
  except Exception:
    return None


def get_or_create_club(name, league_id=None):
  if not name:
    return None
  clean_name = name.strip()
  if clean_name.lower() in CLUB_ALIAS_MAP:
    clean_name = CLUB_ALIAS_MAP[clean_name.lower()]
  res = supabase.table("clubs").select("id").ilike("name", clean_name).execute()
  if res.data:
    return res.data[0]["id"]
  try:
    club_cols = get_table_columns("clubs")
    max_res = (
        supabase.table("clubs")
        .select("id")
        .order("id", desc=True)
        .limit(1)
        .execute()
    )
    next_id = (max_res.data[0]["id"] + 1) if max_res.data else 1000
    payload = {"id": next_id, "name": clean_name}
    if league_id and "league_id" in club_cols:
      payload["league_id"] = league_id
    supabase.table("clubs").insert(payload).execute()
    return next_id
  except Exception:
    return None


def get_totw_urls(limit=23, stop_at="tzolakis"):
  target_url = (
      f"{BASE_URL}/players/?page=1&rarity_id=%5B3%5D&sorts=-created_at"
  )
  print(f"▶ TOTW 최신 목록 조회 중: {target_url}")
  resp = requests.get(target_url, headers=HEADERS, timeout=12)
  if resp.status_code != 200:
    return []
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
        if len(urls) >= limit:
          break
  print(f"✔ 총 {len(urls)}개 대상 카드 링크 확보 완료")
  return urls


# -------------------------------------------------------------
# 코덱스 검증 완료된 playerDef 추출기
# -------------------------------------------------------------
def player_def_fields(text, api_id):
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
    if (
        fields.get("eaId") == api_id
        or str(fields.get("eaId")) == str(api_id)
        or fields.get("basePlayerEaId") == api_id
    ):
      return fields
  raise ValueError(f"No matching playerDef for eaId={api_id}")


def owned_ids(card, *keys):
  for key in keys:
    if key in card:
      values = card[key]
      if values is None:
        return []
      if isinstance(values, list):
        return [
            int(v)
            for v in values
            if isinstance(v, (int, str)) and str(v).isdigit()
        ]
  return []


def parse_card_page(url):
  resp = requests.get(url, headers=HEADERS, timeout=12)
  if resp.status_code != 200:
    return None

  m_ids = re.search(r"/(\d+)-[^/]+/27-(\d+)/?", url)
  if not m_ids:
    return None
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

  name = get_info("Name") or "Unknown"
  nation_name = get_info("Nation")
  league_name = get_info("League")
  club_name = get_info("Club")
  primary_pos_str = (get_info("Position") or "ST").upper()
  preferred_foot = get_info("Foot") or "Right"
  accele_type = get_info("AcceleRATE") or "Controlled"
  body_type = get_info("Body Type") or "Average Medium"

  raw_wf = get_info("Weak Foot") or ""
  m_wf = re.search(r"(\d)", raw_wf)
  wf = int(m_wf.group(1)) if m_wf else 3

  raw_sm = get_info("Skill Moves") or ""
  m_sm = re.search(r"(\d)", raw_sm)
  sm = int(m_sm.group(1)) if m_sm else 3

  clean_full = soup.get_text(separator=" ", strip=True)
  if "overall" in card and card["overall"]:
    overall = int(card["overall"])
  else:
    m_ovr = re.search(rf"(\d{{2}})\s+{re.escape(name)}", clean_full)
    overall = int(m_ovr.group(1)) if m_ovr else 80

  # 1. 포지션 & 부 포지션 (코덱스 검증 로직)
  if "position" in card and card["position"] in EA_POS_MAP:
    primary_pos_str, primary_pid = EA_POS_MAP[card["position"]]
  else:
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
  roles_list = [
      {"role_id": rid, "level": level} for rid, level in role_values.items()
  ]

  # 3. 플레이스타일
  style_values = {}
  for fields, plus in (
      (("playStyleEaIds", "playstyles"), False),
      (("playStylePlusEaIds", "playstylesPlus"), True),
  ):
    for raw in owned_ids(card, *fields):
      if raw in EA_PLAYSTYLE_TO_DB:
        sid = EA_PLAYSTYLE_TO_DB[raw]
        style_values[sid] = plus or style_values.get(sid, False)
  playstyles_list = [
      {"playstyle_id": sid, "is_plus": plus}
      for sid, plus in style_values.items()
  ]

  # 4. 페이스 6대 스탯
  face_stats = {}
  is_gk = primary_pos_str == "GK"
  if is_gk:
    gk_labels = {
        "pac": r"(?:DIV|DIVING)",
        "sho": r"(?:HAN|HANDLING)",
        "pas": r"(?:KIC|KICKING)",
        "dri": r"(?:REF|REFLEXES)",
        "def": r"(?:SPD|SPEED)",
        "phy": r"(?:POS|POSITIONING)",
    }
    for k, reg in gk_labels.items():
      m = re.search(rf"{reg}\s+(\d{{2}})", clean_full, re.IGNORECASE)
      if m:
        face_stats[k] = int(m.group(1))
  else:
    field_labels = {
        "pac": "PACE",
        "sho": "SHOOTING",
        "pas": "PASSING",
        "dri": "DRIBBLING",
        "def": "DEFENDING",
        "phy": "PHYSICAL",
    }
    for k, lbl in field_labels.items():
      m = re.search(rf"{lbl}\s+(\d{{2}})", clean_full, re.IGNORECASE)
      if m:
        face_stats[k] = int(m.group(1))

  # 5. 세부 29개 스탯
  detail_patterns = {
      "acceleration": r"(?:Acceleration|ACC)\s+(\d{2})",
      "sprint_speed": r"(?:Sprint Speed|Sprint|SPD)\s+(\d{2})",
      "positioning": (
          r"(?:Att\.?\s*Pos\.?(?:itioning)?|Positioning)\s+(\d{2})"
      ),
      "finishing": r"(?:Finishing|FIN)\s+(\d{2})",
      "shot_power": r"(?:Shot Power|Shot Pwr|POW)\s+(\d{2})",
      "long_shots": r"(?:Long Shots?|L\.?\s*Shots?)\s+(\d{2})",
      "volleys": r"(?:Volleys?|VOL)\s+(\d{2})",
      "penalties": r"(?:Penalties|PEN)\s+(\d{2})",
      "vision": r"(?:Vision|VIS)\s+(\d{2})",
      "crossing": r"(?:Crossing|CRO)\s+(\d{2})",
      "fk_accuracy": (
          r"(?:Free Kick Accuracy|FK\.?\s*Acc\.?(?:uracy)?|FK Accuracy|Fk"
          r" Acc\.)\s+(\d{2})"
      ),
      "short_passing": r"(?:Short Passing|Short Pass|S\.?\s*Pass)\s+(\d{2})",
      "long_passing": r"(?:Long Passing|Long Pass|L\.?\s*Pass)\s+(\d{2})",
      "curve": r"(?:Curve|CUR)\s+(\d{2})",
      "agility": r"(?:Agility|AGI)\s+(\d{2})",
      "balance": r"(?:Balance|BAL)\s+(\d{2})",
      "reactions": r"(?:Reactions|REA)\s+(\d{2})",
      "ball_control": (
          r"(?:Ball Control|Ball Cntrl|B\.?\s*Control)\s+(\d{2})"
      ),
      "dribbling_sub": r"(?:Ball Control\s+\d{2}\s+)?Dribbling\s+(\d{2})",
      "composure": r"(?:Composure|COM)\s+(\d{2})",
      "interceptions": r"(?:Interceptions|INT)\s+(\d{2})",
      "heading_accuracy": (
          r"(?:Heading Accuracy|Heading Acc\.?|HEA)\s+(\d{2})"
      ),
      "def_awareness": (
          r"(?:Defensive Awareness|Def\.?\s*Aware\.?(?:ness)?|Def Awareness|Def\."
          r" Aware\.)\s+(\d{2})"
      ),
      "standing_tackle": r"(?:Standing Tackle|Stand Tackle|Stand Tkl)\s+(\d{2})",
      "sliding_tackle": r"(?:Sliding Tackle|Slide Tackle|Slide Tkl)\s+(\d{2})",
      "jumping": r"(?:Jumping|JUM)\s+(\d{2})",
      "stamina": r"(?:Stamina|STA)\s+(\d{2})",
      "strength": r"(?:Strength|STR)\s+(\d{2})",
      "aggression": r"(?:Aggression|AGG)\s+(\d{2})",
  }
  detail_stats = {}
  for col_k, regex_p in detail_patterns.items():
    m_stat = re.search(regex_p, clean_full, re.IGNORECASE)
    if m_stat:
      detail_stats[col_k] = int(m_stat.group(1))

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
      "overall": overall,
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


# -------------------------------------------------------------
# DB 정규화 적재 함수
# -------------------------------------------------------------
def insert_totw_card(data):
  global supabase
  if supabase is None:
    if not SUPABASE_URL or not SERVICE_ROLE_KEY:
      raise ValueError("Supabase 환경 변수를 확인하세요.")
    supabase = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

  p_id = data["player_id"]
  card_api_id = data["api_id"]
  name = data["name"]

  # 1. nations, leagues, clubs
  league_id = get_or_create_league(data.get("league_name"))
  nation_id = get_or_create_nation(data.get("nation_name"))
  club_id = get_or_create_club(data.get("club_name"), league_id=league_id)

  # 2. players
  player_cols = get_table_columns("players")
  player_payload = {"id": p_id, "name": name}
  if nation_id and "nation_id" in player_cols:
    player_payload["nation_id"] = nation_id
  if club_id and "club_id" in player_cols:
    player_payload["club_id"] = club_id
  if league_id and "league_id" in player_cols:
    player_payload["league_id"] = league_id

  p_exist = supabase.table("players").select("id").eq("id", p_id).execute()
  if p_exist.data:
    supabase.table("players").update(player_payload).eq("id", p_id).execute()
  else:
    supabase.table("players").insert(player_payload).execute()

  # 3. card_versions
  cv_cols = get_table_columns("card_versions")
  cv_payload = {
      "player_id": p_id,
      "overall": data.get("overall", 80),
      "version": TOTW_VERSION,
      "card_type": "TOTW",
      "background_url": TOTW_BG_URL,
  }

  if "api_id" in cv_cols:
    cv_payload["api_id"] = card_api_id
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

  exist_cv = (
      supabase.table("card_versions")
      .select("id")
      .eq("api_id", card_api_id)
      .execute()
  )
  if not exist_cv.data:
    exist_cv = (
        supabase.table("card_versions")
        .select("id")
        .eq("player_id", p_id)
        .eq("version", TOTW_VERSION)
        .execute()
    )

  if exist_cv.data:
    card_id = exist_cv.data[0]["id"]
    supabase.table("card_versions").update(cv_payload).eq(
        "id", card_id
    ).execute()
    status_label = f"기존 카드(ID: {card_id}) 갱신 완료 [중복 방지]"
  else:
    ins_cv = supabase.table("card_versions").insert(cv_payload).execute()
    card_id = ins_cv.data[0]["id"] if ins_cv.data else None
    status_label = f"신규 카드 생성 완료 (ID: {card_id})"

  if not card_id:
    return

  # 4-1. card_positions
  cp_cols = get_table_columns("card_positions")
  cp_fk = "card_id" if "card_id" in cp_cols else "card_version_id"
  supabase.table("card_positions").delete().eq(cp_fk, card_id).execute()

  pos_batch = [{
      cp_fk: card_id,
      "position_id": data["primary_pos_id"],
      "is_primary": True,
  }]
  for sec_pid in data.get("secondary_pos_ids", []):
    pos_batch.append(
        {cp_fk: card_id, "position_id": sec_pid, "is_primary": False}
    )
  supabase.table("card_positions").insert(pos_batch).execute()

  # 4-2. card_roles
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

  # 4-3. card_playstyles
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

  # 4-4. player_stats
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

  exist_ps = (
      supabase.table("player_stats")
      .select("id")
      .eq(ps_fk, card_id)
      .limit(1)
      .execute()
  )
  if exist_ps.data:
    supabase.table("player_stats").update(ps_payload).eq(
        ps_fk, card_id
    ).execute()
  else:
    supabase.table("player_stats").insert(ps_payload).execute()

  print(
      f"  ✔ [{data.get('overall')} {data.get('primary_position_str')}] {name} (부"
      f" 포지션: {len(data.get('secondary_pos_ids', []))}개, 롤:"
      f" {len(data.get('roles', []))}개, 플스:"
      f" {len(data.get('playstyles', []))}개) ➔ {status_label}"
  )


# -------------------------------------------------------------
# 메인 파이프라인
# -------------------------------------------------------------
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
  parser.add_argument("--parse-url", help="카드 1건 파싱 검증 (DB 쓰기 없음)")
  parser.add_argument(
      "--limit", type=int, default=23, help="수집할 카드 개수 (기본 23)"
  )
  parser.add_argument(
      "--stop-at",
      type=str,
      default="tzolakis",
      help="수집 중단 대상 슬러그 (기본 tzolakis)",
  )
  args = parser.parse_args()

  if args.parse_url:
    data = parse_card_page(args.parse_url)
    if data is None:
      raise ValueError("카드 페이지 파싱 실패")
    positions = {db: name for name, db in EA_POS_MAP.values()}
    print(f"부 포지션: {[positions[p] for p in data['secondary_pos_ids']]}")
    print(f"롤: {len(data['roles'])}개, 플스: {len(data['playstyles'])}개")
    print(json.dumps(data, ensure_ascii=False, indent=2))
  else:
    run_pipeline(limit=args.limit, stop_at=args.stop_at)