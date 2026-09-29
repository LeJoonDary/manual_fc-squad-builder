import json
import os
import sys
from dotenv import load_dotenv
from supabase import Client, create_client

# 1. Supabase 관리자 클라이언트 초기화
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

JSON_FILE = (
    "special_cards.json"
    if os.path.exists("special_cards.json")
    else "special_card.json"
)
CACHE_FILE = "crawled_female_body_types.json"

if not os.path.exists(JSON_FILE):
  print(f"[오류] '{JSON_FILE}' 파일이 프로젝트 폴더에 없습니다.")
  sys.exit(1)


# 2. FUT.GG bodytypeCode -> 체형 변환 함수
def convert_futgg_code(bt_code, height_cm):
  if bt_code is None:
    return None

  # 고유 체형(10)인 경우: 여성 선수 고유 체형 결측 규칙(NULL) 적용
  if bt_code == 10:
    return None

  h_cat = "Medium"
  if height_cm:
    if height_cm <= 167:
      h_cat = "Short"
    elif height_cm <= 177:
      h_cat = "Medium"
    else:
      h_cat = "Tall"

  if bt_code in (1, 5, 7):
    return f"Lean {h_cat}"
  elif bt_code in (2, 4, 8):
    return f"Average {h_cat}"
  elif bt_code in (3, 9):
    return f"Stocky {h_cat}"

  return f"Average {h_cat}"


print("=" * 65)
print(f"▶ [1/3] '{JSON_FILE}'에서 여성 아이콘 및 여성 히어로 분석 중...")
print("=" * 65)

with open(JSON_FILE, "r", encoding="utf-8", errors="ignore") as f:
  all_specials = json.load(f)

# 여성 아이콘 & 히어로 추출
targets = {}
for card in all_specials:
  # 여성 확인
  if str(card.get("gender")) != "2":
    continue

  card_type = str(card.get("card_type", "")).upper()
  version = str(card.get("version", "")).lower()
  is_hero = card.get("isHero") is True
  league_slug = (
      card.get("league", {}).get("slug", "").lower()
      if isinstance(card.get("league"), dict)
      else ""
  )
  club_is_icon = (
      card.get("club", {}).get("isIconClub") is True
      if isinstance(card.get("club"), dict)
      else False
  )
  rarity_slug = (
      card.get("rarity", {}).get("slug", "").lower()
      if isinstance(card.get("rarity"), dict)
      else ""
  )

  is_icon = (
      card_type == "ICON"
      or "icon" in version
      or league_slug == "icons"
      or club_is_icon
      or "icon" in rarity_slug
  )
  is_hero_card = (
      is_hero
      or card_type == "HERO"
      or "hero" in version
      or league_slug == "heroes"
      or "hero" in rarity_slug
  )

  if is_icon or is_hero_card:
    base_id = card.get("basePlayerEaId") or card.get("eaId")
    if not base_id:
      continue

    role_label = "ICON" if is_icon else "HERO"
    name = (
        card.get("searchableName")
        or card.get("commonName")
        or f"{card.get('firstName', '')} {card.get('lastName', '')}".strip()
    )
    # clean name
    name = name.split()[0] + " " + name.split()[1] if len(name.split()) >= 2 else name

    bt_code = card.get("bodytypeCode")
    height = card.get("height")
    weight = card.get("weight")
    final_bt = convert_futgg_code(bt_code, height)

    targets[base_id] = {
        "id": base_id,
        "name": name,
        "role": role_label,
        "ovr": card.get("overall"),
        "bt_code": bt_code,
        "height": height,
        "weight": weight,
        "final_bt": final_bt,
    }

print(f"✔ 총 {len(targets)}명의 여성 아이콘 & 히어로 식별 완료:")
for p in targets.values():
  bt_display = p["final_bt"] if p["final_bt"] else "NULL (체형 없음)"
  code_display = f"코드 {p['bt_code']}" if p["bt_code"] is not None else "코드 없음"
  print(
      f"  - [{p['role']}] {p['name']:<18} (OVR {p['ovr']}) | {p['height']}cm |"
      f" {code_display} ➔ {bt_display}"
  )
print("=" * 65)

# 3. Supabase DB 반영 (card_versions 및 players)
print("\n▶ [2/3] Supabase DB card_versions 및 players 테이블 반영 시작...")

# card_versions 컬럼 확인
sample = supabase.table("card_versions").select("*").limit(1).execute().data
cv_cols = set(sample[0].keys()) if sample else set()

updated_cards = 0
for pid, info in targets.items():
  b_type = info["final_bt"]

  # 1) card_versions 테이블의 body_type 갱신
  try:
    res = (
        supabase.table("card_versions")
        .update({"body_type": b_type})
        .eq("player_id", pid)
        .execute()
    )
    if res.data:
      updated_cards += len(res.data)
  except Exception as e:
    print(f"  ! 카드 버전 갱신 실패 ({info['name']}): {e}")

  # 2) players 테이블 신체 스펙(키, 몸무게) 보정
  try:
    p_update = {}
    if info.get("height"):
      p_update["height"] = info["height"]
    if info.get("weight"):
      p_update["weight"] = info["weight"]
    if p_update:
      supabase.table("players").update(p_update).eq("id", pid).execute()
  except Exception:
    pass

print(
    f"✔ 총 {len(targets)}명의 선수 (카드 {updated_cards}장) DB 동기화 완료!"
)

# 4. 로컬 캐시(crawled_female_body_types.json) 업데이트
print("\n▶ [3/3] 로컬 크롤링 캐시 동기화 중 (추후 크롤러 실행 시 스킵 보장)...")
crawled_cache = {}
if os.path.exists(CACHE_FILE):
  try:
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
      crawled_cache = json.load(f)
  except Exception:
    crawled_cache = {}

for pid, info in targets.items():
  if info["final_bt"]:
    crawled_cache[str(pid)] = info["final_bt"]
  else:
    # 체형 없는 선수는 캐시에서도 삭제하여 안전 상태 유지
    crawled_cache.pop(str(pid), None)

with open(CACHE_FILE, "w", encoding="utf-8") as f:
  json.dump(crawled_cache, f, ensure_ascii=False, indent=2)

print(f"✔ 로컬 캐시 파일('{CACHE_FILE}') 동기화 완료!")
print("=" * 65)
print("🎉 [완료] 여성 아이콘 및 히어로의 공식 체형이 DB에 완벽 복구되었습니다.")
print("   스쿼드 빌더 페이지를 새로고침(F5)하여 확인해 보세요.")
print("=" * 65)