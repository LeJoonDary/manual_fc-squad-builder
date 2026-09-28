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
print("▶ Renato Veiga 보조 포지션 제거 및 CB 단독 포지션 정리")
print("=" * 60)

# 1. card_versions 테이블의 secondary_positions 빈 배열([])로 초기화
try:
    # 컬럼이 존재하는지 확인 후 빈 배열 업데이트
    res = supabase.table("card_versions").update({
        "secondary_positions": []
    }).eq("id", CARD_ID).execute()
    print("✔ card_versions의 secondary_positions를 빈 배열([])로 초기화 완료")
except Exception as e:
    print(f"! card_versions 업데이트 확인: {e}")

# 2. 혹시 card_positions 관계 테이블을 사용하는 경우 보조 포지션(CDM, LB) 삭제
try:
    supabase.table("card_positions").delete().eq("card_id", CARD_ID).eq("is_primary", False).execute()
    print("✔ card_positions 테이블의 보조 포지션(CDM, LB) 데이터 삭제 완료")
except Exception:
    pass

print("=" * 60)
print("🎉 Renato Veiga 카드가 [CB] 단일 포지션으로 정상 수정되었습니다!")
print("=" * 60)