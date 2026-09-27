import datetime
import os
import sys
from dotenv import load_dotenv
from supabase import Client, create_client

# 1. Supabase 연결
load_dotenv()
SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
)
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("VITE_SUPABASE_ANON_KEY")
)

if not SUPABASE_URL or not SUPABASE_KEY:
  raise ValueError("Supabase 환경 변수를 찾을 수 없습니다.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=" * 60)
print("▶ C. Espinoza 82 (Squad Foundations) 정밀 데이터 적재")
print("=" * 60)

# 2. players 테이블 대상 선수 확인
player_id = None
if len(sys.argv) > 1 and sys.argv[1].isdigit():
  player_id = int(sys.argv[1])
  print(f"  [1/5] 입력받은 Player ID 사용: {player_id}")
else:
  p_res = (
      supabase.table("players")
      .select("id, name")
      .ilike("name", "%Espinoza%")
      .eq("nation_id", 8)
      .execute()
  )
  if p_res.data:
    player_id = p_res.data[0]["id"]
    print(
        f"  [1/5] players 기존 선수 확인: {p_res.data[0]['name']} (ID:"
        f" {player_id})"
    )
  else:
    new_p = (
        supabase.table("players")
        .insert({
            "name": "C. Espinoza",
            "nation_id": 8,
            "height": 173,
            "weight": 73,
        })
        .execute()
    )
    player_id = new_p.data[0]["id"]
    print(
        f"  [1/5] players 신규 선수 등록 완료: C. Espinoza (생성된 ID:"
        f" {player_id})"
    )

# 신체 스펙 동기화 (173cm, 73kg)
supabase.table("players").update({"height": 173, "weight": 73}).eq(
    "id", player_id
).execute()

# 3. card_versions 적재 (스탯 일절 제외, 순수 카드 메타 정보만 적재)
sample_cv = supabase.table("card_versions").select("*").limit(1).execute().data
cv_cols = set(sample_cv[0].keys()) if sample_cv else set()

EA_ITEM_ID = 50558033
CARD_VERSION = "special_squad_foundations"

raw_cv = {
    "player_id": player_id,
    "api_id": EA_ITEM_ID,
    "overall": 82,
    "version": CARD_VERSION,
    "club_id": 191,  # Nashville SC
    "league_id": 7,  # MLS
    "body_type": "Average Short",
    "sm": 4,
    "wf": 5,
    "preferred_foot": "Right",
    "price": 3200,
    "price_updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "image_url": "2027/player-item-card/27-50558033.webp",
    "background_url": (
        f"{SUPABASE_URL}/storage/v1/object/public/card-templates/special_squad_foundations.png"
    ),
}
valid_cv = {k: v for k, v in raw_cv.items() if k in cv_cols}

cv_chk = (
    supabase.table("card_versions")
    .select("id")
    .eq("api_id", EA_ITEM_ID)
    .execute()
)
if cv_chk.data:
  card_id = cv_chk.data[0]["id"]
  supabase.table("card_versions").update(valid_cv).eq("id", card_id).execute()
  print(f"  [2/5] card_versions 기존 행 갱신 (Card ID: {card_id})")
else:
  cv_res = supabase.table("card_versions").insert(valid_cv).execute()
  card_id = cv_res.data[0]["id"]
  print(f"  [2/5] card_versions 신규 등록 (Card ID: {card_id})")

# 4. player_stats 적재 (6대 스탯 'dri' + 세부 스탯 'dribbling_sub')
sample_ps = supabase.table("player_stats").select("*").limit(1).execute().data
ps_cols = set(sample_ps[0].keys()) if sample_ps else set()

stats_payload = {
    "card_id": card_id,
    # 6대 페이스 스탯
    "pac": 84,
    "sho": 76,
    "pas": 80,
    "dri": 82,
    "def": 55,
    "phy": 71,
    # 29개 세부 인게임 스탯
    "acceleration": 82,
    "sprint_speed": 85,
    "positioning": 77,
    "finishing": 77,
    "shot_power": 78,
    "long_shots": 71,
    "volleys": 80,
    "penalties": 73,
    "vision": 85,
    "crossing": 85,
    "fk_accuracy": 67,
    "short_passing": 78,
    "long_passing": 75,
    "curve": 75,
    "agility": 84,
    "balance": 83,
    "reactions": 75,
    "ball_control": 80,
    # 세부 드리블링 컬럼 매핑
    "dribbling_sub": 84,
    "dribbling": 84,
    "composure": 75,
    "interceptions": 61,
    "heading_accuracy": 52,
    "defensive_awareness": 56,
    "standing_tackle": 54,
    "sliding_tackle": 45,
    "jumping": 73,
    "stamina": 88,
    "strength": 67,
    "aggression": 57,
}

valid_ps = (
    {k: v for k, v in stats_payload.items() if k in ps_cols}
    if ps_cols
    else stats_payload
)

ps_chk = (
    supabase.table("player_stats")
    .select("id")
    .eq("card_id", card_id)
    .execute()
)
if ps_chk.data:
  supabase.table("player_stats").update(valid_ps).eq(
      "card_id", card_id
  ).execute()
else:
  supabase.table("player_stats").insert(valid_ps).execute()

dribble_detail = (
    valid_ps.get("dribbling_sub")
    or valid_ps.get("dribbling")
    or valid_ps.get("dri")
)
print(
    f"  [3/5] player_stats 적재 완료 (DRI: {valid_ps.get('dri')} / 세부 드리블링:"
    f" {dribble_detail})"
)

# 5. card_positions 적재 (RM=13 주포지션, CM=4, CAM=5, RW=3)
supabase.table("card_positions").delete().eq("card_id", card_id).execute()
pos_rows = [
    {"card_id": card_id, "position_id": 13, "is_primary": True},  # RM
    {"card_id": card_id, "position_id": 4, "is_primary": False},  # CM
    {"card_id": card_id, "position_id": 5, "is_primary": False},  # CAM
    {"card_id": card_id, "position_id": 3, "is_primary": False},  # RW
]
supabase.table("card_positions").insert(pos_rows).execute()
print("  [4/5] card_positions 포지션 4개 적재 완료 (RM, CM, CAM, RW)")

# 6. card_playstyles 적재 (Pinged Pass=17, Whipped Pass=5, Rapid=6)
supabase.table("card_playstyles").delete().eq("card_id", card_id).execute()
ps_rows = [
    {"card_id": card_id, "playstyle_id": 17, "is_plus": False},  # Pinged Pass
    {"card_id": card_id, "playstyle_id": 5, "is_plus": False},  # Whipped Pass
    {"card_id": card_id, "playstyle_id": 6, "is_plus": False},  # Rapid
]
supabase.table("card_playstyles").insert(ps_rows).execute()
print(
    "  [5/5] card_playstyles 공식 특성 3개 적재 완료 (Pinged Pass, Whipped"
    " Pass, Rapid)"
)

# 7. card_roles 적재 (16개 전체 역할 role_level = 2, '++' 적용)
supabase.table("card_roles").delete().eq("card_id", card_id).execute()
target_role_ids = [
    # RW Roles (3개)
    8,
    9,
    10,
    # CAM Roles (4개)
    11,
    12,
    13,
    14,
    # RM Roles (4개)
    19,
    20,
    21,
    22,
    # CM Roles (5개)
    23,
    24,
    25,
    26,
    27,
]

role_rows = [
    {"card_id": card_id, "role_id": rid, "role_level": 2}
    for rid in target_role_ids
]
supabase.table("card_roles").insert(role_rows).execute()
print("  * card_roles 16개 역할 전체 '++'(role_level: 2) 적재 완료")

print("=" * 60)
print(f"[완료] C. Espinoza 82 카드가 100% 일치하게 적재되었습니다! (Card ID: {card_id})")
print("=" * 60)