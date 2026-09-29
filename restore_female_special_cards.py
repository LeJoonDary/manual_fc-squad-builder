import json
import os
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
JSON_FILE = "special_cards.json"

if not os.path.exists(JSON_FILE):
  print(f"[오류] '{JSON_FILE}' 파일이 프로젝트 폴더에 없습니다.")
  sys.exit(1)

# 2. card_versions 테이블 컬럼 구조 자동 확인
test_res = supabase.table("card_versions").select("*").limit(1).execute()
cv_cols = set(test_res.data[0].keys()) if test_res.data else set()
print("=" * 65)
print(f"▶ card_versions 테이블 컬럼 감지: {list(cv_cols)[:8]} ...")
print("=" * 65)


# 3. FUT.GG bodytypeCode ➔ 표준 Body Type 변환 함수
def convert_futgg_body_type(bt_code, height_cm):
  if bt_code == 10:
    return "Unique"

  # 신장 카테고리 판정
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

  return "Average Medium"


# 4. special_cards.json에서 오직 여성(gender == 2) 스페셜 카드만 필터링
with open(JSON_FILE, "r", encoding="utf-8", errors="ignore") as f:
  all_cards = json.load(f)

female_special_cards = [
    c
    for c in all_cards
    if (c.get("gender") == 2 or c.get("gender") == "2")
    and c.get("bodytypeCode") is not None
]

print(f"✔ JSON 내 여성 스페셜 카드 복구 대상: 총 {len(female_special_cards)}장 감지")
print(
    f"  (남성 선수 {len(all_cards) - len(female_special_cards)}장은 안전하게"
    " 제외되었습니다.)"
)

# 5. card_versions 핀포인트 덮어쓰기 복구
print("\n▶ 여성 스페셜 카드 체형 복구 시작...")
success_count = 0

for item in female_special_cards:
  ea_id = item.get("eaId")
  base_p_id = item.get("basePlayerEaId") or ea_id
  height = item.get("height")
  bt_code = item.get("bodytypeCode")
  name = (
      item.get("commonName")
      or item.get("searchableName")
      or f"{item.get('firstName', '')} {item.get('lastName', '')}".strip()
  )

  correct_body_type = convert_futgg_body_type(bt_code, height)

  try:
    upd_query = supabase.table("card_versions").update(
        {"body_type": correct_body_type}
    )

    # 1순위: 카드 고유의 eaId 컬럼 매칭
    if "ea_id" in cv_cols:
      res = upd_query.eq("ea_id", ea_id).execute()
    elif "card_id" in cv_cols:
      res = upd_query.eq("card_id", ea_id).execute()
    # 2순위: player_id 기반 복합 매칭 (스페셜/오버롤 등)
    else:
      upd_query = upd_query.eq("player_id", base_p_id)
      if "overall" in cv_cols and item.get("overall"):
        upd_query = upd_query.eq("overall", item.get("overall"))
      res = upd_query.execute()

    if res.data:
      success_count += len(res.data)
      print(f"  ✔ {name} (ID: {ea_id}) ➔ {correct_body_type} 복구 완료")
    else:
      print(f"  - {name} (ID: {ea_id}): DB에 해당 카드가 없어 건너뜀")
  except Exception as e:
    print(f"  ! {name} 복구 중 오류: {e}")

print("=" * 65)
print(f"🎉 [복구 완료] 여성 스페셜 카드 총 {success_count}장이")
print("   FUT.GG 원본 체형(Lean Short, Average Short 등)으로 완벽 복구되었습니다!")
print("=" * 65)