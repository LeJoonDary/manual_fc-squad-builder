import csv
import json
import os
import random
import re
import sys
import time
import unicodedata
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import requests
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
CACHE_FILE = "crawled_female_body_types.json"


# 2. FUT.GG 영문 슬러그 변환 함수
def make_slug(name):
  nfkd = unicodedata.normalize("NFKD", str(name))
  clean = "".join([c for c in nfkd if not unicodedata.combining(c)])
  slug = re.sub(r"[^a-zA-Z0-9]+", "-", clean).strip("-").lower()
  return slug


# 3. 체형 코드 변환 함수
def convert_futgg_code(bt_code, height_cm):
  if bt_code == 10:
    return "Unique"
  h_cat = "Short" if height_cm and height_cm <= 167 else "Medium"
  if height_cm and height_cm > 177:
    h_cat = "Tall"

  if bt_code in (1, 5, 7):
    return f"Lean {h_cat}"
  elif bt_code in (2, 4, 8):
    return f"Average {h_cat}"
  elif bt_code in (3, 9):
    return f"Stocky {h_cat}"
  return f"Average {h_cat}"


def extract_body_type_from_soup(soup):
  clean_text = soup.get_text(separator=" ", strip=True)

  # Body Type과 Real Face 사이의 텍스트 탐색
  m_box = re.search(
      r"Body\s*Type\s*[:]?\s*(.*?)\s*Real\s*Face", clean_text, re.IGNORECASE
  )
  if m_box:
    raw_val = m_box.group(1).strip()

    # 오직 EA 정규 규격 체형만 인정 (Lean / Average / Stocky)
    m_std = re.search(
        r"(Lean Short|Lean Medium|Lean Tall|Average Short|Average Medium|Average"
        r" Tall|Stocky Short|Stocky Medium|Stocky Tall)",
        raw_val,
        re.IGNORECASE,
    )
    if m_std:
      return m_std.group(1).title()

    # 선수 이름이 적혀있거나(Tobin Heath, Formiga 등) Unique인 경우 -> 여성 선수는 체형 없음(None) 처리
    return None

  # 보조 표준 체형 매칭
  m = re.search(
      r"Body\s*Type\s*[:]?\s*(Lean Short|Lean Medium|Lean Tall|Average"
      r" Short|Average Medium|Average Tall|Stocky Short|Stocky Medium|Stocky"
      r" Tall)",
      clean_text,
      re.IGNORECASE,
  )
  if m:
    return m.group(1).title()

  return None


print("=" * 65)
print("▶ [1/3] 대상 여성 선수 목록 및 캐시 로드 중...")
print("=" * 65)

# 로컬 캐시 로드 (이어받기용)
crawled_cache = {}
if os.path.exists(CACHE_FILE):
  try:
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
      crawled_cache = json.load(f)
    print(f"✔ 기존 수집된 {len(crawled_cache):,}명 캐시 로드 완료")
  except Exception:
    crawled_cache = {}

# special_cards.json 여성 선수 사전 등록 (웹 요청 0건)
if os.path.exists("special_cards.json"):
  with open("special_cards.json", "r", encoding="utf-8", errors="ignore") as f:
    s_cards = json.load(f)
    for c in s_cards:
      if str(c.get("gender")) == "2" and c.get("bodytypeCode") is not None:
        base_id = str(c.get("basePlayerEaId") or c.get("eaId"))
        crawled_cache[base_id] = convert_futgg_code(
            c["bodytypeCode"], c.get("height")
        )

# CSV 여성 ID 풀
female_pids = set()
for c_file in ["female_players.csv", "female_players_2.csv"]:
  if os.path.exists(c_file):
    with open(c_file, mode="r", encoding="utf-8", errors="ignore") as f:
      for row in csv.DictReader(f):
        for k in ["url", "player_url"]:
          m = re.search(r"/(\d+)/?$", row.get(k, ""))
          if m:
            female_pids.add(int(m.group(1)))
        for k in ["sofifa_id", "player_id"]:
          val = row.get(k)
          if val and str(val).isdigit():
            female_pids.add(int(val))

# players 영문 이름 매핑
player_meta = {}
start_idx = 0
while True:
  p_res = (
      supabase.table("players")
      .select("id, name, height")
      .range(start_idx, start_idx + 999)
      .execute()
  )
  batch = p_res.data or []
  for p in batch:
    player_meta[p["id"]] = {
        "name": p.get("name", ""),
        "height": p.get("height"),
    }
  if len(batch) < 1000:
    break
  start_idx += 1000

# 2. OVR 80+ 여성 선수 그룹화
all_80_cards = []
start_idx = 0
while True:
  res = (
      supabase.table("card_versions")
      .select("id, player_id, overall")
      .gte("overall", 80)
      .range(start_idx, start_idx + 999)
      .execute()
  )
  batch = res.data or []
  all_80_cards.extend(batch)
  if len(batch) < 1000:
    break
  start_idx += 1000

unique_female_targets = {}
for card in all_80_cards:
  pid = card.get("player_id")
  if pid in female_pids:
    if pid not in unique_female_targets:
      unique_female_targets[pid] = {
          "max_ovr": card["overall"],
          "card_count": 1,
      }
    else:
      unique_female_targets[pid]["card_count"] += 1
      unique_female_targets[pid]["max_ovr"] = max(
          unique_female_targets[pid]["max_ovr"], card["overall"]
      )

print(f"✔ 총 대상 선수: {len(unique_female_targets):,}명")
print(
    f"  - 이미 완료된 캐시 보유 (0초 통과): "
    f"{len([p for p in unique_female_targets if str(p) in crawled_cache])}명"
)
print(
    f"  - 신규 처리 대상: "
    f"{len([p for p in unique_female_targets if str(p) not in crawled_cache])}명"
)
print("=" * 65)

# 3. 크롤링 세션 및 헤더 설정
headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.fut.gg/players/",
}

session = requests.Session()


def safe_request(url, max_retries=3):
  for attempt in range(max_retries):
    try:
      resp = session.get(url, headers=headers, timeout=12, allow_redirects=True)
      if resp.status_code == 200:
        return resp
      elif resp.status_code == 429:
        wait_sec = int(resp.headers.get("Retry-After", 30))
        print(f"\n  ⏳ [서버 429 감지] {wait_sec}초 동안 안전 대기 후 재시도합니다...")
        time.sleep(wait_sec + 2)
      elif resp.status_code == 403:
        print("\n  ! [403 감지] 45초 동안 대기합니다...")
        time.sleep(45)
    except Exception:
      time.sleep(4)
  return None


# 크롤링 시작
success_players = 0
updated_cards_total = 0

for idx, (pid, info) in enumerate(unique_female_targets.items(), start=1):
  p_str = str(pid)
  p_info = player_meta.get(pid, {"name": f"선수 {pid}", "height": 165})
  name = p_info["name"]
  ovr = info["max_ovr"]
  final_bt = None

  # 1) 로컬 캐시에 있는 경우 (0초 즉시 통과)
  if p_str in crawled_cache:
    final_bt = crawled_cache[p_str]
    print(
        f"[{idx}/{len(unique_female_targets)}] ⚡ [캐시] {name} (OVR {ovr}) ➔"
        f" {final_bt}"
    )

  # 2) 웹 수집 진행
  else:
    time.sleep(random.uniform(3.5, 4.8))
    slug = make_slug(name)

    # [1차 시도] 다이렉트 카드 상세 URL (/players/{pid}-{slug}/27-{pid}/)
    direct_card_url = f"https://www.fut.gg/players/{pid}-{slug}/27-{pid}/"
    resp = safe_request(direct_card_url)
    if resp and resp.status_code == 200:
      soup = BeautifulSoup(resp.text, "html.parser")
      final_bt = extract_body_type_from_soup(soup)

    # [2차 시도] 허브 페이지 방문 후 실제 카드 링크 추적
    if not final_bt:
      hub_url = f"https://www.fut.gg/players/{pid}-{slug}/"
      time.sleep(1.5)
      h_resp = safe_request(hub_url)
      if h_resp and h_resp.status_code == 200:
        soup_hub = BeautifulSoup(h_resp.text, "html.parser")
        for a in soup_hub.find_all("a", href=True):
          href = a["href"]
          if "/players/" in href and re.search(r"/27-\d+/?$", href):
            target_url = (
                "https://www.fut.gg" + href if href.startswith("/") else href
            )
            time.sleep(1.5)
            c_resp = safe_request(target_url)
            if c_resp and c_resp.status_code == 200:
              soup_card = BeautifulSoup(c_resp.text, "html.parser")
              final_bt = extract_body_type_from_soup(soup_card)
              if final_bt:
                break

    # 캐시 저장 및 화면 출력
    if final_bt:
      crawled_cache[p_str] = final_bt
      with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(crawled_cache, f, ensure_ascii=False, indent=2)
      print(
          f"[{idx}/{len(unique_female_targets)}] ✔ [FUT.GG] {name} (OVR {ovr})"
          f" ➔ {final_bt}"
      )
    else:
      print(f"[{idx}/{len(unique_female_targets)}] - {name}: 체형 탐색 실패")

  # DB 동기화
  if final_bt:
    try:
      upd = (
          supabase.table("card_versions")
          .update({"body_type": final_bt})
          .eq("player_id", pid)
          .execute()
      )
      if upd.data:
        success_players += 1
        updated_cards_total += len(upd.data)
    except Exception as e:
      print(f"  ! DB 업데이트 실패 ({name}): {e}")

print("=" * 65)
print(
    f"🎉 [수집 완료] OVR 80+ 여성 선수 {success_players:,}명 (카드 총"
    f" {updated_cards_total:,}장)의 body_type이"
)
print("   FUT.GG 공식 데이터로 완벽하게 갱신되었습니다!")
print("=" * 65)