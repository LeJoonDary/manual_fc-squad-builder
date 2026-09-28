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


# 2. 여축 전용 바디타입 계산 공식
def calculate_female_body_type(height_cm, weight_kg):
  if not height_cm or not weight_kg or height_cm <= 0:
    return "Medium"
  bmi = weight_kg / ((height_cm / 100) ** 2)
  if bmi < 20.0:
    return "Lean"
  elif bmi < 23.5:
    return "Medium"
  else:
    return "Stocky"


print("=" * 70)
print("▶ [1/3] CSV 파일 파싱 (Player ID, 키, 몸무게, 바디타입 연산)...")
print("=" * 70)

spec_map = {}
with open(CSV_FILE, mode="r", encoding="utf-8", errors="ignore") as f:
  reader = csv.DictReader(f)
  for row in reader:
    try:
      # URL 끝 번호에서 EA 고유 ID 추출 (예: /241667)
      url = row.get("url", "").strip()
      id_match = re.search(r"/(\d+)/?$", url)
      if not id_match:
        continue
      p_id = int(id_match.group(1))

      # 키 추출 (예: "162cm / 5'4""")
      raw_h = row.get("Height", "")
      h_match = re.search(r"(\d+)\s*cm", raw_h)
      height = int(h_match.group(1)) if h_match else None

      # 몸무게 추출 (예: "53kg / 117lb")
      raw_w = row.get("Weight", "")
      w_match = re.search(r"(\d+)\s*kg", raw_w)
      weight = int(w_match.group(1)) if w_match else None

      if height and weight:
        spec_map[p_id] = {
            "height": height,
            "weight": weight,
            "body_type": calculate_female_body_type(height, weight),
            "name": row.get("Name", "선수"),
        }
    except Exception:
      continue

print(f"✔ CSV 내 유효 선수 매핑 풀 생성 완료: {len(spec_map):,}명")

# 3. [Step 1] players 테이블 업데이트 (키, 몸무게)
print("\n▶ [2/3] players 테이블 결측치(키/몸무게) 동기화...")
target_players = []
start_idx = 0
page_size = 1000

while True:
  res = (
      supabase.table("players")
      .select("id, name, height, weight")
      .or_("height.is.null,weight.is.null,height.eq.0,weight.eq.0")
      .range(start_idx, start_idx + page_size - 1)
      .execute()
  )
  batch = res.data or []
  target_players.extend(batch)
  if len(batch) < page_size:
    break
  start_idx += page_size

players_updated = 0
for p in target_players:
  p_id = p.get("id")
  if p_id not in spec_map:
    continue

  data = spec_map[p_id]
  payload = {}
  if not p.get("height") or p.get("height") == 0:
    payload["height"] = data["height"]
  if not p.get("weight") or p.get("weight") == 0:
    payload["weight"] = data["weight"]

  if payload:
    try:
      supabase.table("players").update(payload).eq("id", p_id).execute()
      players_updated += 1
    except Exception as e:
      print(f"  ! players ID {p_id} 업데이트 오류: {e}")

print(f"✔ players 테이블 완료: {players_updated:,}명 키/몸무게 갱신")

# 4. [Step 2] card_versions 테이블 업데이트 (body_type)
print("\n▶ [3/3] card_versions 테이블 body_type 동기화...")
target_cards = []
start_idx = 0

while True:
  res = (
      supabase.table("card_versions")
      .select("id, player_id, body_type")
      .is_("body_type", "null")
      .range(start_idx, start_idx + page_size - 1)
      .execute()
  )
  batch = res.data or []
  target_cards.extend(batch)
  if len(batch) < page_size:
    break
  start_idx += page_size

cards_updated = 0
for c in target_cards:
  pid = c.get("player_id")
  if pid and pid in spec_map:
    b_type = spec_map[pid]["body_type"]
    try:
      supabase.table("card_versions").update({"body_type": b_type}).eq(
          "id", c["id"]
      ).execute()
      cards_updated += 1
    except Exception as e:
      print(f"  ! card_versions ID {c['id']} 업데이트 오류: {e}")

print(f"✔ card_versions 테이블 완료: {cards_updated:,}장 body_type 갱신")

print("=" * 70)
print(
    f"🎉 [동기화 완료] players {players_updated:,}명 / card_versions"
    f" {cards_updated:,}장 성공적으로 보충되었습니다."
)
print("=" * 70)