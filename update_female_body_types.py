import csv
import os
import re
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
CSV_FILE = "female_players.csv"

if not os.path.exists(CSV_FILE):
  print(f"[오류] '{CSV_FILE}' 파일이 프로젝트 폴더에 없습니다.")
  sys.exit(1)


# 2. EA FC 여성 정밀 바디타입 계산 함수
def calculate_female_body_type(height_cm, weight_kg):
  if not height_cm or not weight_kg or height_cm <= 0:
    return "Average Medium"

  # 체격 (Build) 판정
  bmi = weight_kg / ((height_cm / 100) ** 2)
  if bmi < 20.0:
    build = "Lean"
  elif bmi < 24.0:
    build = "Average"
  else:
    build = "Stocky"

  # 신장 (Height) 판정
  if height_cm < 165:
    h_cat = "Short"
  elif height_cm <= 175:
    h_cat = "Medium"
  else:
    h_cat = "Tall"

  return f"{build} {h_cat}"


print("=" * 65)
print("▶ [1/3] female_players.csv 로컬 매핑 풀 로드 중...")
print("=" * 65)

spec_map = {}
with open(CSV_FILE, mode="r", encoding="utf-8", errors="ignore") as f:
  reader = csv.DictReader(f)
  for row in reader:
    try:
      url = row.get("url", "").strip()
      id_match = re.search(r"/(\d+)/?$", url)
      if not id_match:
        continue
      p_id = int(id_match.group(1))

      raw_h = row.get("Height", "")
      h_match = re.search(r"(\d+)\s*cm", raw_h)
      height = int(h_match.group(1)) if h_match else None

      raw_w = row.get("Weight", "")
      w_match = re.search(r"(\d+)\s*kg", raw_w)
      weight = int(w_match.group(1)) if w_match else None

      if height and weight:
        spec_map[p_id] = {
            "height": height,
            "weight": weight,
            "name": row.get("Name", "선수"),
        }
    except Exception:
      continue

print(f"✔ CSV 내 여성 선수 기준 풀: {len(spec_map):,}명 확보")

# 3. DB players 테이블에서 해당 1,006명 특정
print("\n▶ [2/3] DB 내 등록된 여성 선수 매칭 중...")
all_db_players = []
page_size = 1000
start_idx = 0

while True:
  res = (
      supabase.table("players")
      .select("id, name, height, weight")
      .range(start_idx, start_idx + page_size - 1)
      .execute()
  )
  batch = res.data or []
  all_db_players.extend(batch)
  if len(batch) < page_size:
    break
  start_idx += page_size

# CSV 여성 목록과 DB 선수 목록 교집합 추출
female_targets = [p for p in all_db_players if p["id"] in spec_map]
print(f"✔ DB 내 일치하는 여성 선수: 총 {len(female_targets):,}명 확인 완료!")

# 4. card_versions 테이블 body_type 정밀 갱신
print(
    "\n▶ [3/3] card_versions 테이블 body_type 정밀 재적재 시작 (Average Short /"
    " Average Medium)..."
)
updated_cards_total = 0

for idx, p in enumerate(female_targets, start=1):
  p_id = p["id"]
  h = p.get("height") or spec_map[p_id]["height"]
  w = p.get("weight") or spec_map[p_id]["weight"]
  name = p.get("name") or spec_map[p_id]["name"]

  exact_body_type = calculate_female_body_type(h, w)

  try:
    upd_res = (
        supabase.table("card_versions")
        .update({"body_type": exact_body_type})
        .eq("player_id", p_id)
        .execute()
    )
    if upd_res.data:
      updated_cards_total += len(upd_res.data)

    if idx % 100 == 0 or idx == len(female_targets):
      print(
          f"  ... {idx:,} / {len(female_targets):,}명 처리 중 (예: {name} ➔"
          f" {exact_body_type})"
      )
  except Exception as e:
    print(f"  ! ID {p_id} ({name}) 오류: {e}")

print("=" * 65)
print(
    f"🎉 [성공] 여성 선수 {len(female_targets):,}명 (총 {updated_cards_total:,}장의"
    " 카드)의 body_type이 공식 규격으로 완벽히 갱신되었습니다!"
)
print("=" * 65)