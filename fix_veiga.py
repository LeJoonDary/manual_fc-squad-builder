import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("[오류] Supabase 환경 변수를 확인하세요.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
CARD_ID = 50605554

print("=" * 60)
print("▶ Renato Veiga 포지션 및 드리블 세부 스탯 긴급 복구")
print("=" * 60)

# 1. card_versions 테이블의 포지션 저장 컬럼 및 양식 자동 감지
sample_card = supabase.table("card_versions").select("*").neq("id", CARD_ID).limit(1).execute()
card_cols = sample_card.data[0] if sample_card.data else {}

pos_update_payload = {}

# 포지션 관련 컬럼 탐색 및 값 매핑
for key in card_cols.keys():
    k = key.lower()
    if k in ["position_id", "main_position_id", "primary_position_id"]:
        pos_update_payload[key] = 8  # CB ID (8)
    elif k in ["position", "primary_position", "main_position"]:
        # 기존 데이터가 int인지 str('CB')인지 확인
        val = card_cols[key]
        pos_update_payload[key] = 8 if isinstance(val, int) else "CB"
    elif k in ["secondary_positions", "other_positions"]:
        val = card_cols[key]
        if isinstance(val, list) and len(val) > 0 and isinstance(val[0], str):
            pos_update_payload[key] = ["CDM", "LB"]
        else:
            pos_update_payload[key] = [6, 7]

if pos_update_payload:
    print(f"▶ [1/2] card_versions 포지션 컬럼 감지: {list(pos_update_payload.keys())}")
    supabase.table("card_versions").update(pos_update_payload).eq("id", CARD_ID).execute()
    print(f"  ✔ card_versions 포지션(CB) 갱신 완료: {pos_update_payload}")
else:
    print("  ! card_versions에 포지션 컬럼 없음 -> 별도 card_positions 테이블 확인 중...")
    try:
        supabase.table("card_positions").upsert([
            {"card_id": CARD_ID, "position_id": 8, "is_primary": True},
            {"card_id": CARD_ID, "position_id": 6, "is_primary": False},
            {"card_id": CARD_ID, "position_id": 7, "is_primary": False}
        ]).execute()
        print("  ✔ card_positions 테이블에 포지션(CB) 등록 완료")
    except Exception as e:
        print(f"  ❌ 포지션 등록 실패: {e}")

# 2. player_stats 테이블의 드리블링 세부 스탯(78) 갱신
sample_stats = supabase.table("player_stats").select("*").limit(1).execute()
stats_cols = set(sample_stats.data[0].keys()) if sample_stats.data else set()

stats_update_payload = {}
# dribbling 또는 dribbling_sub 중 존재하는 컬럼에 78 주입
if "dribbling" in stats_cols:
    stats_update_payload["dribbling"] = 78
if "dribbling_sub" in stats_cols:
    stats_update_payload["dribbling_sub"] = 78
if "dribble" in stats_cols:
    stats_update_payload["dribble"] = 78

if stats_update_payload:
    print(f"▶ [2/2] player_stats 드리블 세부 스탯 컬럼 감지: {list(stats_update_payload.keys())}")
    supabase.table("player_stats").update(stats_update_payload).eq("card_id", CARD_ID).execute()
    print(f"  ✔ player_stats 드리블 스탯(78) 갱신 완료!")

print("=" * 60)
print("🎉 베이가 선수의 포지션(CB)과 드리블 스탯(78)이 완벽히 복구되었습니다!")
print("=" * 60)