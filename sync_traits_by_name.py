import json
import os
import re
import time
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import requests
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

# 2. 내 DB 마스터 로드 (이름 -> ID 딕셔너리)
print("[1/5] 내 DB의 플레이스타일 및 롤 목록을 로드합니다...")
db_ps = supabase.table("playstyles").select("id, name").execute().data
db_roles = supabase.table("roles").select("id, role_name").execute().data

# 텍스트 정규화 매핑 (소문자, 공백제거)
ps_name_to_id = {
    re.sub(r"[^a-zA-Z0-9]", "", p["name"].lower()): p["id"] for p in db_ps
}
role_name_to_id = {
    re.sub(r"[^a-zA-Z0-9]", "", r["role_name"].lower()): r["id"]
    for r in db_roles
}

# 3. special_cards.json 로드
with open("special_cards.json", "r", encoding="utf-8") as f:
  cards = json.load(f)

# DB card_versions 매핑
cv_res = (
    supabase.table("card_versions")
    .select("id, api_id")
    .like("version", "special_%")
    .execute()
)
ea_to_card_id = {row["api_id"]: row["id"] for row in cv_res.data}

# 4. 캐시 로드 (중단 시 이어받기용)
CACHE_FILE = "traits_cache.json"
cached_data = {}
if os.path.exists(CACHE_FILE):
  try:
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
      cached_data = json.load(f)
    print(
        f"[2/5] 기존 캐시 발견: {len(cached_data)}명 데이터를 이어받습니다."
    )
  except Exception:
    cached_data = {}

# 5. FUT.GG에서 이름 텍스트 크롤링 함수
headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}


def fetch_card_traits(rel_url):
  full_url = f"https://www.fut.gg{rel_url}"
  try:
    resp = requests.get(full_url, headers=headers, timeout=10)
    if resp.status_code != 200:
      return None

    soup = BeautifulSoup(resp.text, "html.parser")
    result = {"playstyles": [], "playstyles_plus": [], "roles": []}

    # 1) 플레이스타일 추출 (alt, title, text 기반)
    for img in soup.find_all("img"):
      alt = img.get("alt", "") or img.get("title", "")
      src = img.get("src", "")
      if "playstyle" in src.lower() or "playstyle" in alt.lower():
        clean_name = (
            alt.replace("PlayStyle+", "")
            .replace("PlayStyle", "")
            .replace("+", "")
            .strip()
        )
        if clean_name and len(clean_name) > 2:
          is_plus = "+" in alt or "plus" in src.lower()
          if is_plus:
            if clean_name not in result["playstyles_plus"]:
              result["playstyles_plus"].append(clean_name)
          else:
            if clean_name not in result["playstyles"]:
              result["playstyles"].append(clean_name)

    # 2) 롤(Roles) 추출
    # HTML 내 ++ 및 + 텍스트 탐색
    for tag in soup.find_all(["span", "div", "p"]):
      text = tag.get_text(strip=True)
      if "++" in text:
        role_clean = text.replace("++", "").strip()
        result["roles"].append({"name": role_clean, "level": 2})
      elif "+" in text and not any(
          p in text for p in ["PlayStyle", "WF", "SM", "OVR"]
      ):
        role_clean = text.replace("+", "").strip()
        result["roles"].append({"name": role_clean, "level": 1})

    return result
  except Exception as e:
    return None


# 6. 크롤링 진행
print(f"[3/5] FUT.GG에서 {len(cards)}장의 텍스트 이름을 동기화합니다...")
count = 0
for c in cards:
  ea_id = str(c.get("eaId"))
  rel_url = c.get("url")

  if ea_id in cached_data or not rel_url:
    continue

  data = fetch_card_traits(rel_url)
  if data:
    cached_data[ea_id] = data
    count += 1
    if count % 10 == 0:
      print(
          f"  -> {len(cached_data)} / {len(cards)} 수집 완료... ({c.get('commonName')})"
      )
      with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cached_data, f, ensure_ascii=False, indent=2)
    time.sleep(0.3)  # 차단 방지 딜레이

with open(CACHE_FILE, "w", encoding="utf-8") as f:
  json.dump(cached_data, f, ensure_ascii=False, indent=2)

# 7. 내 DB ID로 1:1 이름 대조 후 최종 적재
print("[4/5] 긁어온 텍스트 이름을 내 DB ID와 1:1 매칭하여 적재합니다...")
updated_cards = 0

for c in cards:
  ea_id = c.get("eaId")
  str_ea_id = str(ea_id)

  if ea_id not in ea_to_card_id or str_ea_id not in cached_data:
    continue

  card_id = ea_to_card_id[ea_id]
  t_data = cached_data[str_ea_id]

  # 기존 오류 데이터 완전 삭제
  supabase.table("card_playstyles").delete().eq("card_id", card_id).execute()
  supabase.table("card_roles").delete().eq("card_id", card_id).execute()

  # 플레이스타일 삽입
  ps_rows = []
  for p_name in t_data.get("playstyles", []):
    key = re.sub(r"[^a-zA-Z0-9]", "", p_name.lower())
    if key in ps_name_to_id:
      ps_rows.append(
          {"card_id": card_id, "playstyle_id": ps_name_to_id[key], "is_plus": False}
      )

  for p_name in t_data.get("playstyles_plus", []):
    key = re.sub(r"[^a-zA-Z0-9]", "", p_name.lower())
    if key in ps_name_to_id:
      ps_rows.append(
          {"card_id": card_id, "playstyle_id": ps_name_to_id[key], "is_plus": True}
      )

  if ps_rows:
    unique_ps = {r["playstyle_id"]: r for r in ps_rows}.values()
    supabase.table("card_playstyles").insert(list(unique_ps)).execute()

  # 롤 삽입
  role_rows = []
  for r_info in t_data.get("roles", []):
    key = re.sub(r"[^a-zA-Z0-9]", "", r_info["name"].lower())
    if key in role_name_to_id:
      role_rows.append({
          "card_id": card_id,
          "role_id": role_name_to_id[key],
          "role_level": r_info["level"],
      })

  if role_rows:
    unique_roles = {r["role_id"]: r for r in role_rows}.values()
    supabase.table("card_roles").insert(list(unique_roles)).execute()

  updated_cards += 1

print("=" * 60)
print(f"[5/5] 작업 완료: 총 {updated_cards}장의 특수 카드가 '텍스트 1:1 매칭'으로 정상 복구되었습니다!")
print("=" * 60)