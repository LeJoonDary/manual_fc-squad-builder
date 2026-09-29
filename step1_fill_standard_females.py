import csv
import os
import re
import sys
from dotenv import load_dotenv
from supabase import Client, create_client

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
print("▶ [1단계] 일반 여성 카드 기본 체형 일괄 적재 (스페셜 카드 완전 제외)...")
print("=" * 65)

# 1. 여성 선수 ID 풀 로드
female_pids = set()
with open("female_players.csv", mode="r", encoding="utf-8", errors="ignore") as f:
  for row in csv.DictReader(f):
    m = re.search(r"/(\d+)/?$", row.get("url", ""))
    if m:
      female_pids.add(int(m.group(1)))

# 2. DB players 조회
all_players = []
start_idx = 0
while True:
  res = (
      supabase.table("players")
      .select("id, name, height, weight")
      .range(start_idx, start_idx + 999)
      .execute()
  )
  batch = res.data or []
  all_players.extend(batch)
  if len(batch) < 1000:
    break
  start_idx += 1000

p_dict = {
    p["id"]: p
    for p in all_players
    if p["id"] in female_pids and p.get("height") and p.get("weight")
}

# 3. card_versions 중 '일반 카드'만 업데이트 (special, icon, totw 철저 제외)
updated_count = 0
for pid, p in p_dict.items():
  b_type = calculate_female_body_type(p["height"], p["weight"])
  try:
    # rarity가 골드/실버/브론즈 계열이거나 일반 카드만 타겟
    # (card_type 컬럼이 있는 경우 'SPECIAL', 'ICON' 제외)
    query = (
        supabase.table("card_versions")
        .update({"body_type": b_type})
        .eq("player_id", pid)
    )

    # 안전장치: Base Icon, TOTW 등의 명칭이 들어간 카드는 수정 대상에서 제외
    query = (
        query.not_.ilike("rarity_name", "%Icon%")
        .not_.ilike("rarity_name", "%TOTW%")
        .not_.ilike("rarity_name", "%Team of the week%")
    )

    res = query.execute()
    if res.data:
      updated_count += len(res.data)
  except Exception as e:
    print(f"  ! ID {pid} 오류: {e}")

print(f"✔ 일반 카드 총 {updated_count:,}장 기본 체형 적용 완료")
print("=" * 65)