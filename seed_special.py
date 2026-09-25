from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import time
import requests

# =====================================================================
# 1. .env 파일 자동 로더 (.env에서 서비스 롤 키 직접 추출)
# =====================================================================
def load_credentials():
  url = None
  key = None
  env_file = Path(".env")
  if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
      line = line.strip()
      if not line or line.startswith("#"):
        continue
      if "=" in line:
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip("'\"")
        if k in ("SUPABASE_URL", "VITE_SUPABASE_URL") and not url:
          url = v
        if k in ("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"):
          key = v
  return url or os.getenv("SUPABASE_URL"), key or os.getenv(
      "SUPABASE_SERVICE_ROLE_KEY"
  )


SUPABASE_URL, SUPABASE_KEY = load_credentials()
INPUT_FILE = "special_cards.json"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# =====================================================================
# 2. 국가명 동의어(Alias) 사전 및 포지션 매핑 표
# =====================================================================
COUNTRY_ALIASES = {
    "netherlands": "holland",
    "the netherlands": "holland",
    "ivory coast": "côte d'ivoire",
    "cote d'ivoire": "côte d'ivoire",
    "south korea": "korea republic",
    "korea": "korea republic",
    "usa": "united states",
    "united states of america": "united states",
    "republic of ireland": "ireland",
    "dr congo": "congo dr",
    "democratic republic of the congo": "congo dr",
    "cape verde": "cape verde islands",
    "curacao": "curaçao",
    "turkey": "türkiye",
}

EA_POS_MAP = {
    0: "GK",
    2: "RWB",
    3: "RB",
    5: "CB",
    7: "LB",
    8: "LWB",
    10: "CDM",
    12: "RM",
    14: "CM",
    16: "LM",
    18: "CAM",
    21: "CF",
    23: "RW",
    25: "ST",
    27: "LW",
}


def map_body_type(bodytype_code, height):
  if bodytype_code is not None and bodytype_code >= 10:
    return "Unique"
  h = height or 180
  tag = "Short" if h < 175 else ("Medium" if h <= 185 else "Tall")
  if bodytype_code == 1:
    return f"Lean {tag}"
  if bodytype_code == 2:
    return f"Stocky {tag}"
  return f"Average {tag}"


def calculate_age(dob):
  if not dob:
    return 28
  try:
    birth_year = (
        int(dob.split("-")[0])
        if isinstance(dob, str)
        else int(str(int(dob))[:4])
    )
    return max(16, min(50, 2026 - birth_year))
  except Exception:
    return 28


def refine_version(pdef):
  v = pdef.get("version")
  if v in [
      "special_base_icon",
      "special_base_hero",
      "special_sbc",
      "special_totw",
  ]:
    return v
  rarity = pdef.get("rarity") or {}
  r_slug = (rarity.get("slug") or "").lower()
  if (
      pdef.get("leagueEaId") == 2118
      or (pdef.get("club") or {}).get("isIconClub")
      or "icon" in r_slug
  ):
    return "special_base_icon"
  if pdef.get("isHero") or "hero" in r_slug:
    return "special_base_hero"
  if pdef.get("isSbcItem") or "sbc" in r_slug:
    return "special_sbc"
  if "totw" in r_slug:
    return "special_totw"
  return f"special_{r_slug.replace('-', '_')}" if r_slug else "special_promo"


# =====================================================================
# 3. 메인 적재 로직 (353명 전원 일괄 적용)
# =====================================================================
def main():
  if not os.path.exists(INPUT_FILE):
    print(
        f"[오류] '{INPUT_FILE}' 파일이 없습니다. 수집을 먼저 완료해 주세요."
    )
    return

  with open(INPUT_FILE, "r", encoding="utf-8") as f:
    cards = json.load(f)

  session = requests.Session()

  print("=" * 65)
  print(f"Supabase 서비스 롤 키 인증 확인 ({SUPABASE_KEY[:10]}...)")
  print("마스터 테이블 (국가, 포지션, 플레이스타일, 역할) 캐싱 중...")

  # 1. 국가 사전 로드 (소문자 표준화)
  res_nats = session.get(
      f"{SUPABASE_URL}/rest/v1/nations?select=id,name", headers=HEADERS
  ).json()
  nat_map = {
      n["name"].strip().lower(): n["id"]
      for n in res_nats
      if isinstance(n, dict)
  }

  # 2. 포지션 사전 로드
  res_pos = session.get(
      f"{SUPABASE_URL}/rest/v1/positions?select=id,name", headers=HEADERS
  ).json()
  pos_map = {
      p["name"].strip().upper(): p["id"] for p in res_pos if isinstance(p, dict)
  }

  # 3. 플레이스타일 사전 로드
  res_ps = session.get(
      f"{SUPABASE_URL}/rest/v1/playstyles?select=id,name", headers=HEADERS
  ).json()
  ps_valid_ids = {
      p["id"] for p in res_ps if isinstance(p, dict) and "id" in p
  }

  # 4. 역할(Roles) 사전 로드
  res_roles = session.get(
      f"{SUPABASE_URL}/rest/v1/roles?select=id,position,role_name",
      headers=HEADERS,
  ).json()
  role_valid_ids = {
      r["id"] for r in res_roles if isinstance(r, dict) and "id" in r
  }

  print(
      f"-> 국가 {len(nat_map)}개, 포지션 {len(pos_map)}개, 특성"
      f" {len(ps_valid_ids)}개 로드 완료"
  )
  print(f"-> 총 {len(cards)}장 Special 카드 전원 일괄 적재 시작\n" + "=" * 65)

  # 세부 34개 스탯 매핑 표
  stat_mapping = {
      "pac": "facePace",
      "sho": "faceShooting",
      "pas": "facePassing",
      "dri": "faceDribbling",
      "def": "faceDefending",
      "phy": "facePhysicality",
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
      "gk_diving": "attributeGkDiving",
      "gk_handling": "attributeGkHandling",
      "gk_kicking": "attributeGkKicking",
      "gk_positioning": "attributeGkPositioning",
      "gk_reflexes": "attributeGkReflexes",
  }

  success_cnt = 0

  # 353명 선수 루프 실행
  for idx, pdef in enumerate(cards, start=1):
    try:
      ea_id = pdef.get("eaId")
      base_player_id = pdef.get("basePlayerEaId") or ea_id
      name = (
          pdef.get("commonName")
          or f"{pdef.get('firstName', '')} {pdef.get('lastName', '')}".strip()
      )
      ovr = pdef.get("overall", 80)
      height = pdef.get("height", 180)
      weight = pdef.get("weight", 75)
      version_name = refine_version(pdef)
      card_type = (
          "ICON"
          if "icon" in version_name
          else ("HERO" if "hero" in version_name else "SPECIAL")
      )
      body_type = map_body_type(pdef.get("bodytypeCode"), height)

      # [1] 국가 매칭 (353명 전원 이름 및 동의어 사전 조회)
      nation_obj = pdef.get("nation") or {}
      raw_nat_name = (nation_obj.get("name") or "").strip().lower()
      target_nat_name = COUNTRY_ALIASES.get(raw_nat_name, raw_nat_name)
      target_nation_id = nat_map.get(target_nat_name) or nat_map.get(
          raw_nat_name
      )

      # [2] 선수 정보 Upsert
      player_payload = {
          "id": base_player_id,
          "name": name,
          "gender": "Female" if pdef.get("gender") == 2 else "Male",
          "height": height,
          "weight": weight,
          "age": calculate_age(pdef.get("dateOfBirth")),
          "nation_id": target_nation_id,
          "long_name": (
              f"{pdef.get('firstName', '')} {pdef.get('lastName', '')}".strip()
              or name
          ),
      }
      session.post(
          f"{SUPABASE_URL}/rest/v1/players?on_conflict=id",
          headers=HEADERS,
          json=player_payload,
      )

      # [3] 카드 버전 Upsert (이미지/백그라운드 URL은 None으로 제거)
      card_ver_payload = {
          "player_id": base_player_id,
          "version": version_name,
          "overall": ovr,
          "price": 0,
          "image_url": None,
          "background_url": None,
          "sm": pdef.get("skillMoves", 3),
          "wf": pdef.get("weakFoot", 3),
          "preferred_foot": "Left" if pdef.get("foot") == 2 else "Right",
          "accele_type": pdef.get("accelerateType") or "Controlled",
          "body_type": body_type,
          "card_type": card_type,
          "api_id": ea_id,
          "price_updated_at": datetime.now(timezone.utc).isoformat(),
      }

      chk_res = session.get(
          f"{SUPABASE_URL}/rest/v1/card_versions?api_id=eq.{ea_id}&version=eq.{version_name}&select=id",
          headers=HEADERS,
      )
      existing = chk_res.json() if chk_res.status_code == 200 else []

      if existing:
        card_id = existing[0]["id"]
        session.patch(
            f"{SUPABASE_URL}/rest/v1/card_versions?id=eq.{card_id}",
            headers=HEADERS,
            json=card_ver_payload,
        )
      else:
        ins_res = session.post(
            f"{SUPABASE_URL}/rest/v1/card_versions",
            headers=HEADERS,
            json=card_ver_payload,
        )
        card_id = ins_res.json()[0]["id"]

      # [4] 세부 스탯 34개 Upsert
      stats_payload = {
          col: pdef.get(fut_key, 0) for col, fut_key in stat_mapping.items()
      }
      stats_payload["card_id"] = card_id
      chk_s = session.get(
          f"{SUPABASE_URL}/rest/v1/player_stats?card_id=eq.{card_id}&select=id",
          headers=HEADERS,
      ).json()
      if chk_s:
        session.patch(
            f"{SUPABASE_URL}/rest/v1/player_stats?card_id=eq.{card_id}",
            headers=HEADERS,
            json=stats_payload,
        )
      else:
        session.post(
            f"{SUPABASE_URL}/rest/v1/player_stats",
            headers=HEADERS,
            json=stats_payload,
        )

      # [5] 포지션 매핑 (353명 전원 약어 변환 후 Supabase positions.id 매핑)
      session.delete(
          f"{SUPABASE_URL}/rest/v1/card_positions?card_id=eq.{card_id}",
          headers=HEADERS,
      )
      pos_records = []
      main_ea_pos = pdef.get("position")
      main_pos_name = EA_POS_MAP.get(main_ea_pos)
      if main_pos_name and main_pos_name in pos_map:
        pos_records.append({
            "card_id": card_id,
            "position_id": pos_map[main_pos_name],
            "is_primary": True,
        })

      for alt_ea in pdef.get("alternativePositionIds") or []:
        alt_name = EA_POS_MAP.get(alt_ea)
        if alt_name and alt_name in pos_map and alt_ea != main_ea_pos:
          pos_records.append({
              "card_id": card_id,
              "position_id": pos_map[alt_name],
              "is_primary": False,
          })

      if pos_records:
        session.post(
            f"{SUPABASE_URL}/rest/v1/card_positions",
            headers=HEADERS,
            json=pos_records,
        )

      # [6] 플레이스타일 매핑 (353명 전원 일반 + 플러스 특성)
      session.delete(
          f"{SUPABASE_URL}/rest/v1/card_playstyles?card_id=eq.{card_id}",
          headers=HEADERS,
      )
      ps_records = []
      for ps in pdef.get("playstyles") or []:
        if not ps_valid_ids or ps in ps_valid_ids:
          ps_records.append(
              {"card_id": card_id, "playstyle_id": ps, "is_plus": False}
          )
      for ps in pdef.get("playstylesPlus") or []:
        if not ps_valid_ids or ps in ps_valid_ids:
          ps_records.append(
              {"card_id": card_id, "playstyle_id": ps, "is_plus": True}
          )
      if ps_records:
        session.post(
            f"{SUPABASE_URL}/rest/v1/card_playstyles",
            headers=HEADERS,
            json=ps_records,
        )

      # [7] 역할(Roles) 매핑 (353명 전원 Roles+ / Roles++)
      session.delete(
          f"{SUPABASE_URL}/rest/v1/card_roles?card_id=eq.{card_id}",
          headers=HEADERS,
      )
      role_records = []
      for r in pdef.get("rolesPlus") or []:
        if not role_valid_ids or r in role_valid_ids:
          role_records.append(
              {"card_id": card_id, "role_id": r, "role_level": 1}
          )
      for r in pdef.get("rolesPlusPlus") or []:
        if not role_valid_ids or r in role_valid_ids:
          role_records.append(
              {"card_id": card_id, "role_id": r, "role_level": 2}
          )
      if role_records:
        session.post(
            f"{SUPABASE_URL}/rest/v1/card_roles",
            headers=HEADERS,
            json=role_records,
        )

      success_cnt += 1
      print(
          f"[{idx}/{len(cards)}] {name} (OVR: {ovr}) -> 국가:"
          f" {target_nat_name.capitalize()}, 포지션: {main_pos_name} 적재 완료"
      )
      time.sleep(0.04)

    except Exception as e:
      print(f"[{idx}/{len(cards)}] 오류: {e}")

  print("\n" + "=" * 65)
  print(
      f"   적재 완료! 총 {len(cards)}명 전원의 국가, 포지션, 특성이 완벽하게"
      " 반영되었습니다."
  )
  print("=" * 65)


if __name__ == "__main__":
  main()