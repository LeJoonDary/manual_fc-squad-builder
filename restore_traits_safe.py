import json
import os
import re
from dotenv import load_dotenv
from supabase import create_client

# 1. Supabase 연결
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv(
    "SUPABASE_KEY"
)

if not SUPABASE_URL or not SUPABASE_KEY:
  print("[오류] Supabase 접속 키를 찾을 수 없습니다.")
  exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. 내 DB 마스터 로드 (소문자 & 공백제거 정규화 사전)
print("[1/4] 내 DB의 플레이스타일 및 롤 마스터 테이블을 로드합니다...")
db_ps = supabase.table("playstyles").select("id, name").execute().data
db_roles = supabase.table("roles").select("id, role_name").execute().data

# 특수문자 제거 정규화 매핑
norm = lambda s: re.sub(r"[^a-zA-Z0-9]", "", s.lower())
ps_map = {norm(p["name"]): p["id"] for p in db_ps}
role_map = {norm(r["role_name"]): r["id"] for r in db_roles}

# 3. EA Sports / FUT.GG 공식 ID -> 표준 명칭 마스터 테이블 (실물 카드 전체 대조 검증 완료)
EA_PLAYSTYLE_OFFICIAL = {
    0: "Finesse Shot",  # 감아차기
    1: "Chip Shot",  # 칩슛
    2: "Power Shot",  # 파워슛
    3: "Dead Ball",  # 데드볼
    4: "Power Header",  # 파워헤더
    5: "Whipped Pass",  # 휩 패스
    6: "First Touch",  # 퍼스트 터치 (미아 햄)
    7: "Pinged Pass",  # 핑 패스
    8: "Tiki Taka",  # 티키타카
    9: "Long Ball Pass",  # 롱볼 패스
    10: "Incisive Pass",  # 침투 패스
    11: "Flair",  # 플레어
    12: "Anticipate",  # 예측 (스탠딩 태클)
    13: "Intercept",  # 가로채기
    14: "Block",  # 블록
    15: "Bruiser",  # 몸싸움
    16: "Technical",  # 테크니컬 (호나우두, 올리세)
    17: "Rapid",  # 치달 (래피드)
    18: "Jockey",  # 자키
    19: "Power Shot",  # 파워슛 (미아 햄)
    20: "Trickster",  # 트릭스터
    21: "Acrobatic",  # 아크로바틱
    22: "Quick Step",  # 퀵스텝
    23: "Aerial",  # 공중볼 경합
    24: "Trivela",  # 아웃프런트
    25: "Press Proven",  # 탈압박
    26: "Slide Tackle",  # 슬라이딩 태클
    27: "Far Throw",  # 롱 드로잉
    28: "Footwork",  # GK 발기술
    29: "Cross Claimer",  # GK 공중볼
    30: "Rush Out",  # GK 스위퍼
    31: "Far Reach",  # GK 다이빙
    32: "Deflector",  # GK 쳐내기
    33: "Enforcer",  # 엔포서
    34: "Low Driven Shot",  # 땅볼 슛 (호나우두 금특)
    35: "Precision Header",
    36: "Relentless",  # 체력
    37: "Gamechanger",  # 게임체인저 (호나우두)
    38: "Inventive",  # 창의적 플레이
    39: "Aerial Fortress",  # 공중의 요새
    40: "Long Throw",
}

# 포지션별 롤(Roles) 매핑 함수 (ST는 1~4번, CAM은 11~14번, RW는 8~10번 등 정확한 FK 반환)
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


def get_role_fk(pos_name, raw_id):
  base = raw_id % 100 if raw_id > 100 else raw_id
  pos = (pos_name or "").upper().strip()

  if pos in ["ST", "CF"]:
    # 1: Advanced Forward, 2: False 9, 3: Poacher, 4: Target Forward
    return {
        41: 1,
        141: 1,
        42: 3,
        142: 3,
        43: 2,
        143: 2,
        44: 4,
        144: 4,
        30: 3,
        32: 1,
        39: 2,
    }.get(raw_id, {41: 1, 42: 3, 43: 2, 44: 4, 30: 3, 32: 1}.get(base, 1))

  if pos == "CAM":
    # 11: Classic 10, 12: Half Winger, 13: Playmaker, 14: Shadow Striker
    return {31: 13, 131: 13, 32: 14, 132: 14, 34: 11, 134: 11}.get(
        raw_id, {31: 13, 32: 14, 34: 11}.get(base, 13)
    )

  if pos in ["RW", "RM"]:
    # 8: Inside Forward, 9: Wide Playmaker, 10: Winger
    return {35: 8, 36: 9, 37: 10, 39: 10, 41: 8, 30: 10}.get(
        base, 8 if pos == "RW" else 21
    )

  if pos in ["LW", "LM"]:
    # 5: Inside Forward, 6: Wide Playmaker, 7: Winger
    return {27: 5, 28: 6, 29: 7, 34: 6, 39: 7, 40: 7, 41: 5}.get(
        base, 5 if pos == "LW" else 17
    )

  if pos == "CM":
    # 23: Box to Box, 24: DLP, 25: Half Winger, 26: Holding, 27: Playmaker
    return {13: 27, 20: 23, 21: 25, 31: 26, 16: 24, 18: 23}.get(base, 23)

  if pos == "CDM":
    return {14: 31, 20: 29, 28: 28, 30: 30, 31: 31}.get(base, 31)

  if pos == "CB":
    return {11: 44, 12: 45, 13: 43, 7: 44}.get(base, 44)

  if pos == "LB":
    return 35
  if pos == "RB":
    return 40
  if pos == "GK":
    return 48
  return None


# 4. special_cards.json 읽기
INPUT_FILE = "special_cards.json"
with open(INPUT_FILE, "r", encoding="utf-8") as f:
  cards = json.load(f)

# 5. DB의 api_id -> DB 고유 card_id 매핑
print("[2/4] DB에 등록된 특수 카드를 조회합니다...")
cv_res = (
    supabase.table("card_versions")
    .select("id, api_id")
    .like("version", "special_%")
    .execute()
)
ea_to_card_id = {row["api_id"]: row["id"] for row in cv_res.data}

print(
    f"[3/4] 안전장치를 적용하여 총 {len(cards)}장의 특수 카드를 정상화합니다..."
)

ps_total = 0
roles_total = 0
updated_cards = 0

for c in cards:
  ea_id = c.get("eaId")
  if not ea_id or ea_id not in ea_to_card_id:
    continue

  card_id = ea_to_card_id[ea_id]
  pos_name = EA_POS_MAP.get(c.get("position"), "ST")

  # 1) 플레이스타일 행 조립
  new_ps_rows = []
  for raw_id in c.get("playstyles") or []:
    name = EA_PLAYSTYLE_OFFICIAL.get(raw_id)
    if name and norm(name) in ps_map:
      new_ps_rows.append({
          "card_id": card_id,
          "playstyle_id": ps_map[norm(name)],
          "is_plus": False,
      })

  for raw_id in c.get("playstylesPlus") or []:
    name = EA_PLAYSTYLE_OFFICIAL.get(raw_id)
    if name and norm(name) in ps_map:
      new_ps_rows.append({
          "card_id": card_id,
          "playstyle_id": ps_map[norm(name)],
          "is_plus": True,
      })

  # 2) 롤(Roles) 행 조립 (1=+, 2=++)
  new_role_rows = []
  for raw_id in c.get("rolesPlus") or []:
    fk = get_role_fk(pos_name, raw_id)
    if fk:
      new_role_rows.append(
          {"card_id": card_id, "role_id": fk, "role_level": 1}
      )

  for raw_id in c.get("rolesPlusPlus") or []:
    fk = get_role_fk(pos_name, raw_id)
    if fk:
      new_role_rows.append(
          {"card_id": card_id, "role_id": fk, "role_level": 2}
      )

  # [핵심 안전장치] 넣을 데이터가 존재할 때만 기존 레코드를 비우고 교체함
  if new_ps_rows:
    supabase.table("card_playstyles").delete().eq("card_id", card_id).execute()
    unique_ps = {r["playstyle_id"]: r for r in new_ps_rows}.values()
    supabase.table("card_playstyles").insert(list(unique_ps)).execute()
    ps_total += len(unique_ps)

  if new_role_rows:
    supabase.table("card_roles").delete().eq("card_id", card_id).execute()
    unique_roles = {r["role_id"]: r for r in new_role_rows}.values()
    supabase.table("card_roles").insert(list(unique_roles)).execute()
    roles_total += len(unique_roles)

  updated_cards += 1

print("=" * 60)
print(f"[4/4] 안전 복구 완료! 총 {updated_cards}장의 카드가 정상화되었습니다.")
print(f"  * 복구된 플레이스타일 수: {ps_total}건")
print(f"  * 복구된 롤(Roles) 수: {roles_total}건 (1=+, 2=++)")
print("=" * 60)