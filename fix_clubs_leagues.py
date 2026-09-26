import json
import os
from dotenv import load_dotenv
from supabase import create_client

# 1. .env 파일 자동 로드
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
# Service Role Key를 우선 사용하고, 없으면 일반 Key를 탐색
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
)

# 환경 변수가 안 읽힐 경우 콘솔에 직접 안내
if not SUPABASE_URL or not SUPABASE_KEY:
  print(
      "[오류] .env 파일에서 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY를 찾을"
      " 수 없습니다."
  )
  print(
      "기존에 정상 동작했던 seed_special.py 상단의 URL과 KEY를 직접 변수에"
      " 입력해 주세요."
  )
  exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. 내 DB의 클럽 및 리그 마스터 데이터 가져오기
print("[1/4] 내 DB의 클럽 및 리그 목록을 가져옵니다...")
clubs_res = supabase.table("clubs").select("id, name").execute()
leagues_res = supabase.table("leagues").select("id, name").execute()

club_name_to_id = {c["name"].lower().strip(): c["id"] for c in clubs_res.data}
league_name_to_id = {
    l["name"].lower().strip(): l["id"] for l in leagues_res.data
}

# 3. 이름 불일치 및 아이콘/히어로 전용 별칭(Alias) 사전
CLUB_ALIASES = {
    "icon": 112658,
    "icons": 112658,
    "hall of fut": 132794,
    "manchester united": club_name_to_id.get("man utd"),
    "manchester city": club_name_to_id.get("manchester city"),
    "bayern münchen": club_name_to_id.get("fc bayern münchen"),
    "fc bayern münchen": club_name_to_id.get("fc bayern münchen"),
    "bayern munich": club_name_to_id.get("fc bayern münchen"),
    "ol": club_name_to_id.get("ol"),
    "ol lyonnes": club_name_to_id.get("ol lyonnes"),
    "psg": club_name_to_id.get("paris sg"),
    "losc": club_name_to_id.get("losc lille"),
}

LEAGUE_ALIASES = {
    "icons": 2118,
    "icon": 2118,
    "partners league": 2265,
    "premier league": league_name_to_id.get("premier league"),
    "bundesliga": league_name_to_id.get("bundesliga"),
    "laliga ea sports": league_name_to_id.get("laliga ea sports"),
    "arkema première ligue": league_name_to_id.get("arkema première ligue")
    or league_name_to_id.get("arkema pl"),
    "major league soccer": league_name_to_id.get("mls"),
}

# 4. special_cards.json 읽기
INPUT_FILE = "special_cards.json"
if not os.path.exists(INPUT_FILE):
  print(f"[오류] '{INPUT_FILE}' 파일이 없습니다.")
  exit(1)

with open(INPUT_FILE, "r", encoding="utf-8") as f:
  cards = json.load(f)

print(f"[2/4] 총 {len(cards)}장의 특수 카드를 검사하고 매핑합니다...")

success_count = 0
not_found_clubs = set()
not_found_leagues = set()

# 5. 카드별 실제 DB ID 매핑 및 업데이트
for c in cards:
  ea_id = c.get("eaId")
  if not ea_id:
    continue

  raw_club_name = (c.get("club") or {}).get("name", "").strip()
  raw_league_name = (c.get("league") or {}).get("name", "").strip()

  c_lower = raw_club_name.lower()
  l_lower = raw_league_name.lower()

  target_club_id = CLUB_ALIASES.get(c_lower) or club_name_to_id.get(c_lower)
  target_league_id = LEAGUE_ALIASES.get(l_lower) or league_name_to_id.get(
      l_lower
  )

  # 아이콘 특별 예외
  if c.get("leagueEaId") == 2118 or (c.get("club") or {}).get("isIconClub"):
    target_club_id = 112658
    target_league_id = 2118

  if not target_club_id:
    not_found_clubs.add(raw_club_name)
  if not target_league_id:
    not_found_leagues.add(raw_league_name)

  update_data = {}
  if target_club_id:
    update_data["club_id"] = target_club_id
  if target_league_id:
    update_data["league_id"] = target_league_id

  if update_data:
    try:
      supabase.table("card_versions").update(update_data).eq(
          "api_id", ea_id
      ).execute()
      success_count += 1
    except Exception as e:
      print(f"[오류] EA ID {ea_id} ({c.get('commonName')}) 업데이트 실패: {e}")

print("=" * 60)
print(
    f"[3/4] 작업 완료: 총 {success_count}장의 카드 클럽/리그 정보가"
    " 수정되었습니다."
)
if not_found_clubs:
  print(f"  * DB에서 찾지 못한 클럽명: {not_found_clubs}")
if not_found_leagues:
  print(f"  * DB에서 찾지 못한 리그명: {not_found_leagues}")
print("=" * 60)