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
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("VITE_SUPABASE_ANON_KEY")
)

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase URL 또는 KEY를 환경변수에서 찾을 수 없습니다.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. 브라우저 세션 및 쿠키 설정
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
    "sec-ch-ua": '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
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
        sys.stdout.write(f"\r[대기 중] {reason}속도 제한 해제까지 {remaining:3d}초 남음...")
        sys.stdout.flush()
        time.sleep(1)
    sys.stdout.write("\r" + " " * 75 + "\r")
    sys.stdout.flush()


def get_target_cards(rotate_limit: int = 180, max_total_limit: int = 550):
  """[티어 분할 스마트 로테이션 모드]

  1. 고정군: 프로모 전체 + 아이콘/히어로 + OVR 85+ TOTW (무조건 수집)
  2. 순환군: 82+ 골드 + 80~84 TOTW 중 최대 550장을 넘지 않는 선에서 rotate_limit 만큼 선별
  """
  print("=" * 65)
  print(
      f"🔍 [시세 수집 타겟 선별] 고정군 + 순환군 (1회 최대 {max_total_limit}장"
      " 안전 상한)..."
  )

  # 1. 고정 갱신군 (Non-TOTW 스페셜 전체 + 85+ TOTW)
  fixed_res = (
      supabase.table("card_versions")
      .select("id, api_id, overall, version, price, price_updated_at")
      .ilike("version", "%special%")
      .neq("card_type", "SBC")
      .not_.is_("api_id", "null")
      .execute()
  )
  specials = fixed_res.data or []

  fixed_cards = []
  low_totw_cards = []

  for card in specials:
    v_low = str(card.get("version", "")).lower()
    ovr = int(card.get("overall") or 0)
    if "totw" in v_low:
      if ovr >= 85:
        fixed_cards.append(card)  # 85+ TOTW 고정군
      elif ovr >= 80:
        low_totw_cards.append(card)  # 80~84 TOTW 순환군
    else:
      fixed_cards.append(card)  # 프로모 및 아이콘/히어로 고정군

  # 2. 550장 제한 내에서 순환군이 들어갈 수 있는 남은 자리 계산
  remaining_slots = max(max_total_limit - len(fixed_cards), 0)
  actual_rotate_limit = min(rotate_limit, remaining_slots)

  # 저오버롤 TOTW는 최대 20장까지만 우선 배분
  low_totw_sorted = sorted(
      low_totw_cards,
      key=lambda x: (
          x.get("price_updated_at") is not None,
          x.get("price_updated_at") or "",
      ),
  )[: min(20, actual_rotate_limit)]

  gold_limit = max(actual_rotate_limit - len(low_totw_sorted), 0)

  # 3. 순환 갱신군 (82+ 골드 중 가장 갱신이 오래된 카드 선별)
  rotating_gold = []
  if gold_limit > 0:
    gold_res = (
        supabase.table("card_versions")
        .select("id, api_id, overall, version, price, price_updated_at")
        .gte("overall", 82)
        .not_.ilike("version", "%special%")
        .neq("card_type", "SBC")
        .not_.is_("api_id", "null")
        .order("price_updated_at", desc=False, nullsfirst=True)
        .limit(gold_limit)
        .execute()
    )
    rotating_gold = gold_res.data or []

  # 합산 및 중복 제거
  targets_dict = {}
  for c in fixed_cards:
    targets_dict[c["id"]] = c
  for c in rotating_gold:
    targets_dict[c["id"]] = c
  for c in low_totw_sorted:
    targets_dict[c["id"]] = c

  # 최종 550장 절대 초과 방지 컷
  target_cards = list(targets_dict.values())[:max_total_limit]

  print(f"✔ 고정군 카드: {len(fixed_cards)}장 (프로모 / 아이콘 / 85+ TOTW)")
  print(
      f"✔ 순환군 카드: {len(rotating_gold) + len(low_totw_sorted)}장 (골드:"
      f" {len(rotating_gold)}, TOTW: {len(low_totw_sorted)})"
  )
  print(
      f"🎯 이번 회차 총 수집 대상: {len(target_cards)}장 (예상 소요시간: 약"
      f" {int(len(target_cards)*4.75//60)}분)"
  )
  print("=" * 65)

  return target_cards


def fetch_futgg_price(api_id: int):
    sign_url = "https://www.fut.gg/api/fut/price-access/sign/"
    target_path = f"/api/fut/player-prices/{GAME_VERSION}/{api_id}/?platform={PLATFORM}"

    retry_attempt = 0
    while True:
        try:
            sign_headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Origin": "https://www.fut.gg",
                "Referer": "https://www.fut.gg/",
            }
            sign_res = session.post(sign_url, json={"url": target_path}, headers=sign_headers, timeout=10)
            if sign_res.status_code == 429:
                retry_attempt += 1
                wait_sec = parse_retry_after(sign_res.headers.get("Retry-After")) or min(60 * retry_attempt, 300)
                countdown_sleep(wait_sec, f"FUT.GG 서명 쿨다운({wait_sec}s) - ")
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

            price_headers = {
                "Accept": "application/json",
                "Referer": "https://www.fut.gg/",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            }
            price_res = session.get(f"https://www.fut.gg{signed_path}", headers=price_headers, timeout=10)
            if price_res.status_code == 429:
                retry_attempt += 1
                wait_sec = parse_retry_after(price_res.headers.get("Retry-After")) or min(60 * retry_attempt, 300)
                countdown_sleep(wait_sec, f"FUT.GG 가격 쿨다운({wait_sec}s) - ")
                continue

            if price_res.status_code == 404:
                return None, "이적시장_미출시(404)"
            elif price_res.status_code != 200:
                error_msg = price_res.text.strip().replace("\n", " ")[:60]
                return None, f"HTTP_{price_res.status_code} ({error_msg})"

            price_data = price_res.json().get("data", {})
            curr = price_data.get("currentPrice", {})
            overview = price_data.get("overview", {})
            prange = price_data.get("priceRange", {})
            updated_at = curr.get("priceUpdatedAt") or datetime.datetime.now(datetime.timezone.utc).isoformat()

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
  parser = argparse.ArgumentParser(
      description="FUT.GG 시세 자동 수집기 (티어 분할 로테이션)"
  )
  parser.add_argument(
      "--rotate",
      type=int,
      default=180,
      help="1회당 교대 순환할 골드/재료 카드 수 (기본값: 180장)",
  )
  parser.add_argument(
      "--max-total",
      type=int,
      default=550,
      help="1회당 최대 수집 카드 상한선 (기본값: 550장)",
  )
  parser.add_argument(
      "--delay",
      type=float,
      default=3.5,
      help="기본 딜레이 초 (기본값: 3.5초)",
  )
  args = parser.parse_args()

  cards = get_target_cards(
      rotate_limit=args.rotate, max_total_limit=args.max_total
  )
  total = len(cards)
  if total == 0:
    print("[INFO] 수집할 대상 카드가 없습니다. 프로세스를 종료합니다.")
    return

  success_count = 0
  fail_count = 0
  processed_count = 0

  for idx, card in enumerate(cards, start=1):
    card_db_id = card["id"]
    api_id = card["api_id"]
    ovr = card["overall"]
    ver = card.get("version", "card")

    price, status_or_date = fetch_futgg_price(api_id)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    if price is not None:
      update_card_price(card_db_id, price, status_or_date)
      print(
          f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} (API: {api_id}) ->"
          f" 가격: {price:,} C"
      )
      success_count += 1
    elif status_or_date == "이적시장_미출시(404)":
      update_card_price(card_db_id, 0, now_iso)
      print(
          f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> 미출시 (0원"
          " 저장)"
      )
      success_count += 1
    elif status_or_date == "거래_내역_없음":
      current_price = card.get("price") if card.get("price") is not None else 0
      update_card_price(card_db_id, current_price, now_iso)
      print(
          f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> 거래내역 없음"
          f" (현재 {current_price:,}원 유지 및 순번 갱신)"
      )
      success_count += 1
    else:
      print(
          f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> 수집 실패"
          f" ({status_or_date})"
      )
      fail_count += 1

    sleep_time = random.uniform(args.delay, args.delay + 1.5)
    time.sleep(sleep_time)

    processed_count += 1
    if processed_count % 50 == 0:
      rest_time = random.uniform(8.0, 12.0)
      print(
          "\n[안전 대기] 50건 수집 완료. 봇 차단 방지 휴식 중"
          f" ({rest_time:.1f}초)...\n"
      )
      time.sleep(rest_time)

  print(f"\n[완료] 총 {total}개 중 성공: {success_count}개, 실패: {fail_count}개")


if __name__ == "__main__":
  main()