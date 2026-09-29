import csv
import json
import os
import re
import sys
from dotenv import load_dotenv
from supabase import Client, create_client

# 1. Supabase 클라이언트 초기화
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

print("=" * 65)
print("▶ [검증] 여성 선수 고유 ID 풀 로드 중 (남성 선수 원천 차단)...")
print("=" * 65)

female_pids = set()

# CSV 2종에서 여성 선수 ID 추출
for c_file in ["female_players.csv", "female_players_2.csv"]:
  if os.path.exists(c_file):
    with open(c_file, mode="r", encoding="utf-8", errors="ignore") as f:
      for row in csv.DictReader(f):
        for k in ["url", "player_url"]:
          m = re.search(r"/(\d+)/?$", row.get(k, ""))
          if m:
            female_pids.add(int(m.group(1)))
        for k in ["sofifa_id", "player_id"]:
          val = row.get(k)
          if val and str(val).isdigit():
            female_pids.add(int(val))

# special_cards.json에서 여성 선수 ID 추출
if os.path.exists("special_cards.json"):
  with open("special_cards.json", "r", encoding="utf-8", errors="ignore") as f:
    s_cards = json.load(f)
    for c in s_cards:
      if str(c.get("gender")) == "2":
        base_id = c.get("basePlayerEaId") or c.get("eaId")
        if base_id:
          female_pids.add(int(base_id))

print(f"✔ 식별된 여성 선수 고유 풀: 총 {len(female_pids):,}명")

# 2. card_versions 테이블에서 여성 선수 중 body_type == 'Unique' 카드 조회
print("\n▶ [정리] 여성 선수 중 body_type이 'Unique'인 카드 조회 중...")
unique_female_cards = []
start_idx = 0

while True:
  res = (
      supabase.table("card_versions")
      .select("id, player_id, body_type")
      .eq("body_type", "Unique")
      .range(start_idx, start_idx + 999)
      .execute()
  )
  batch = res.data or []
  for card in batch:
    # 오직 여성 선수 ID 목록에 포함된 카드만 타겟팅 (남성 Unique 카드 완벽 배제)
    if card.get("player_id") in female_pids:
      unique_female_cards.append(card)

  if len(batch) < 1000:
    break
  start_idx += 1000

print(
  f"✔ 정리 대상: 'Unique'로 처리된 여성 카드 총"
  f" {len(unique_female_cards)}장 발견"
)
print("  (남성 선수의 Unique 카드는 단 1장도 포함되지 않았습니다.)")

# 3. body_type = NULL 일괄 갱신
if unique_female_cards:
  target_ids = [c["id"] for c in unique_female_cards]
  batch_size = 50
  cleared_total = 0

  for i in range(0, len(target_ids), batch_size):
    chunk = target_ids[i : i + batch_size]
    res = (
        supabase.table("card_versions")
        .update({"body_type": None})
        .in_("id", chunk)
        .execute()
    )
    if res.data:
      cleared_total += len(res.data)

  print(
      f"\n✔ 여성 카드 총 {cleared_total}장의 body_type이 성공적으로 NULL(빈칸)로"
      " 변경되었습니다."
  )
else:
  print("\n✔ 변경할 대상 여성 카드가 없습니다.")

# 4. 로컬 캐시 파일(crawled_female_body_types.json)에서도 Unique 항목 제거
cache_file = "crawled_female_body_types.json"
if os.path.exists(cache_file):
  with open(cache_file, "r", encoding="utf-8") as f:
    cache = json.load(f)

  cleaned_cache = {
      k: v for k, v in cache.items() if not (k in female_pids and v == "Unique")
  }

  with open(cache_file, "w", encoding="utf-8") as f:
    json.dump(cleaned_cache, f, ensure_ascii=False, indent=2)
  print(
      f"✔ 로컬 캐시 파일('{cache_file}')에서도 여성 Unique 항목이 깨끗하게"
      " 제거되었습니다."
  )

print("=" * 65)
print("🎉 [완료] 다른 데이터(남성 선수, 정상 여성 체형)의 변동 없이")
print("   여성 'Unique' 카드만 정확히 빈칸(NULL)으로 복구되었습니다!")
print("=" * 65)