import argparse
import datetime
import email.utils
import os
from pathlib import Path
import sys
import time
import requests
from dotenv import load_dotenv
from supabase import Client, create_client

# 1. 환경변수(.env) 자동 로드
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

# 2. 방금 복사해주신 최신 브라우저 세션 및 쿠키 설정
COOKIE_STRING = (
    os.getenv("FUTGG_COOKIE")
    or "_ga=GA1.1.963824020.1787069981; "
    "__Host-futgg_price_sid=Bs9QCk-wurGCMzZ2NH0fiVfj23CcH3s6.XIZHbBc1HR0lbGySTjCa2PgT11mMOJTN7VXuLCYPxS0; "
    "cookieyes-consent=consentid:YjZOOUV4T2h6UkFoTUwzM2ZpWGE0SFFpZXZaUXFhMk8,consent:,action:,necessary:,functional:,analytics:,performance:,advertisement:,other:; "
    "cf_clearance=cf8XBlEmXCV4ZjQogjvid83bHUZqFN9fu2BBa9IAkm0-1790165596-1.2.1.1-hMJQxrW6cy5GIHwjWIYshaHvNWksQBSK6yIrpi3LfUTYuy.Z4s1oen34Z3lLD8_AdJQLhlEylm4.QtyLAJRxX.nQGWPUTH3V8FgLhmSUXBd_xnKhNaHagsQuOz5i3NYo433jSFAkJwvdKTve11ncLYEhqCXl_TVuIQG9fAL8gXl0KfSJkjUsdvbuHtx8jjiCZ1_0ZfocWqZdZDGpLwBVolM4R5Qp7zOJLQ3cCVXhnC7MtOlaunlAl1y75UuFc43rJHtY24JZSrNjAbuiI3r3XSiallL2bZWza2uH1mb0Ex9n5xt5Owqa3bUnMCNVzkio.wwnFd_eWOZ7ym5G9JlpBlkPlqZjPlnORZDGpBTK8rw; "
    "__cf_bm=8tHqHuw.Lo0fTYGtXJ6oOad.k2LEMOTiXsETCH5IvyQ-1790165596.6087818-1.0.1.1-oPFbWwR_mFLbmHT8sLTUlgzLcmRJ531pbygExj8rJxygD9PqNO1SZ3KwPOKH1F1V_PQuw0svnIW1LIdMYLmYeZZ9nO7mtQE198F898BBjQueaIkjRAW_t4CV0ric1ERk; "
    "_ga_JBQ8V6N36N=GS2.1.s1790165593$o15$g1$t1790165622$j31$l0$h0"
)

session = requests.Session()
session.headers.update({
    "accept": "application/json",
    "accept-language": "ko,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://www.fut.gg",
    "referer": "https://www.fut.gg/",
    "sec-ch-ua": '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
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


def get_target_cards(batch_limit: int = None):
  """옵션 A: 전체 미수집 카드 대상 (스마트 이어하기 + 무제한 페이징) / 옵션 B: 자동 롤링 모드"""
  if batch_limit:
    # [옵션 B: GitHub Actions 워크플로우용]
    response = (
        supabase.table("card_versions")
        .select("id, api_id, overall, price, price_updated_at")
        .gte("overall", 80)
        .neq("card_type", "SBC")
        .not_.is_("api_id", "null")
        .order("price_updated_at", desc=False, nullsfirst=True)
        .limit(batch_limit)
        .execute()
    )
    target_cards = response.data
    print(
        f"[INFO] [옵션 B: 자동 롤링 모드] 가장 오래된 카드 {len(target_cards)}개를"
        " 갱신합니다."
    )
  else:
    # [옵션 A: 로컬 수동 스마트 이어하기 모드]
    # Supabase 기본 1,000개 제한을 우회하여 3,000개든 10,000개든 전부 가져오는 페이징
    all_cards = []
    page_size = 1000
    offset = 0

    while True:
      res = (
          supabase.table("card_versions")
          .select("id, api_id, overall, price, price_updated_at")
          .gte("overall", 80)
          .neq("card_type", "SBC")
          .not_.is_("api_id", "null")
          .order("overall", desc=True)
          .range(offset, offset + page_size - 1)
          .execute()
      )
      batch_data = res.data or []
      all_cards.extend(batch_data)

      if len(batch_data) < page_size:
        break
      offset += page_size

    # 이미 가격(price > 0)이 저장된 정상 카드는 완벽히 건너뛰기
    target_cards = [
        card
        for card in all_cards
        if not card.get("price") or card.get("price") == 0
    ]

    completed_count = len(all_cards) - len(target_cards)
    print(
        "[INFO] FUT.GG 가격 수집 프로세스를 시작합니다 (스마트 이어하기"
        " 모드)..."
    )
    print(
        f"[INFO] 전체 78+ 카드 {len(all_cards)}개 중 이미 완료:"
        f" {completed_count}개, 남은 수집 대상: {len(target_cards)}개"
    )

  return target_cards


def fetch_futgg_price(api_id: int):
    sign_url = "https://www.fut.gg/api/fut/price-access/sign/"
    target_path = (
        f"/api/fut/player-prices/{GAME_VERSION}/{api_id}/?platform={PLATFORM}"
    )

    retry_attempt = 0
    while True:
        try:
            # 1. 서명 발급
            sign_res = session.post(sign_url, json={"url": target_path}, timeout=10)
            if sign_res.status_code == 429:
                retry_attempt += 1
                wait_sec = parse_retry_after(sign_res.headers.get("Retry-After")) or min(
                    60 * retry_attempt, 300
                )
                countdown_sleep(wait_sec, f"FUT.GG 쿨다운({wait_sec}s) - ")
                continue

            if sign_res.status_code != 200:
                return None, f"SIGN_FAIL_{sign_res.status_code} ({sign_res.text[:60]})"

            signed_path = sign_res.json().get("data", {}).get("url")
            if not signed_path:
                return None, "NO_SIGNED_URL"

            # 2. 가격 조회
            price_res = session.get(f"https://www.fut.gg{signed_path}", timeout=10)
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
                return None, f"HTTP_{price_res.status_code}"

            # 3. 가격 데이터 파싱 (진화 재료 및 멸종 카드 방어 로직)
            price_data = price_res.json().get("data", {})
            curr = price_data.get("currentPrice", {})
            overview = price_data.get("overview", {})
            prange = price_data.get("priceRange", {})
            updated_at = (
                curr.get("priceUpdatedAt")
                or datetime.datetime.now(datetime.timezone.utc).isoformat()
            )

            price = curr.get("price")

            # 시장 매물이 마른 경우: 1순위 평균 체결가 -> 2순위 최저 체결가 -> 3순위 상한가(MaxPrice)
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


def update_card_price(card_id: int, price: int, updated_at: str):
  supabase.table("card_versions").update({
      "price": price,
      "price_updated_at": (
          updated_at
          if updated_at and not updated_at.startswith("ERROR")
          else datetime.datetime.now(datetime.timezone.utc).isoformat()
      ),
  }).eq("id", card_id).execute()


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument(
      "--batch",
      type=int,
      default=None,
      help="한 번에 수집할 카드 수 (지정하지 않으면 스마트 이어하기 모드)",
  )
  parser.add_argument(
      "--delay",
      type=float,
      default=2.5,
      help="카드당 대기 시간(초) (기본값: 2.5초)",
  )
  args = parser.parse_args()

  cards = get_target_cards(batch_limit=args.batch)
  total = len(cards)
  if total == 0:
    print("[INFO] 수집할 대상 카드가 없습니다. 프로세스를 종료합니다.")
    return

  success_count = 0
  fail_count = 0

  for idx, card in enumerate(cards, start=1):
    card_db_id = card["id"]
    api_id = card["api_id"]
    ovr = card["overall"]

    price, status_or_date = fetch_futgg_price(api_id)

    if price is not None:
      update_card_price(card_db_id, price, status_or_date)
      print(
          f"[{idx}/{total}] Card ID {card_db_id} (API ID: {api_id}, OVR: {ovr})"
          f" -> 가격: {price:,} 코인"
      )
      success_count += 1
    elif status_or_date == "이적시장_미출시(404)":
      update_card_price(
          card_db_id, 0, datetime.datetime.now(datetime.timezone.utc).isoformat()
      )
      print(
          f"[{idx}/{total}] Card ID {card_db_id} (API ID: {api_id}) -> 미출시"
          " 확인 (0원 저장 완료)"
      )
      success_count += 1
    else:
      print(
          f"[{idx}/{total}] Card ID {card_db_id} (API ID: {api_id}) -> 수집 실패"
          f" ({status_or_date})"
      )
      fail_count += 1

    time.sleep(args.delay)

  print(f"\n[완료] 총 {total}개 중 성공: {success_count}개, 실패: {fail_count}개")


if __name__ == "__main__":
  main()