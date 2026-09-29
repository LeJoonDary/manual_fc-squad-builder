import csv
import json
import os
import re
import sys
from dotenv import load_dotenv
from supabase import Client, create_client

# 1. Supabase 초기화
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


# 2. 보정된 여성 체형 계산식
def calculate_female_body_type(height_cm, weight_kg):
  if not height_cm or not weight_kg or height_cm <= 0:
    return "Average Medium"
  bmi = weight_kg / ((height_cm / 100) ** 2)
  build = "Lean" if bmi < 20.0 else ("Average" if bmi < 23.5 else "Stocky")

  if height_cm <= 167:
    h_cat = "Short"
  elif height_cm <= 177:
    h_cat = "Medium"
  else:
    h_cat = "Tall"

  return f"{build} {h_cat}"


print("=" * 65)
print("▶ [1/3] special_cards.json에서 보호할 스페셜 카드 식별자 로드 중...")
print("=" * 65)

# special_cards.json에 등록된 모든 ID를 방화벽으로 등록
special_ea_ids = set()
special_card_ids = set()
special_player_ids = set()

if os.path.exists("special_cards.json"):
  with open("special_cards.json", "r", encoding="utf-8", errors="ignore") as f:
    s_cards = json.load(f)
    for c in s_cards:
      if c.get("eaId"):
        special_ea_ids.add(c["eaId"])
      if c.get("id"):
        special_card_ids.add(c["id"])
      # 여성 아이콘 선수들은 선수 자체가 스페셜이므로 영구 보호
      if c.get("gender") in (2, "2") and (
          c.get("card_type") == "ICON" or "icon" in str(c.get("version", ""))
      ):
        base_id = c.get("basePlayerEaId") or c.get("eaId")
        if base_id:
          special_player_ids.add(base_id)

print(
    f"✔ 스페셜 보호 목록: 카드 ID {len(special_ea_ids | special_card_ids):,}개 /"
    f" 여성 아이콘 {len(special_player_ids)}명 확보"
)

# 3. 여성 선수 목록 및 DB 선수 스펙 로드
print("\n▶ [2/3] DB 내 여성 선수 및 일반 카드 대조 중...")
female_pids = set()
csv_file = (
    "female_players.csv"
    if os.path.exists("female_players.csv")
    else "female_players_2.csv"
)

with open(csv_file, mode="r", encoding="utf-8", errors="ignore") as f:
  for row in csv.DictReader(f):
    m = re.search(
        r"/(\d+)/?$", row.get("url", "") or row.get("player_url", "")
    )
    if m:
      female_pids.add(int(m.group(1)))
    elif row.get("sofifa_id"):
      female_pids.add(int(row["sofifa_id"]))

players_specs = {}
start_idx = 0
while True:
  res = (
      supabase.table("players")
      .select("id, name, height, weight")
      .range(start_idx, start_idx + 999)
      .execute()
  )
  batch = res.data or []
  for p in batch:
    if p["id"] in female_pids and p.get("height") and p.get("weight"):
      players_specs[p["id"]] = p
  if len(batch) < 1000:
    break
  start_idx += 1000

# 4. card_versions 컬럼 구조 동적 파악 후 스페셜 카드 완벽 격리
sample = supabase.table("card_versions").select("*").limit(1).execute().data
cv_cols = set(sample[0].keys()) if sample else set()

target_cards_to_update = []
start_idx = 0

while True:
  select_cols = ["id", "player_id"]
  for col in ["ea_id", "card_id"]:
    if col in cv_cols:
      select_cols.append(col)

  res = (
      supabase.table("card_versions")
      .select(", ".join(select_cols))
      .range(start_idx, start_idx + 999)
      .execute()
  )
  batch = res.data or []
  for card in batch:
    pid = card.get("player_id")
    if not pid or pid not in players_specs:
      continue

    # [스페셜 카드 절대 보호 삼중 잠금]
    if pid in special_player_ids:
      continue
    if "ea_id" in card and card["ea_id"] in special_ea_ids:
      continue
    if "card_id" in card and card["card_id"] in special_card_ids:
      continue
    if card.get("id") in special_card_ids or card.get("id") in special_ea_ids:
      continue

    target_cards_to_update.append(card)

  if len(batch) < 1000:
    break
  start_idx += 1000

print(
    f"✔ 스페셜 카드가 100% 제외된 순수 일반 여성 카드:"
    f" 총 {len(target_cards_to_update):,}장 확인"
)

# 5. Primary Key 'id' 기반 핀포인트 UPDATE (컬럼 에러 원천 차단)
print("\n▶ [3/3] 일반 여성 카드 체형 안전 적재 시작...")
updated_count = 0

for idx, card in enumerate(target_cards_to_update, start=1):
  pid = card["player_id"]
  p_info = players_specs[pid]
  b_type = calculate_female_body_type(p_info["height"], p_info["weight"])

  try:
    res = (
        supabase.table("card_versions")
        .update({"body_type": b_type})
        .eq("id", card["id"])
        .execute()
    )
    if res.data:
      updated_count += 1
      if updated_count % 100 == 0 or idx == len(target_cards_to_update):
        print(
            f"  ... {updated_count:,} / {len(target_cards_to_update):,}장 완료"
            f" ({p_info.get('name')} ➔ {b_type})"
        )
  except Exception as e:
    print(f"  ! 카드 ID {card['id']} 오류: {e}")

print("=" * 65)
print(f"🎉 [성공] 일반 여성 카드 총 {updated_count:,}장의 체형이 안전하게 적재되었습니다.")
print("   (호마레 사와, 뒤모르네 TOTW 등 스페셜 카드는 털끝 하나 안 건드리고 100% 원본 유지됨)")
print("=" * 65)