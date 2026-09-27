import argparse
import datetime
import email.utils
import os
from pathlib import Path
import random
import sys
import time
from curl_cffi import requests
from dotenv import load_dotenv
from supabase import Client, create_client

# 1. 커맨드라인 인자 파싱
parser = argparse.ArgumentParser(
    description="특정 프로모션 카드 시세 크롤링 및 Supabase 동기화 스크립트"
)
parser.add_argument(
    "version",
    help=(
        "대상 프로모션 버전명 (예: special_destined_for_glory 또는"
        " destined_for_glory)"
    ),
)
parser.add_argument(
    "--delay",
    type=float,
    default=3.5,
    help="선수별 요청 간격 초 단위 (기본값: 3.5초)",
)
args = parser.parse_args()

# 버전명 접두사 자동 보정
raw_ver = args.version.strip()
if not raw_ver.startswith("special_"):
  target_version = f"special_{raw_ver}"
else:
  target_version = raw_ver

# 2. 환경변수 로드
env_path = Path(".env")
env_local_path = Path(".env.local")

if env_local_path.exists():
  load_dotenv(dotenv_path=env_local_path)
elif env_path.exists():
  load_dotenv(dotenv_path=env_path)
else:
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
  raise ValueError("Supabase URL 또는 KEY를 환경변수에서 찾을 수 없습니다.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 3. 브라우저 세션 및 쿠키 설정 (scrape_prices.py 기반)
COOKIE_STRING = (
    os.getenv("FUTGG_COOKIE")
    or "_ga=GA1.1.963824020.1787069981; "
    "__Host-futgg_price_sid=Bs9QCk-wurGCMzZ2NH0fiVfj23CcH3s6.XIZHbBc1HR0lbGySTjCa2PgT11mMOJTN7VXuLCYPxS0; "
    "cookieyes-consent=consentid:YjZOOUV4T2h6UkFoTUwzM2ZpWGE0SFFpZXZaUXFhMk8,consent:,action:,necessary:,functional:,analytics:,performance:,advertisement:,other:; "
    "cf_clearance=cf8XBlEmXCV4ZjQogjvid83bHUZqFN9fu2BBa9IAkm0-1790165596-1.2.1.1-hMJQxrW6cy5GIHwjWIYshaHvNWksQBSK6yIrpi3LfUTYuy.Z4s1oen34Z3lLD8_AdJQLhlEylm4.QtyLAJRxX.nQGWPUTH3V8FgLhmSUXBd_xnKhNaHagsQuOz5i3NYo433jSFAkJwvdKTve11ncLYEhqCXl_TVuIQG9fAL8gXl0KfSJkjUsdvbuHtx8jjiCZ1_0ZfocWqZdZDGpLwBVolM4R5Qp7zOJLQ3cCVXhnC7MtOlaunlAl1y75UuFc43rJHtY24JZSrNjAbuiI3r3XSiallL2bZWza2uH1mb0Ex9n5xt5Owqa3bUnMCNVzkio.wwnFd_eWOZ7ym5G9JlpBlkPlqZjPlnORZDGpBTK8rw; "
    "__cf_bm=8tHqHuw.Lo0fTYGtXJ6oOad.k2LEMOTiXsETCH5IvyQ-1790165596.6087818-1.0.1.1-oPFbWwR_mFLbmHT8sLTUlgzLcmRJ531pbygExj8rJxygD9PqNO1SZ3KwPOKH1F1V_PQuw0svnIW1LIdMYLmYeZZ9nO7mtQE198F898BBjQueaIkjRAW_t4CV0ric1ERk; "
    "_ga_JBQ8V6N36N=GS2.1.s1790165593$o15$g1$t1790165622$j31$l0$h0"
)

session = requests.Session(impersonate="chrome124")
session.headers.update({
    "accept": "application/json",
    "accept-language": "ko,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://www.fut.gg",
    "referer": "https://www.fut.gg/",
    "sec-ch-ua": (
        '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"'
    ),
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/153.0.0.0 Safari/537.36"
    ),
    "cookie": COOKIE_STRING,
})

GAME_VERSION = "27"
PLATFORM = "ps5"


def parse_retry_after(header_val):
  if not header_val:
    return None
  try:
    return int(header_val)
  except ValueError:
    try:
      dt = email.utils.parsedate_to_datetime(header_val)
      diff = (dt - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
      return max(int(diff), 10)
    except Exception:
      return None


def countdown_sleep(seconds: int, reason: str = ""):
  for remaining in range(seconds, 0, -1):
    sys.stdout.write(
        f"\r[대기 중] {reason}속도 제한 해제까지 {remaining:3d}초 남음..."
    )
    sys.stdout.flush()
    time.sleep(1)
  sys.stdout.write("\r" + " " * 75 + "\r")
  sys.stdout.flush()


def fetch_futgg_price(api_id: int):
  sign_url = "https://www.fut.gg/api/fut/price-access/sign/"
  target_path = (
      f"/api/fut/player-prices/{GAME_VERSION}/{api_id}/?platform={PLATFORM}"
  )

  retry_attempt = 0
  while True:
    try:
      # 1단계: 동적 접근 서명(sign) 발급 요청
      sign_headers = {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Origin": "https://www.fut.gg",
          "Referer": "https://www.fut.gg/",
      }
      sign_res = session.post(
          sign_url, json={"url": target_path}, headers=sign_headers, timeout=10
      )
      if sign_res.status_code == 429:
        retry_attempt += 1
        wait_sec = parse_retry_after(
            sign_res.headers.get("Retry-After")
        ) or min(60 * retry_attempt, 300)
        countdown_sleep(wait_sec, f"FUT.GG 쿨다운({wait_sec}s) - ")
        continue

      if sign_res.status_code != 200:
        return None, f"SIGN_FAIL_{sign_res.status_code} ({sign_res.text[:50]})"

      sign_json = sign_res.json()
      sign_data = sign_json.get("data", {})
      signed_path = sign_data.get("url")

      if sign_data.get("challengeRequired"):
        return None, "CHALLENGE_REQUIRED(봇차단)"

      if not signed_path:
        return None, "NO_SIGNED_URL"

      # 2단계: 발급받은 서명 URL로 실제 시세 조회
      price_headers = {
          "Accept": "application/json",
          "Referer": "https://www.fut.gg/",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
      }
      price_res = session.get(
          f"https://www.fut.gg{signed_path}", headers=price_headers, timeout=10
      )
      if price_res.status_code == 429:
        retry_attempt += 1
        wait_sec = parse_retry_after(
            price_res.headers.get("Retry-After")
        ) or min(60 * retry_attempt, 300)
        countdown_sleep(wait_sec, f"FUT.GG 쿨다운({wait_sec}s) - ")
        continue

      if price_res.status_code == 404:
        return None, "이적시장_미출시(404)"
      elif price_res.status_code != 200:
        error_msg = price_res.text.strip().replace("\n", " ")[:60]
        return None, f"HTTP_{price_res.status_code} ({error_msg})"

      # 3단계: 가격 데이터 파싱
      price_data = price_res.json().get("data", {})
      curr = price_data.get("currentPrice", {})
      overview = price_data.get("overview", {})
      prange = price_data.get("priceRange", {})
      updated_at = (
          curr.get("priceUpdatedAt")
          or datetime.datetime.now(datetime.timezone.utc).isoformat()
      )

      price = curr.get("price")
      if price is None or price == 0:
        price = (
            overview.get("averageBin")
            or overview.get("cheapestSale")
            or (prange.get("maxPrice") if curr.get("isExtinct") else None)
        )

      if price is not None and price > 0:
        return price, updated_at
      elif curr.get("isExtinct"):
        return prange.get("maxPrice", 0), updated_at
      else:
        return None, "거래_내역_없음"

    except Exception as e:
      retry_attempt += 1
      if retry_attempt > 4:
        return None, f"ERROR_{str(e)}"
      countdown_sleep(5, "네트워크 재시도 - ")


# 4. 메인 실행 흐름
print("=" * 60)
print(f"▶ 대상 프로모션 버전 : {target_version}")
print(f"▶ 요청 딜레이       : {args.delay}초")
print("=" * 60)

res = (
    supabase.table("card_versions")
    .select("id, api_id, player_id, overall, price")
    .eq("version", target_version)
    .order("overall", desc=True)
    .execute()
)
cards = res.data

if not cards:
  print(f"[경고] '{target_version}' 버전에 등록된 카드가 DB에 없습니다.")
  sys.exit(0)

print(f"총 {len(cards)}장의 카드를 대상으로 시세를 안전하게 수집합니다.\n")

success_count = 0
fail_count = 0

for idx, card in enumerate(cards, start=1):
  card_db_id = card["id"]
  api_id = card["api_id"]
  ovr = card.get("overall", 0)

  # 선수명 확인
  p_res = (
      supabase.table("players")
      .select("name")
      .eq("id", card["player_id"])
      .execute()
  )
  p_name = p_res.data[0]["name"] if p_res.data else "Unknown"

  price, status_or_date = fetch_futgg_price(api_id)

  if price is not None:
    now_utc = (
        status_or_date
        if status_or_date and not status_or_date.startswith("ERROR")
        else datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    supabase.table("card_versions").update(
        {"price": price, "price_updated_at": now_utc}
    ).eq("id", card_db_id).execute()
    print(
        f"[{idx}/{len(cards)}] {p_name} (OVR: {ovr} / ID: {api_id}) -> 가격:"
        f" {price:,} 코인 갱신 완료"
    )
    success_count += 1
  elif status_or_date == "이적시장_미출시(404)":
    now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
    supabase.table("card_versions").update(
        {"price": 0, "price_updated_at": now_utc}
    ).eq("id", card_db_id).execute()
    print(
        f"[{idx}/{len(cards)}] {p_name} (OVR: {ovr} / ID: {api_id}) -> 미출시"
        " 확인 (0원 저장)"
    )
    success_count += 1
  else:
    print(
        f"[{idx}/{len(cards)}] {p_name} (OVR: {ovr} / ID: {api_id}) -> 수집"
        f" 실패 ({status_or_date})"
    )
    fail_count += 1

  # 차단 방지 지연 시간 적용
  sleep_time = random.uniform(args.delay, args.delay + 1.0)
  time.sleep(sleep_time)

print("=" * 60)
print(
    f"[완료] 총 {len(cards)}장 중 성공: {success_count}장, 실패/미등록:"
    f" {fail_count}장"
)
print("=" * 60)