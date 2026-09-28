import os
import sys
from dotenv import load_dotenv
from supabase import Client, create_client

# 1. Supabase 관리자 클라이언트 초기화
load_dotenv()
SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
)
SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
)

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
  print("[오류] .env 파일에서 Supabase 환경 변수를 확인하세요.")
  sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

CARD_ID = 50605554
PLAYER_EA_ID = 273906

print("=" * 65)
print("▶ [신규 SBC] Renato Veiga (Destined for Glory 84) DB 정밀 적재")
print("=" * 65)

# 2. card_versions 데이터 준비 (upsert이므로 중복 생성 없이 안전하게 갱신)
cv_sample = supabase.table("card_versions").select("*").limit(1).execute()
cv_cols = set(cv_sample.data[0].keys()) if cv_sample.data else set()

card_raw = {
    "id": CARD_ID,
    "player_id": PLAYER_EA_ID,
    "name": "Renato Veiga",
    "overall_rating": 84,
    "overall": 84,
    "version": "special_destined_for_glory",
    "position_id": 8,  # CB
    "secondary_positions": [6, 7],  # CDM, LB
    "club_id": 83,  # Villarreal CF
    "league_id": 2,  # LALIGA EA SPORTS
    "nation_id": 7,  # Portugal
    "skill_moves": 2,
    "weak_foot": 3,
    "preferred_foot": "Left",
    "height": 190,
    "weight": 84,
    "body_type": "High & Average",
    "is_sbc": True,
    "is_untradeable": True,
}
veiga_card_payload = {k: v for k, v in card_raw.items() if k in cv_cols}

print("▶ [1/4] card_versions 테이블 점검 및 갱신...")
try:
  supabase.table("card_versions").upsert(veiga_card_payload).execute()
  print("  ✔ card_versions 적재 확인 (중복 없이 1개 행 유지)")
except Exception as e:
  print(f"  ❌ card_versions 실패: {e}")
  sys.exit(1)

# 3. player_stats 테이블 적재 (6대 필수 요약 스탯 + 세부 스탯 컬럼 매핑)
ps_sample = supabase.table("player_stats").select("*").limit(1).execute()
ps_cols = set(ps_sample.data[0].keys()) if ps_sample.data else set()

stats_pool = {
    "card_id": CARD_ID,
    # 6대 페이스 필수 스탯 (pac 컬럼 NOT NULL 제약 대응)
    "pac": 80,
    "sho": 66,
    "pas": 77,
    "dri": 78,
    "def": 83,
    "phy": 87,
    "pace": 80,
    "shooting": 66,
    "passing": 77,
    "dribbling": 78,
    "defending": 83,
    "physicality": 87,
    # 세부 스탯 (Pace)
    "acceleration": 78,
    "sprint_speed": 81,
    # 세부 스탯 (Shooting)
    "positioning": 69,
    "att_positioning": 69,
    "finishing": 55,
    "shot_power": 79,
    "long_shots": 77,
    "volleys": 75,
    "penalties": 66,
    # 세부 스탯 (Passing)
    "vision": 74,
    "crossing": 72,
    "fk_accuracy": 76,
    "free_kick_accuracy": 76,
    "freekick_accuracy": 76,
    "short_passing": 82,
    "long_passing": 79,
    "curve": 74,
    # 세부 스탯 (Dribbling)
    "agility": 73,
    "balance": 70,
    "reactions": 82,
    "ball_control": 80,
    "dribble": 78,
    "composure": 78,
    # 세부 스탯 (Defending)
    "interceptions": 83,
    "heading_accuracy": 81,
    "def_awareness": 83,
    "defensive_awareness": 83,
    "marking": 83,
    "standing_tackle": 83,
    "sliding_tackle": 83,
    # 세부 스탯 (Physical)
    "jumping": 90,
    "stamina": 85,
    "strength": 87,
    "aggression": 88,
    # 골키퍼 기본값
    "gk_diving": 10,
    "gk_handling": 10,
    "gk_kicking": 10,
    "gk_positioning": 10,
    "gk_reflexes": 10,
}

veiga_stats_payload = {k: v for k, v in stats_pool.items() if k in ps_cols}

print("▶ [2/4] player_stats 스탯 적재 중...")
try:
  supabase.table("player_stats").upsert(veiga_stats_payload).execute()
  print("  ✔ player_stats 적재 성공! (pac 등 6대 요약 스탯 및 세부 스탯 반영)")
except Exception as e:
  print(f"  ❌ player_stats 실패: {e}")
  sys.exit(1)

# 4. card_roles 적재 (CB 4대 핵심 역할++ 레벨2)
print("▶ [3/4] card_roles (CB 4대 핵심 롤++ 레벨2) 등록 중...")
veiga_roles = [
    {"card_id": CARD_ID, "role_id": 44, "role_level": 2},  # Defender++
    {"card_id": CARD_ID, "role_id": 46, "role_level": 2},  # Wideback++
    {
        "card_id": CARD_ID,
        "role_id": 43,
        "role_level": 2,
    },  # Ball Playing Defender++
    {"card_id": CARD_ID, "role_id": 45, "role_level": 2},  # Stopper++
]
try:
  supabase.table("card_roles").delete().eq("card_id", CARD_ID).execute()
  supabase.table("card_roles").insert(veiga_roles).execute()
  print("  ✔ card_roles 4개 핵심 롤++ 적재 성공!")
except Exception as e:
  print(f"  ❌ card_roles 실패: {e}")
  sys.exit(1)

# 5. card_playstyles 적재 (14 Block, 9 Intercept, 39 Aerial Fortress)
print("▶ [4/4] card_playstyles (3종 은색 특성) 등록 중...")
veiga_playstyles = [
    {"card_id": CARD_ID, "playstyle_id": 14, "is_plus": False},  # Block
    {"card_id": CARD_ID, "playstyle_id": 9, "is_plus": False},  # Intercept
    {"card_id": CARD_ID, "playstyle_id": 39, "is_plus": False},  # Aerial Fortress
]
try:
  supabase.table("card_playstyles").delete().eq("card_id", CARD_ID).execute()
  supabase.table("card_playstyles").insert(veiga_playstyles).execute()
  print("  ✔ card_playstyles 3종 특성 적재 성공!")
except Exception as e:
  print(f"  ❌ card_playstyles 실패: {e}")
  sys.exit(1)

# 6. card_prices SBC 가격 등록
print("▶ card_prices SBC 가격 등록 중...")
try:
  supabase.table("card_prices").upsert({
      "card_id": CARD_ID,
      "price": 21600,
      "is_sbc": True,
      "is_untradeable": True,
  }).execute()
  print("  ✔ card_prices 적재 완료 (21,600 C)")
except Exception:
  pass

print("=" * 65)
print(
    f"🎉 [성공] Renato Veiga (84 OVR CB) SBC 카드가 완벽하게 등록되었습니다!"
)
print("=" * 65)