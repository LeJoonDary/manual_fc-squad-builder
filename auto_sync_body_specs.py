import csv
import io
import os
import sys
import urllib.request
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

# 2. 여성 축구 선수 데이터셋 로드 (로컬 파일 우선, 없으면 온라인 다운로드)
LOCAL_CSV = "female_players.csv"
REMOTE_URLS = [
    (
        "https://raw.githubusercontent.com/stefanoleone992/ea-sports-fc-datasets/main/female_players_24.csv"
    ),
    (
        "https://raw.githubusercontent.com/stefanoleone992/fifa-datasets/master/female_players_22.csv"
    ),
]

csv_content = ""
print("=" * 65)
print("▶ [1/3] 여성 선수 데이터셋 준비 중 (순수 표준 csv 엔진)...")
print("=" * 65)

if os.path.exists(LOCAL_CSV):
  print(f"✔ 로컬 파일 '{LOCAL_CSV}' 발견! 로컬 데이터를 사용합니다.")
  with open(LOCAL_CSV, "r", encoding="utf-8", errors="ignore") as f:
    csv_content = f.read()
else:
  print("▶ 온라인 오픈소스 저장소에서 여성 선수 데이터셋 수신 시도...")
  for url in REMOTE_URLS:
    try:
      req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
      with urllib.request.urlopen(req, timeout=12) as response:
        csv_content = response.read().decode("utf-8", errors="ignore")
        print(f"  ✔ 다운로드 성공! (URL: {url.split('/')[-1]})")
        break
    except Exception as e:
      print(f"  ! {url.split('/')[-1]} 수신 실패: {e}")

if not csv_content:
  print(
      "[오류] 여성 선수 데이터셋을 가져오지 못했습니다. female_players.csv 파일을"
      " 프로젝트 폴더에 넣어주세요."
  )
  sys.exit(1)

# 3. 내장 csv.DictReader로 신체정보 매핑 테이블 구축 (DLL 사용 없음)
reader = csv.DictReader(io.StringIO(csv_content))
spec_map = {}

for row in reader:
  try:
    # player_id, sofifa_id 등 컬럼 탐색
    p_id = (
        row.get("player_id")
        or row.get("sofifa_id")
        or row.get("id")
        or row.get("ea_id")
    )
    h = row.get("height_cm") or row.get("height")
    w = row.get("weight_kg") or row.get("weight")

    if p_id and h and w:
      p_id_int = int(p_id)
      h_int = int(float(h))
      w_int = int(float(w))
      if h_int > 0 and w_int > 0:
        spec_map[p_id_int] = {"height": h_int, "weight": w_int}
  except Exception:
    continue

print(
    f"✔ 유효 신체정보 매핑 테이블 생성 완료 (총 {len(spec_map):,}명의 선수"
    " 데이터)"
)

# 4. Supabase DB에서 신체정보 결측 선수 전원 조회 (1000건 제한 돌파 페이지네이션)
print("\n▶ [2/3] DB 내 신체정보 결측 선수 조회 중...")
target_players = []
page_size = 1000
start_idx = 0

while True:
  res = (
      supabase.table("players")
      .select("id, name, gender, height, weight")
      .or_("height.is.null,weight.is.null,height.eq.0,weight.eq.0")
      .range(start_idx, start_idx + page_size - 1)
      .execute()
  )
  batch = res.data or []
  target_players.extend(batch)
  if len(batch) < page_size:
    break
  start_idx += page_size

print(f"  - 현재 DB 내 신체정보 누락 대상: 총 {len(target_players):,}명 확보")

# 5. 기존 데이터 100% 보존형 안전 핀포인트 UPDATE 실행
print("\n▶ [3/3] DB 일괄 갱신 실행 중...")
updated_count = 0

for player in target_players:
  p_id = player.get("id")
  if p_id not in spec_map:
    continue

  payload = {}

  # 1) 기존 키가 비어있거나 0일 때만 새 키 값을 채움 (기존 값 절대 보존)
  if not player.get("height") or player.get("height") == 0:
    if spec_map[p_id].get("height"):
      payload["height"] = spec_map[p_id]["height"]

  # 2) 기존 몸무게가 비어있거나 0일 때만 새 몸무게 값을 채움 (기존 값 절대 보존)
  if not player.get("weight") or player.get("weight") == 0:
    if spec_map[p_id].get("weight"):
      payload["weight"] = spec_map[p_id]["weight"]

  # 비어있던 항목만 핀포인트로 UPDATE
  if payload:
    try:
      supabase.table("players").update(payload).eq("id", p_id).execute()
      updated_count += 1
      if updated_count % 100 == 0:
        print(f"  ... {updated_count}명 업데이트 완료")
    except Exception as e:
      print(f"  ! ID {p_id} 업데이트 오류: {e}")

print("=" * 65)
print(
    f"🎉 [성공] 총 {updated_count:,}명의 누락되었던 선수 신체정보(키/몸무게)가"
    " 안전하게 채워졌습니다!"
)
print("=" * 65)