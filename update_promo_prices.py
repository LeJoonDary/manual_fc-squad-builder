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

# 1. 환경변수 로드 (.env.local -> .env 순)
env_path = Path(".env")
env_local_path = Path(".env.local")

if env_local_path.exists():
  load_dotenv(dotenv_path=env_local_path)
elif env_path.exists():
  load_dotenv(dotenv_path=env_path)
else:
  load_dotenv()

# 2. 커맨드라인 인자 파싱
parser = argparse.ArgumentParser(
    description="프로모션 카드 시세 크롤링 및 Supabase 동기화 스크립트"
)
parser.add_argument(
    "version",
    help=(
        "대상 프로모션 버전명 일부 또는 전체 (예: thunderstruck, thunder,"
        " special_thunderstruck)"
    ),
)
parser.add_argument(
    "--delay",
    type=float,
    default=3.5,
    help="선수별 요청 간격 초 단위 (기본값: 3.5초)",
)
parser.add_argument(
    "--max-429-retries",
    type=int,
    default=4,
    help="429 속도 제한 발생 시 최대 재시도 횟수 (기본값: 4회)",
)
parser.add_argument(
    "--platform",
    default="ps5",
    help="조회 플랫폼 (기본값: ps5)",
)
args = parser.parse_args()

raw_ver = args.version.strip()
if not raw_ver:
  raise ValueError("버전명을 입력해 주세요.")

SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
)
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("VITE_SUPABASE_ANON_KEY")
)

if not SUPABASE_URL or not SUPABASE_KEY:
  raise ValueError("Supabase URL 또는 KEY를 환경변수에서 찾을 수 없습니다.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 3. 브라우저 세션 및 쿠키 설정
COOKIE_STRING = (os.getenv("FUTGG_COOKIE") or "").strip()
if not COOKIE_STRING:
  print(
      "[경고] 환경변수 FUTGG_COOKIE가 비어 있습니다. .env에 최신 쿠키를"
      " 설정하는 것을 권장합니다."
  )

session = requests.Session(impersonate="chrome124")
base_headers = {
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
}
if COOKIE_STRING:
  base_headers["cookie"] = COOKIE_STRING
session.headers.update(base_headers)

GAME_VERSION = "27"
PLATFORM = args.platform.strip().lower()


def parse_retry_after(header_val):
  if not header_val:
    return None
  try:
    return max(int(header_val), 5)
  except ValueError:
    try:
      dt = email.utils.parsedate_to_datetime(header_val)
      diff = (
          dt - datetime.datetime.now(datetime.timezone.utc)
      ).total_seconds()
      return max(int(diff), 10)
    except Exception:
      return None


def countdown_sleep(seconds: int, reason: str = ""):
  for remaining in range(seconds, 0, -1):
    sys.stdout.write(
        f"\r[대기 중] {reason}재시도까지 {remaining:3d}초 남음..."
    )
    sys.stdout.flush()
    time.sleep(1)
  sys.stdout.write("\r" + " " * 75 + "\r")
  sys.stdout.flush()


def fetch_futgg_price(api_id: int, max_429_retries: int = 4):
  sign_url = "https://www.fut.gg/api/fut/price-access/sign/"
  target_path = (
      f"/api/fut/player-prices/{GAME_VERSION}/{api_id}/?platform={PLATFORM}"
  )

  retry_429 = 0
  net_retry = 0

  while True:
    try:
      # 1단계: 동적 접근 서명(sign) 발급 요청
      sign_res = session.post(
          sign_url,
          json={"url": target_path},
          headers={"Accept": "application/json", "Content-Type": "application/json"},
          timeout=10,
      )
      if sign_res.status_code == 429:
        retry_429 += 1
        if retry_429 > max_429_retries:
          return None, f"RATE_LIMIT_429_EXCEEDED({max_429_retries}회)"
        wait_sec = parse_retry_after(
            sign_res.headers.get("Retry-After")
        ) or min(60 * retry_429, 300)
        countdown_sleep(wait_sec, f"FUT.GG 429({retry_429}/{max_429_retries}) - ")
        continue

      if sign_res.status_code != 200:
        return None, f"SIGN_FAIL_{sign_res.status_code} ({sign_res.text[:50]})"

      sign_json = sign_res.json()
      sign_data = sign_json.get("data", {})
      signed_path = sign_data.get("url")

      if sign_data.get("challengeRequired"):
        return None, "CHALLENGE_REQUIRED(봇차단/쿠키만료)"

      if not signed_path:
        return None, "NO_SIGNED_URL"

      # 2단계: 서명된 URL로 시세 조회
      price_res = session.get(
          f"https://www.fut.gg{signed_path}",
          headers={"Accept": "application/json"},
          timeout=10,
      )
      if price_res.status_code == 429:
        retry_429 += 1
        if retry_429 > max_429_retries:
          return None, f"RATE_LIMIT_429_EXCEEDED({max_429_retries}회)"
        wait_sec = parse_retry_after(
            price_res.headers.get("Retry-After")
        ) or min(60 * retry_429, 300)
        countdown_sleep(wait_sec, f"FUT.GG 429({retry_429}/{max_429_retries}) - ")
        continue

      if price_res.status_code == 404:
        return None, "이적시장_미출시(404)"
      if price_res.status_code != 200:
        error_msg = price_res.text.strip().replace("\n", " ")[:60]
        return None, f"HTTP_{price_res.status_code} ({error_msg})"

      # 3단계: 가격 및 귀속/SBC 여부 파싱
      price_data = price_res.json().get("data", {})
      curr = price_data.get("currentPrice", {}) or {}
      overview = price_data.get("overview", {}) or {}
      prange = price_data.get("priceRange", {}) or {}

      if (
          curr.get("isSbc") is True
          or curr.get("isObjective") is True
          or curr.get("isUntradeable") is True
      ):
        return None, "SBC_OR_UNTRADEABLE"

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
        return int(price), updated_at
      if curr.get("isExtinct"):
        return int(prange.get("maxPrice", 0) or 0), updated_at
      return None, "거래_내역_없음"

    except Exception as e:
      net_retry += 1
      if net_retry > 4:
        return None, f"ERROR_{str(e)}"
      countdown_sleep(5, f"네트워크 재시도({net_retry}/4) - ")


# 4. 메인 실행 흐름
if hasattr(sys.stdout, "reconfigure"):
  sys.stdout.reconfigure(encoding="utf-8")

print("=" * 60)
print(f"▶ 대상 버전 검색어 : *{raw_ver}* (부분 일치)")
print(f"▶ 플랫폼           : {PLATFORM}")
print(f"▶ 요청 딜레이       : {args.delay}초")
print(f"▶ 429 최대 재시도   : {args.max_429_retries}회")
print("=" * 60)

res = (
    supabase.table("card_versions")
    .select(
        "id, api_id, player_id, overall, price, version, card_type,"
        " players(name)"
    )
    .ilike("version", f"%{raw_ver}%")
    .neq("card_type", "SPECIAL_SBC")
    .order("overall", desc=True)
    .execute()
)
cards = res.data or []

if not cards:
  print(f"[경고] '*{raw_ver}*' 조건에 맞는 거래 가능 카드가 DB에 없습니다.")
  sys.exit(0)

print(f"총 {len(cards)}장의 카드를 대상으로 시세를 수집합니다.\n")

success_count = 0
skip_count = 0
fail_count = 0
total = len(cards)

for idx, card in enumerate(cards, start=1):
  card_db_id = card["id"]
  api_id = card.get("api_id")
  ovr = card.get("overall", 0)
  ver_name = card.get("version", "")

  player_obj = card.get("players")
  if isinstance(player_obj, dict):
    p_name = player_obj.get("name") or "Unknown"
  elif isinstance(player_obj, list) and player_obj:
    p_name = player_obj[0].get("name") or "Unknown"
  else:
    p_name = "Unknown"

  if not api_id:
    print(
        f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name}) -> 건너뜀"
        " (api_id 없음)"
    )
    skip_count += 1
    continue

  price, status_or_date = fetch_futgg_price(
      int(api_id), max_429_retries=args.max_429_retries
  )

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
        f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name} / ID: {api_id}) ->"
        f" {price:,} 코인 갱신 완료"
    )
    success_count += 1
  elif status_or_date == "이적시장_미출시(404)":
    now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
    supabase.table("card_versions").update(
        {"price": 0, "price_updated_at": now_utc}
    ).eq("id", card_db_id).execute()
    print(
        f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name} / ID: {api_id}) ->"
        " 미출시 확인 (0원 저장)"
    )
    success_count += 1
  elif status_or_date == "SBC_OR_UNTRADEABLE":
    print(
        f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name} / ID: {api_id}) ->"
        " 건너뜀 (SBC/귀속 카드)"
    )
    skip_count += 1
  else:
    print(
        f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name} / ID: {api_id}) ->"
        f" 수집 실패 ({status_or_date})"
    )
    fail_count += 1

  if idx < total:
    sleep_time = random.uniform(args.delay, args.delay + 1.0)
    time.sleep(sleep_time)

print("=" * 60)
print(
    f"[완료] 총 {total}장 중 갱신: {success_count}장, 건너뜀: {skip_count}장,"
    f" 실패: {fail_count}장"
)
print("=" * 60)