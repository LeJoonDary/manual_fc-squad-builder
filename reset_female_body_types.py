import csv
import json
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


# 2. CSV 파일에서 선수 고유 ID 추출 함수
def extract_pids_from_csv(file_path):
  extracted = set()
  if not os.path.exists(file_path):
    return extracted

  with open(file_path, mode="r", encoding="utf-8", errors="ignore") as f:
    reader = csv.DictReader(f)
    for row in reader:
      # URL 끝 번호 추출 (/aitana-bonmati/241667)
      for url_col in ["url", "player_url"]:
        u = row.get(url_col, "")
        m = re.search(r"/(\d+)/?$", u)
        if m:
          extracted.add(int(m.group(1)))

      # sofifa_id / player_id 직접 추출
      for id_col in ["sofifa_id", "player_id", "id"]:
        val = row.get(id_col)
        if val and str(val).strip().isdigit():
          extracted.add(int(str(val).strip()))

  return extracted


print("=" * 65)
print("▶ [1/2] 모든 여성 선수 데이터 소스(CSV 2종 + JSON) 통합 분석 중...")
print("=" * 65)

female_pids = set()

# 1) female_players.csv 로드
pids_1 = extract_pids_from_csv("female_players.csv")
female_pids.update(pids_1)
print(f"  - female_players.csv: {len(pids_1):,}명 식별")

# 2) female_players_2.csv 로드 (FC 24/SoFIFA 덤프본)
pids_2 = extract_pids_from_csv("female_players_2.csv")
female_pids.update(pids_2)
print(f"  - female_players_2.csv: {len(pids_2):,}명 식별")

# 3) special_cards.json 여성 선수 (TOTW, 히어로, 아이콘 등)
pids_special = set()
if os.path.exists("special_cards.json"):
  with open("special_cards.json", "r", encoding="utf-8", errors="ignore") as f:
    s_cards = json.load(f)
    for c in s_cards:
      if str(c.get("gender")) == "2":
        # 기본 ID 및 카드 버전 ID 모두 포함
        for k in ["basePlayerEaId", "eaId", "id"]:
          if c.get(k):
            pids_special.add(int(c[k]))
female_pids.update(pids_special)
print(f"  - special_cards.json (여성 스페셜): {len(pids_special):,}명 식별")

total_unique_pids = list(female_pids)
print(f"\n✔ 최종 통합된 여성 선수 고유 ID 풀: 총 {len(total_unique_pids):,}명 확보 완료")

if not total_unique_pids:
  print("❌ [오류] 초기화할 대상 선수가 없습니다.")
  sys.exit(1)

# 3. card_versions 테이블 body_type 초고속 일괄 초기화 (NULL)
print("\n▶ [2/2] card_versions 테이블 body_type 일괄 초기화 (NULL) 실행 중...")
batch_size = 100
cleared_cards_count = 0

for i in range(0, len(total_unique_pids), batch_size):
  batch = total_unique_pids[i : i + batch_size]
  try:
    # 100명 단위 배치로 IN 쿼리 실행
    res = (
        supabase.table("card_versions")
        .update({"body_type": None})
        .in_("player_id", batch)
        .execute()
    )
    if res.data:
      cleared_cards_count += len(res.data)
  except Exception:
    # 혹시 대량 쿼리 제한이 걸릴 경우 1건씩 안전 처리
    for pid in batch:
      try:
        r = (
            supabase.table("card_versions")
            .update({"body_type": None})
            .eq("player_id", pid)
            .execute()
        )
        if r.data:
          cleared_cards_count += len(r.data)
      except Exception:
        pass

  if (i + batch_size) % 500 == 0 or (i + batch_size) >= len(total_unique_pids):
    current = min(i + batch_size, len(total_unique_pids))
    print(f"  ... {current:,} / {len(total_unique_pids):,}명 처리 완료")

print("=" * 65)
print(
    f"🎉 [초기화 완료] 여성 선수 {len(total_unique_pids):,}명에 속한 총"
    f" {cleared_cards_count:,}장의 카드 body_type이"
)
print("   깨끗하게 NULL로 초기화되었습니다.")
print("=" * 65)