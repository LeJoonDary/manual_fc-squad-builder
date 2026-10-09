import os
import sys
import time
import random
import argparse
import datetime
import email.utils
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from curl_cffi import requests

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

def log(msg: str):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now_str}] {msg}", flush=True)

# 1. 환경변수 및 Supabase 연결
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

# 2. 브라우저 세션 및 FUT.GG 헤더 설정
COOKIE_STRING = os.getenv("FUTGG_COOKIE", "")
session = requests.Session(impersonate="chrome124")

if COOKIE_STRING:
    for item in COOKIE_STRING.split(";"):
        if "=" in item:
            k, v = item.strip().split("=", 1)
            session.cookies.set(k.strip(), v.strip(), domain="fut.gg")

session.headers.update({
    "accept": "application/json",
    "accept-language": "ko,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://www.fut.gg",
    "referer": "https://www.fut.gg/",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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
    log(f"[대기 안내] {reason}속도 제한 해제까지 {seconds}초 대기합니다.")
    time.sleep(seconds)

# 3. 80~81 일반 골드 카드 선별 로직
def get_80_81_gold_cards(limit: int = 100):
    log("=" * 65)
    log(f"[INFO] 80~81 일반 골드 카드 타겟 선별 중 (최대 {limit}장)...")

    EXCLUDED_UNTRADEABLES = [
        "squad_foundation",
        "ones_to_watch",
        "debut_international_icon",
        "partnerships",
        "special_base_hall_of_fut",
        "base_hall_of_fut",
        "hall_of_fut",
        "special_sbc",
        "sbc",
        "potm",
    ]

    # 80~81 일반 골드 (업데이트가 가장 오래된 순서대로 추출)
    res = (
        supabase.table("card_versions")
        .select("id, api_id, overall, version, card_type, price, price_updated_at")
        .gte("overall", 80)
        .lte("overall", 81)
        .not_.ilike("version", "%special%")
        .neq("card_type", "SBC")
        .neq("card_type", "SPECIAL_SBC")
        .not_.is_("api_id", "null")
        .order("price_updated_at", desc=False, nullsfirst=True)
        .limit(limit + 50)
        .execute()
    )

    raw_cards = res.data or []
    target_cards = []

    for card in raw_cards:
        v_low = str(card.get("version", "")).lower()
        c_type = str(card.get("card_type", "")).lower()

        # 거래 불가 및 특수 카드 배제
        if (
            any(ex in v_low for ex in EXCLUDED_UNTRADEABLES)
            or "sbc" in c_type
            or "potm" in v_low
            or "potm" in c_type
        ):
            continue

        target_cards.append(card)
        if len(target_cards) >= limit:
            break

    log(f"[타겟 확보] 총 {len(target_cards)}장의 80~81 골드 카드 선별 완료")
    log(f"[예상 소요시간] 약 {int(len(target_cards) * 3.8 // 60)}분")
    log("=" * 65)

    return target_cards

# 4. 시세 조회 (FUT.GG 서명 & API 호출)
def fetch_futgg_price(api_id: int):
    sign_url = "https://www.fut.gg/api/fut/price-access/sign/"
    target_path = f"/api/fut/player-prices/{GAME_VERSION}/{api_id}/?platform={PLATFORM}"

    retry_attempt = 0
    while True:
        try:
            sign_res = session.post(sign_url, json={"url": target_path}, timeout=10)
            if sign_res.status_code == 429:
                retry_attempt += 1
                wait_sec = parse_retry_after(sign_res.headers.get("Retry-After")) or min(60 * retry_attempt, 300)
                countdown_sleep(wait_sec, "FUT.GG 서명 ")
                continue

            if sign_res.status_code == 403 or "Just a moment" in sign_res.text:
                return None, "CLOUDFLARE_403_BLOCKED"

            if sign_res.status_code != 200:
                return None, f"SIGN_FAIL_{sign_res.status_code}"

            sign_json = sign_res.json()
            sign_data = sign_json.get("data", {})
            signed_path = sign_data.get("url")

            if sign_data.get("challengeRequired"):
                return None, "CLOUDFLARE_403_BLOCKED"

            if not signed_path:
                return None, "NO_SIGNED_URL"

            price_res = session.get(f"https://www.fut.gg{signed_path}", timeout=10)
            if price_res.status_code == 429:
                retry_attempt += 1
                wait_sec = parse_retry_after(price_res.headers.get("Retry-After")) or min(60 * retry_attempt, 300)
                countdown_sleep(wait_sec, "FUT.GG 가격 ")
                continue

            if price_res.status_code == 403 or "Just a moment" in price_res.text:
                return None, "CLOUDFLARE_403_BLOCKED"

            if price_res.status_code == 404:
                return None, "이적시장_미출시(404)"
            elif price_res.status_code != 200:
                return None, f"HTTP_{price_res.status_code}"

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
            if retry_attempt > 3:
                return None, f"ERROR_{str(e)}"
            countdown_sleep(4, "재시도 - ")

def update_card_price(card_id: int, price: int, updated_at: str):
    supabase.table("card_versions").update({
        "price": price,
        "price_updated_at": updated_at if updated_at and not updated_at.startswith("ERROR") else datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }).eq("id", card_id).execute()

# 5. 실행 엔트리포인트
def main():
    parser = argparse.ArgumentParser(description="80~81 일반 골드 카드 시세 1회성 갱신 스크립트")
    parser.add_argument("--limit", type=int, default=100, help="수집할 카드 수 (기본값: 100장)")
    parser.add_argument("--all", action="store_true", help="80~81 전체 카드 갱신 (약 350장)")
    parser.add_argument("--delay", type=float, default=3.2, help="요청 간 기본 대기시간 초 (기본값: 3.2초)")
    args = parser.parse_args()

    target_limit = 400 if args.all else args.limit
    cards = get_80_81_gold_cards(limit=target_limit)
    total = len(cards)

    if total == 0:
        log("[INFO] 갱신 대상 80~81 카드가 없습니다.")
        return

    success_count = 0
    fail_count = 0
    consecutive_403_count = 0

    log(f"[시작] 80~81 골드 카드 시세 수집 시작 (총 {total}장)...")

    for idx, card in enumerate(cards, start=1):
        card_db_id = card["id"]
        api_id = card["api_id"]
        ovr = card["overall"]
        ver = card.get("version", "card")

        price, status_or_date = fetch_futgg_price(api_id)
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        if status_or_date == "CLOUDFLARE_403_BLOCKED":
            consecutive_403_count += 1
            log(f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> ⚠️ Cloudflare 403 감지 ({consecutive_403_count}/2회)")
            if consecutive_403_count >= 2:
                log("!" * 65)
                log("[서킷 브레이커] Cloudflare 차단 감지. 안전하게 중단합니다.")
                log(f"현재까지 완료: {success_count}장")
                log("!" * 65)
                sys.exit(0)
            time.sleep(5)
            continue
        else:
            consecutive_403_count = 0

        if price is not None:
            update_card_price(card_db_id, price, status_or_date)
            log(f"[{idx}/{total}] [{ovr} 골드] ID {card_db_id} (API: {api_id}) -> 가격: {price:,} C")
            success_count += 1
        elif status_or_date == "이적시장_미출시(404)":
            update_card_price(card_db_id, 0, now_iso)
            log(f"[{idx}/{total}] [{ovr} 골드] ID {card_db_id} -> 미출시 (0원 저장)")
            success_count += 1
        elif status_or_date == "거래_내역_없음":
            curr_p = card.get("price") if card.get("price") is not None else 0
            update_card_price(card_db_id, curr_p, now_iso)
            log(f"[{idx}/{total}] [{ovr} 골드] ID {card_db_id} -> 거래내역 없음 (갱신)")
            success_count += 1
        else:
            log(f"[{idx}/{total}] [{ovr} 골드] ID {card_db_id} -> 수집 실패 ({status_or_date})")
            fail_count += 1

        sleep_time = random.uniform(args.delay, args.delay + 1.1)
        time.sleep(sleep_time)

        if idx % 50 == 0:
            rest_time = random.uniform(5.0, 8.0)
            log(f"[휴식] 50건 완료. 잠시 휴식 ({rest_time:.1f}초)...")
            time.sleep(rest_time)

    log("=" * 65)
    log(f"[완료] 80~81 골드 갱신 종료! 총 {total}개 중 성공: {success_count}개, 실패: {fail_count}개")
    log("=" * 65)

if __name__ == "__main__":
    main()