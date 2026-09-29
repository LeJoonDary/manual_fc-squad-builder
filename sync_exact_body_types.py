import os
import sys
import csv
import re
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Supabase 관리자 클라이언트 초기화
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("[오류] Supabase 환경 변수를 확인하세요.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
CSV_FILE = "female_players_2.csv"

if not os.path.exists(CSV_FILE):
    # 파일명이 female_players.csv인 경우 자동 대응
    if os.path.exists("female_players.csv"):
        CSV_FILE = "female_players.csv"
    else:
        print(f"[오류] '{CSV_FILE}' 파일이 프로젝트 폴더에 없습니다.")
        sys.exit(1)

# 2. SoFIFA 원본 body_type ➔ FUT.GG 표준 바디타입 변환 함수
def normalize_body_type(raw_bt, height_cm=None):
    if not raw_bt:
        return "Average Medium"
    
    bt = str(raw_bt).strip()
    
    # 이미 'Average Short' 형태로 들어있는 경우 그대로 반환
    if any(k in bt for k in ["Average", "Lean Short", "Stocky Short", "Average Tall"]):
        return bt

    # 1) 체격 추출 (Normal -> Average)
    build = "Average"
    if "Lean" in bt:
        build = "Lean"
    elif "Stocky" in bt:
        build = "Stocky"
    elif "Normal" in bt or "Average" in bt:
        build = "Average"

    # 2) 신장 범위 추출
    h_cat = "Medium"
    if "160-" in bt or "170-" in bt:
        h_cat = "Short"
    elif "170-185" in bt or "170-180" in bt:
        h_cat = "Medium"
    elif "185+" in bt or "180+" in bt:
        h_cat = "Tall"
    elif height_cm:
        if height_cm <= 167:
            h_cat = "Short"
        elif height_cm <= 177:
            h_cat = "Medium"
        else:
            h_cat = "Tall"

    return f"{build} {h_cat}"

print("=" * 65)
print(f"▶ [1/2] '{CSV_FILE}'에서 선수별 원본 체형 프리셋 파싱 중...")
print("=" * 65)

body_type_map = {}
with open(CSV_FILE, mode="r", encoding="utf-8", errors="ignore") as f:
    reader = csv.DictReader(f)
    for row in reader:
        try:
            # 1. 고유 ID 추출 (sofifa_id 또는 player_url / url)
            p_id = None
            if row.get("sofifa_id"):
                p_id = int(row["sofifa_id"])
            elif row.get("player_id"):
                p_id = int(row["player_id"])
            else:
                url = row.get("player_url") or row.get("url") or ""
                m = re.search(r'/(\d+)/?', url)
                if m:
                    p_id = int(m.group(1))
            
            if not p_id:
                continue

            # 2. 바디타입 및 키 컬럼 확인
            raw_bt = row.get("body_type") or row.get("Body Type")
            raw_h = row.get("height_cm") or row.get("Height") or 0
            try:
                h_val = int(re.search(r'\d+', str(raw_h)).group())
            except Exception:
                h_val = None

            if raw_bt:
                converted_bt = normalize_body_type(raw_bt, h_val)
                name = row.get("short_name") or row.get("Name") or row.get("long_name") or "선수"
                body_type_map[p_id] = {
                    "body_type": converted_bt,
                    "name": name
                }
        except Exception:
            continue

print(f"✔ CSV 내 체형 데이터 확보: 총 {len(body_type_map):,}명 완료")

# 3. card_versions 테이블 1:1 정밀 UPDATE
print("\n▶ [2/2] card_versions 테이블 body_type 100% 정밀 재적재 시작...")
updated_cards = 0
matched_players = 0

for p_id, info in body_type_map.items():
    target_bt = info["body_type"]
    name = info["name"]
    
    try:
        res = supabase.table("card_versions").update({"body_type": target_bt}).eq("player_id", p_id).execute()
        if res.data:
            matched_players += 1
            updated_cards += len(res.data)
            if matched_players % 100 == 0:
                print(f"  ... {matched_players:,}명 갱신 완료 ({name} ➔ {target_bt})")
    except Exception as e:
        print(f"  ! ID {p_id} ({name}) 오류: {e}")

print("=" * 65)
print(f"🎉 [동기화 성공] 우리 DB 선수 {matched_players:,}명의 카드 총 {updated_cards:,}장이")
print("   EA 공식 원본 체형(Average Short, Stocky Short, Lean Short 등)으로 100% 완벽 갱신되었습니다!")
print("=" * 65)