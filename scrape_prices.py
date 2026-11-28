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

# 언트레이더블 / 시장 미거래 제외 목록 (★ base_hall_of_fut만 제외하고 unleashed는 허용 ★)
EXCLUDED_UNTRADEABLES = [
    "squad_foundation",
    "ones_to_watch",
    "debut_international_icon",
    "partnerships",
    "special_base_hall_of_fut",
    "base_hall_of_fut",
    "special_sbc",
    "sbc",
    "potm",  # ★ POTM(이달의 선수) SBC 카드 수집 제외
]

# card_type 기준 시세 수집 제외 키워드 (TOKEN, SBC, SEASON, OBJ, POTM)
EXCLUDED_CARD_TYPE_KEYWORDS = (
    "sbc",
    "token",
    "tocken",
    "season",
    "obj",
    "potm",
)


def is_excluded_card(card: dict) -> bool:
    v_low = str(card.get("version") or "").lower()
    c_type = str(card.get("card_type") or "").lower()
    return (
        any(ex in v_low for ex in EXCLUDED_UNTRADEABLES)
        or any(kw in c_type for kw in EXCLUDED_CARD_TYPE_KEYWORDS)
        or "potm" in v_low
    )


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


def fetch_group_prioritized(limit: int, build_query_fn, extra_filter_fn=None, global_seen_ids=None):
    """
    공통 2단계 우선 선별:
      1순위: price가 0원 또는 NULL인 카드 (price_updated_at 오래된 순 / NULL 우선)
      2순위: 부족한 수량만큼 price > 0인 카드 (price_updated_at 오래된 순 / NULL 우선)
    """
    if limit <= 0:
        return [], 0, 0

    selected = []
    seen_ids = set(global_seen_ids) if global_seen_ids else set()

    def collect(only_zero: bool, need: int):
        fetch_cap = min(max(need * 3, need + 80), 1000)
        q = build_query_fn(
            supabase.table("card_versions").select(
                "id, api_id, overall, version, card_type, price, price_updated_at"
            )
        )
        if only_zero:
            q = q.or_("price.is.null,price.eq.0")
        else:
            q = q.gt("price", 0)

        res = (
            q.not_.is_("api_id", "null")
            .order("price_updated_at", desc=False, nullsfirst=True)
            .limit(fetch_cap)
            .execute()
        )
        for card in (res.data or []):
            if is_excluded_card(card):
                continue
            if extra_filter_fn and not extra_filter_fn(card):
                continue
            cid = card["id"]
            if cid in seen_ids:
                continue
            selected.append(card)
            seen_ids.add(cid)
            if len(selected) >= limit:
                break

    # 1순위: 0원 / NULL 우선
    collect(only_zero=True, need=limit)
    zero_cnt = len(selected)

    # 2순위: 부족분은 price > 0 중 오래된 순
    remaining = limit - len(selected)
    if remaining > 0:
        collect(only_zero=False, need=remaining)

    priced_cnt = len(selected) - zero_cnt
    return selected, zero_cnt, priced_cnt


def get_target_cards(
    special_limit: int = 180,
    high_gold_limit: int = 40,
    low_gold_limit: int = 10,
    rotate_totw_limit: int = 20,
):
    total_target_cap = special_limit + high_gold_limit + low_gold_limit + rotate_totw_limit
    log("=" * 65)
    log(
        f"[INFO] 타겟 선별 시작: 1회 총 {total_target_cap}장 "
        f"(스페셜 {special_limit} + 85+골드 {high_gold_limit} + 82~84골드 {low_gold_limit} + 80~84 TOTW {rotate_totw_limit})..."
    )

    global_seen = set()

    # 1. 스페셜군 (아이콘/히어로/프로모/85+ TOTW, 0원 우선 -> 오래된 순)
    def build_special_query(q):
        return (
            q.ilike("version", "%special%")
            .not_.ilike("version", "%base_hall_of_fut%")
        )

    def filter_special(card):
        v_low = str(card.get("version") or "").lower()
        ovr = int(card.get("overall") or 0)
        # 85 미만 TOTW는 4번 그룹에서 별도 선별
        return not ("totw" in v_low and ovr < 85)

    selected_specials, sp_zero, sp_priced = fetch_group_prioritized(
        special_limit, build_special_query, extra_filter_fn=filter_special, global_seen_ids=global_seen
    )
    global_seen.update(c["id"] for c in selected_specials)

    # 2. 85+ 일반 골드군 (0원 우선 -> 오래된 순)
    def build_high_gold_query(q):
        return q.gte("overall", 85).not_.ilike("version", "%special%")

    selected_high_gold, hg_zero, hg_priced = fetch_group_prioritized(
        high_gold_limit, build_high_gold_query, global_seen_ids=global_seen
    )
    global_seen.update(c["id"] for c in selected_high_gold)

    # 3. 82~84 일반 골드군 (0원 우선 -> 오래된 순)
    def build_low_gold_query(q):
        return q.gte("overall", 82).lte("overall", 84).not_.ilike("version", "%special%")

    selected_low_gold, lg_zero, lg_priced = fetch_group_prioritized(
        low_gold_limit, build_low_gold_query, global_seen_ids=global_seen
    )
    global_seen.update(c["id"] for c in selected_low_gold)

    # 4. 80~84 저오버롤 TOTW군 (0원 우선 -> 오래된 순)
    def build_low_totw_query(q):
        return q.ilike("version", "%totw%").gte("overall", 80).lte("overall", 84)

    selected_totw, tw_zero, tw_priced = fetch_group_prioritized(
        rotate_totw_limit, build_low_totw_query, global_seen_ids=global_seen
    )
    global_seen.update(c["id"] for c in selected_totw)

    target_cards = selected_specials + selected_high_gold + selected_low_gold + selected_totw

    log(f"[스페셜군]   {len(selected_specials)}장 (0원 우선 {sp_zero} / 오래된 순 {sp_priced})")
    log(f"[85+ 골드]   {len(selected_high_gold)}장 (0원 우선 {hg_zero} / 오래된 순 {hg_priced})")
    log(f"[82~84 골드] {len(selected_low_gold)}장 (0원 우선 {lg_zero} / 오래된 순 {lg_priced})")
    log(f"[80~84 TOTW] {len(selected_totw)}장 (0원 우선 {tw_zero} / 오래된 순 {tw_priced})")
    log(f"[타겟] 이번 회차 총 수집 대상: {len(target_cards)}장 (예상 소요시간: 약 {int(len(target_cards)*4.3//60)}분)")
    log("=" * 65)

    return target_cards


def fetch_futgg_price(api_id: int, is_gold: bool = False):
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
            curr = price_data.get("currentPrice", {}) or {}
            overview = price_data.get("overview", {}) or {}
            prange = price_data.get("priceRange", {}) or {}

            updated_at = curr.get("priceUpdatedAt") or datetime.datetime.now(datetime.timezone.utc).isoformat()

            price = curr.get("price")
            if price is None or price == 0:
                price = (
                    overview.get("averageBin")
                    or overview.get("cheapestSale")
                    or (prange.get("maxPrice") if curr.get("isExtinct") else None)
                )

            # 일반 골드 카드인데 실제 시장 가격이 존재하면 SBC/시즌패스 플래그로 오스킵하지 않고 가격 저장
            if is_gold and price is not None and price > 0:
                return price, updated_at

            # API 응답에서 SBC / 목표 / 시즌패스 / 거래불가 확인 시 건너뜀
            if (
                curr.get("isSbc") is True
                or curr.get("isObjective") is True
                or curr.get("isUntradeable") is True
                or curr.get("premiumSeasonPassLevel") is not None
                or curr.get("standardSeasonPassLevel") is not None
            ):
                return None, "SBC_OR_UNTRADEABLE"

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


def touch_card_updated_at(card_id: int, updated_at: str):
    supabase.table("card_versions").update({
        "price_updated_at": updated_at,
    }).eq("id", card_id).execute()


def main():
    parser = argparse.ArgumentParser(description="FUT.GG 시세 자동 수집기 (0원 우선 -> 오래된 순 + 타임스탬프 로깅)")
    parser.add_argument("--special", type=int, default=180, help="1회당 수집할 스페셜 카드 수 (기본값: 180장)")
    parser.add_argument("--high-gold", type=int, default=40, help="1회당 수집할 85+ 골드 카드 수 (기본값: 40장)")
    parser.add_argument("--low-gold", type=int, default=10, help="1회당 수집할 82~84 골드 카드 수 (기본값: 10장)")
    parser.add_argument("--totw", type=int, default=20, help="1회당 수집할 80~84 TOTW 수 (기본값: 20장)")
    parser.add_argument("--delay", type=float, default=3.2, help="기본 딜레이 초 (기본값: 3.2초)")
    args = parser.parse_args()

    cards = get_target_cards(
        special_limit=args.special,
        high_gold_limit=args.high_gold,
        low_gold_limit=args.low_gold,
        rotate_totw_limit=args.totw,
    )
    total = len(cards)
    if total == 0:
        log("[INFO] 수집할 대상 카드가 없습니다.")
        return

    success_count = 0
    skip_count = 0
    fail_count = 0
    consecutive_403_count = 0

    for idx, card in enumerate(cards, start=1):
        card_db_id = card["id"]
        api_id = card["api_id"]
        ovr = card["overall"]
        ver = card.get("version", "card")
        is_gold = "special" not in str(ver or "").lower()

        price, status_or_date = fetch_futgg_price(api_id, is_gold=is_gold)
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
        elif status_or_date == "SBC_OR_UNTRADEABLE":
            touch_card_updated_at(card_db_id, now_iso)
            log(f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> 건너뜀 (SBC/시즌패스/귀속 카드, 순번 갱신)")
            skip_count += 1
        else:
            log(f"[{idx}/{total}] [{ovr} {ver}] ID {card_db_id} -> 수집 실패 ({status_or_date})")
            fail_count += 1

        sleep_time = random.uniform(args.delay, args.delay + 1.2)
        time.sleep(sleep_time)

        if idx % 50 == 0:
            rest_time = random.uniform(6.0, 9.0)
            log(f"[안전 대기] 50건 수집 완료. 휴식 중 ({rest_time:.1f}초)...")
            time.sleep(rest_time)

    log(f"[완료] 총 {total}개 중 성공: {success_count}개, 건너뜀: {skip_count}개, 실패: {fail_count}개")


if __name__ == "__main__":
    main()