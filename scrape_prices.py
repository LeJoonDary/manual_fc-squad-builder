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

# ★ 실시간 날짜/시간 타임스탬프 로거 (scraper.txt에 깔끔하게 누적 기록) ★
def log(msg: str):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now_str}] {msg}", flush=True)

# 1. 환경변수 로드
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

def get_target_cards(special_limit: int = 200, rotate_gold_limit: int = 40, rotate_totw_limit: int = 10):
    total_target_cap = special_limit + rotate_gold_limit + rotate_totw_limit
    log("=" * 65)
    log(f"[INFO] 타겟 선별 시작: 1회 총 {total_target_cap}장 (스페셜 {special_limit}장 + 순환 {rotate_gold_limit + rotate_totw_limit}장)...")

    # 언트레이더블 / 시장 미거래 제외 목록 (★ POTM 추가 완료 ★)
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
        "potm",  # ★ POTM(이달의 선수) SBC 카드 수집 제외
    ]

    # 1. 스페셜 군 (오래된 순 200장)
    fixed_res = (
        supabase.table("card_versions")
        .select("id, api_id, overall, version, card_type, price, price_updated_at")
        .ilike("version", "%special%")
        .neq("card_type", "SBC")
        .neq("card_type", "SPECIAL_SBC")
        .not_.is_("api_id", "null")
        .order("price_updated_at", desc=False, nullsfirst=True)
        .execute()
    )
    specials = fixed_res.data or []

    candidate_specials = []
    candidate_low_totw = []
    excluded_cnt = 0

    for card in specials:
        v_low = str(card.get("version", "")).lower()
        c_type = str(card.get("card_type", "")).lower()
        ovr = int(card.get("overall") or 0)

        # SBC, Hall of FUT, POTM 등 거래 불가 카드 완전 필터링
        if (
            any(ex in v_low for ex in EXCLUDED_UNTRADEABLES)
            or "sbc" in c_type
            or "hall_of_fut" in v_low
            or "potm" in v_low
            or "potm" in c_type
        ):
            excluded_cnt += 1
            continue

        if "totw" in v_low and ovr < 85:
            if ovr >= 80:
                candidate_low_totw.append(card)
        else:
            candidate_specials.append(card)

    selected_specials = candidate_specials[:special_limit]
    selected_totw = candidate_low_totw[:rotate_totw_limit]

    # 2. 순환군 B: 82+ 일반 골드 카드 (오래된 순 40장)
    gold_res = (
        supabase.table("card_versions")
        .select("id, api_id, overall, version, card_type, price, price_updated_at")
        .gte("overall", 82)
        .not_.ilike("version", "%special%")
        .neq("card_type", "SBC")
        .neq("card_type", "SPECIAL_SBC")
        .not_.is_("api_id", "null")
        .order("price_updated_at", desc=False, nullsfirst=True)
        .limit(rotate_gold_limit + 30)
        .execute()
    )
    candidate_gold = [
        c for c in (gold_res.data or [])
        if not any(ex in str(c.get("version", "")).lower() for ex in EXCLUDED_UNTRADEABLES)
        and "sbc" not in str(c.get("card_type", "")).lower()
        and "potm" not in str(c.get("version", "")).lower()
    ]
    selected_gold = candidate_gold[:rotate_gold_limit]

    target_cards = selected_specials + selected_totw + selected_gold

    log(f"[스페셜군] {len(selected_specials)}장 (아이콘/히어로/85+ TOTW) [SBC/POTM 등 {excluded_cnt}장 제외됨]")
    log(f"[순환군] {len(selected_totw) + len(selected_gold)}장 (골드 {len(selected_gold)}장 + 저오버롤 TOTW {len(selected_totw)}장)")
    log(f"[타겟] 이번 회차 총 수집 대상: {len(target_cards)}장 (예상 소요시간: 약 {int(len(target_cards)*4.3//60)}분)")
    log("=" * 65)

    return target_cards

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
                price = overview.get("averageBin") or overview.get("cheapestSale") or (prange.get("maxPrice") if curr.get("isExtinct") else None)

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

def main():
    parser = argparse.ArgumentParser(description="FUT.GG 시세 자동 수집기 (POTM 제외 + 타임스탬프 로깅)")
    parser.add_argument("--special", type=int, default=200, help="1회당 수집할 스페셜 카드 수 (기본값: 200장)")
    parser.add_argument("--gold", type=int, default=40, help="1회당 수집할 82+ 골드 카드 수 (기본값: 40장)")
    parser.add_argument("--totw", type=int, default=10, help="1회당 수집할 저오버롤 TOTW 수 (기본값: 10장)")
    parser.add_argument("--delay", type=float, default=3.2, help="기본 딜레이 초 (기본값: 3.2초)")
    args = parser.parse_args()

    cards = get_target_cards(
        special_limit=args.special,
        rotate_gold_limit=args.gold,
        rotate_totw_limit=args.totw
    )
    total = len(cards)
    if total == 0:
        log("[INFO] 수집할 대상 카드가 없습니다.")
        return

    success_count = 0
    fail_count = 0
    consecutive_403_count = 0

    for idx, card in enumerate(cards, start=1):
        card_db_id = card["id"]
        api_id = card["api_id"]
        ovr = card["overall"]
        ver = card.get("version", "card")

        price, status_or_date = fetch_futgg_price(api_id)
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # [서킷 브레이커: 403 감지 즉시 중단]
        if status_or_date == "CLOUDFLARE_403_BLOCKED":
            consecutive_403_count += 1
            log(f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> ⚠️ Cloudflare 403 감지 ({consecutive_403_count}/2회)")
            
            if consecutive_403_count >= 2:
                log("!" * 65)
                log("[서킷 브레이커 발동] Cloudflare 차단 챌린지 감지! 추가 요청을 중단하고 안전하게 종료합니다.")
                log(f"현재까지 수집 성공: {success_count}개")
                log("!" * 65)
                sys.exit(0)
            time.sleep(5)
            continue
        else:
            consecutive_403_count = 0

        if price is not None:
            update_card_price(card_db_id, price, status_or_date)
            log(f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} (API: {api_id}) -> 가격: {price:,} C")
            success_count += 1
        elif status_or_date == "이적시장_미출시(404)":
            update_card_price(card_db_id, 0, now_iso)
            log(f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> 미출시 (0원 저장)")
            success_count += 1
        elif status_or_date == "거래_내역_없음":
            current_price = card.get("price") if card.get("price") is not None else 0
            update_card_price(card_db_id, current_price, now_iso)
            log(f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> 거래내역 없음 (순번 갱신)")
            success_count += 1
        else:
            log(f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> 수집 실패 ({status_or_date})")
            fail_count += 1

        sleep_time = random.uniform(args.delay, args.delay + 1.2)
        time.sleep(sleep_time)

        if idx % 50 == 0:
            rest_time = random.uniform(6.0, 9.0)
            log(f"[안전 대기] 50건 수집 완료. 휴식 중 ({rest_time:.1f}초)...")
            time.sleep(rest_time)

    log(f"[완료] 총 {total}개 중 성공: {success_count}개, 실패: {fail_count}개")

if __name__ == "__main__":
    main()