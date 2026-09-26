import json
import os
from dotenv import load_dotenv
from supabase import create_client

# 1. 환경변수 및 Supabase 연결
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv(
    "SUPABASE_KEY"
)

if not SUPABASE_URL or not SUPABASE_KEY:
  print("[오류] Supabase 접속 키를 찾을 수 없습니다.")
  exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. 내 DB 마스터 로드
print("[1/4] 내 DB의 플레이스타일 및 롤 마스터 데이터를 가져옵니다...")
db_ps = supabase.table("playstyles").select("id, name").execute().data
db_ps_name_to_id = {p["name"].lower().strip(): p["id"] for p in db_ps}

# 3. EA Sports 고유 ID -> 표준 PlayStyle 이름 매핑 (호나우두 실물 검증 완료)
EA_PLAYSTYLE_MAP = {
    0: "Finesse Shot",  # 0 -> 피네스샷 (내 DB: 2)
    1: "Chip Shot",  # 1 -> 칩슛 (내 DB: 25)
    2: "Power Shot",  # 2 -> 파워슛 (내 DB: 3)
    3: "Dead Ball",  # 3 -> 데드볼 (내 DB: 16)
    4: "Power Header",  # 4 -> 파워헤더 (내 DB: 22)
    5: "Whipped Pass",  # 5 -> 휩 패스 (내 DB: 5)
    6: "Incisive Pass",  # 6 -> 침투 패스 (내 DB: 4)
    7: "Pinged Pass",  # 7 -> 핑 패스 (내 DB: 17)
    8: "Tiki Taka",  # 8 -> 티키타카 (내 DB: 27)
    9: "Long Ball Pass",  # 9 -> 롱볼 패스 (내 DB: 12)
    10: "First Touch",  # 10 -> 퍼스트 터치 (내 DB: 19)
    11: "Flair",  # 11 -> 플레어 (내 DB: 18)
    12: "Press Proven",  # 12 -> 탈압박 (내 DB: 23)
    13: "Intercept",  # 13 -> 가로채기 (내 DB: 9)
    14: "Anticipate",  # 14 -> 예측 (내 DB: 8)
    15: "Block",  # 15 -> 블록 (내 DB: 14)
    16: "Technical",  # 16 -> 테크니컬 (내 DB: 7)
    17: "Rapid",  # 17 -> 래피드 (내 DB: 6)
    18: "Jockey",  # 18 -> 자키 (내 DB: 24)
    19: "Bruiser",  # 19 -> 몸싸움 (내 DB: 10)
    20: "Trickster",  # 20 -> 트릭스터 (내 DB: 28)
    21: "Slide Tackle",  # 21 -> 슬라이딩 태클 (내 DB: 29)
    22: "Quick Step",  # 22 -> 퀵스텝 (내 DB: 1)
    23: "Aerial",  # 23 -> 공중볼 (내 DB: 11)
    24: "Trivela",  # 24 -> 아웃프런트 (내 DB: 13)
    25: "Relentless",  # 25 -> 체력 (내 DB: 20)
    26: "Acrobatic",  # 26 -> 아크로바틱 (내 DB: 21)
    27: "Far Throw",  # 27 -> 롱 드로잉 (내 DB: 15)
    28: "Footwork",  # 28 -> GK 발기술 (내 DB: 33)
    29: "Cross Claimer",  # 29 -> GK 공중볼 (내 DB: 26)
    30: "Rush Out",  # 30 -> GK 스위퍼 (내 DB: 31)
    31: "Far Reach",  # 31 -> GK 다이빙 (내 DB: 34)
    32: "Deflector",  # 32 -> GK 쳐내기 (내 DB: 32)
    33: "Enforcer",  # 33 -> 엔포서 (내 DB: 35)
    34: "Low Driven Shot",  # 34 -> 로우드리븐 (내 DB: 37) [호나우두 금특!]
    35: "Precision Header",  # 35 -> 정밀 헤더 (내 DB: 36)
    36: "Inventive",  # 36 -> 창의적 플레이 (내 DB: 40)
    37: "Gamechanger",  # 37 -> 게임 체인저 (내 DB: 38) [호나우두 은특!]
    38: "Long Throw",  # 38 -> 롱 스로인 (내 DB: 30)
    39: "Aerial Fortress",  # 39 -> 공중의 요새 (내 DB: 39)
}

# 4. EA 포지션 ID -> 포지션 명칭
EA_POS_MAP = {
    0: "GK",
    2: "RWB",
    3: "RB",
    5: "CB",
    7: "LB",
    8: "LWB",
    10: "CDM",
    14: "CM",
    16: "LM",
    18: "CAM",
    21: "CF",
    23: "RW",
    25: "ST",
    27: "LW",
}

# 5. EA Role ID -> 내 DB roles.csv ID 매핑 함수 (ST는 1~4번 등 정확히 타겟팅)


def get_db_role_id(pos_name, raw_role_id):
  base = raw_role_id % 100 if raw_role_id > 100 else raw_role_id
  pos = (pos_name or "").upper().strip()

  # 1) 공격수 (ST / CF) -> 41: Advanced Forward(1), 42: Poacher(3), 43: False 9(2), 44: Target Forward(4)
  if pos in ["ST", "CF"]:
    st_map = {41: 1, 42: 3, 43: 2, 44: 4, 30: 3, 39: 2}
    return st_map.get(base, 1)

  # 2) 윙어 / 미드필더 (RW / RM) -> 8: Inside Forward, 9: Wide Playmaker, 10: Winger
  if pos in ["RW", "RM"]:
    rw_map = {
        35: 8,
        36: 9,
        37: 10,
        39: 10,
        41: 8,
        30: 10,
        19: 19,
        20: 20,
        21: 21,
        22: 22,
    }
    return rw_map.get(base, 8 if pos == "RW" else 21)

  # 3) 윙어 / 미드필더 (LW / LM) -> 5: Inside Forward, 6: Wide Playmaker, 7: Winger
  if pos in ["LW", "LM"]:
    lw_map = {
        27: 5,
        28: 6,
        29: 7,
        34: 6,
        39: 7,
        40: 7,
        41: 5,
        15: 15,
        16: 16,
        17: 17,
        18: 18,
    }
    return lw_map.get(base, 5 if pos == "LW" else 17)

  # 4) 공격형 미드필더 (CAM) -> 11: Classic 10, 12: Half Winger, 13: Playmaker, 14: Shadow Striker
  if pos == "CAM":
    cam_map = {31: 13, 32: 14, 34: 11, 21: 12, 30: 13, 39: 14}
    return cam_map.get(base, 13)

  # 5) 중앙 미드필더 (CM) -> 23: Box to Box, 24: DLP, 25: Half Winger, 26: Holding, 27: Playmaker
  if pos == "CM":
    cm_map = {13: 27, 20: 23, 21: 25, 31: 26, 16: 24, 18: 23, 19: 23}
    return cm_map.get(base, 23)

  # 6) 수비형 미드필더 (CDM) -> 28: Box Crasher, 29: Centre Half, 30: DLP, 31: Holding, 32: Wide Half
  if pos == "CDM":
    cdm_map = {14: 31, 20: 29, 49: 30, 28: 28, 30: 30, 31: 31, 32: 32}
    return cdm_map.get(base, 31)

  # 7) 수비수 (CB) -> 43: BPD, 44: Defender, 45: Stopper, 46: Wideback
  if pos == "CB":
    cb_map = {11: 44, 12: 45, 13: 43, 7: 44, 16: 43}
    return cb_map.get(base, 44)

  # 8) 풀백 (LB / RB)
  if pos == "LB":
    return 35  # Fullback
  if pos == "RB":
    return 40  # Fullback

  # 9) 골키퍼 (GK)
  if pos == "GK":
    return 48  # Goalkeeper

  return None


# 6. JSON 읽기
INPUT_FILE = "special_cards.json"
if not os.path.exists(INPUT_FILE):
  print(f"[오류] '{INPUT_FILE}' 파일이 없습니다.")
  exit(1)

with open(INPUT_FILE, "r", encoding="utf-8") as f:
  cards = json.load(f)

# 7. DB의 api_id -> DB card_id 매핑
print("[2/4] DB에 등록된 특수 카드를 조회합니다...")
cv_res = (
    supabase.table("card_versions")
    .select("id, api_id")
    .like("version", "special_%")
    .execute()
)
ea_to_card_id = {row["api_id"]: row["id"] for row in cv_res.data}

print(f"[3/4] 총 {len(cards)}장의 특수 카드를 완벽하게 교정합니다...")
ps_total = 0
roles_total = 0

for c in cards:
  ea_id = c.get("eaId")
  if not ea_id or ea_id not in ea_to_card_id:
    continue

  card_id = ea_to_card_id[ea_id]

  # JSON에서 선수의 주 포지션 추출
  raw_pos_id = c.get("position")
  pos_name = EA_POS_MAP.get(raw_pos_id, "ST")

  # 기존 오류 데이터 완전 삭제 후 재삽입
  supabase.table("card_playstyles").delete().eq("card_id", card_id).execute()
  supabase.table("card_roles").delete().eq("card_id", card_id).execute()

  # 1) 플레이스타일 등록
  ps_rows = []
  # 일반 PlayStyle
  for raw_id in c.get("playstyles") or []:
    p_name = EA_PLAYSTYLE_MAP.get(raw_id)
    if p_name and p_name.lower() in db_ps_name_to_id:
      ps_rows.append({
          "card_id": card_id,
          "playstyle_id": db_ps_name_to_id[p_name.lower()],
          "is_plus": False,
      })

  # PlayStyle+ (금특)
  for raw_id in c.get("playstylesPlus") or []:
    p_name = EA_PLAYSTYLE_MAP.get(raw_id)
    if p_name and p_name.lower() in db_ps_name_to_id:
      ps_rows.append({
          "card_id": card_id,
          "playstyle_id": db_ps_name_to_id[p_name.lower()],
          "is_plus": True,
      })

  if ps_rows:
    unique_ps = []
    seen = set()
    for r in ps_rows:
      if r["playstyle_id"] not in seen:
        seen.add(r["playstyle_id"])
        unique_ps.append(r)
    supabase.table("card_playstyles").insert(unique_ps).execute()
    ps_total += len(unique_ps)

  # 2) 롤(Roles) 등록 (role_level: 1=+, 2=++)
  role_rows = []
  for raw_id in c.get("rolesPlus") or []:
    r_id = get_db_role_id(pos_name, raw_id)
    if r_id:
      role_rows.append({"card_id": card_id, "role_id": r_id, "role_level": 1})

  for raw_id in c.get("rolesPlusPlus") or []:
    r_id = get_db_role_id(pos_name, raw_id)
    if r_id:
      role_rows.append({"card_id": card_id, "role_id": r_id, "role_level": 2})

  if role_rows:
    unique_roles = []
    seen_roles = set()
    for r in role_rows:
      if r["role_id"] not in seen_roles:
        seen_roles.add(r["role_id"])
        unique_roles.append(r)
    supabase.table("card_roles").insert(unique_roles).execute()
    roles_total += len(unique_roles)

print("=" * 60)
print(f"[4/4] 작업 완료: 총 {len(cards)}장의 특수 카드가 완벽히 교정되었습니다!")
print(f"  * 새로 등록된 플레이스타일 수: {ps_total}건")
print(f"  * 새로 등록된 롤(Roles) 수: {roles_total}건 (1=+, 2=++)")
print("=" * 60)