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

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def log(msg: str):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now_str}] {msg}", flush=True)


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
    help="대상 프로모션 버전명 일부 또는 전체 (예: thunderstruck, thunder, special_thunderstruck)",
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

# 3. 브라우저 세션 및 쿠키 설정 (scrape_prices.py와 완전히 동일하게 통일)
COOKIE_STRING = (os.getenv("FUTGG_COOKIE") or "").strip()
if not COOKIE_STRING:
    log("[경고] 환경변수 FUTGG_COOKIE가 비어 있습니다. .env에 최신 쿠키를 설정하는 것을 권장합니다.")

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
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
})

GAME_VERSION = "27"
PLATFORM = args.platform.strip().lower()

EXCLUDED_UNTRADEABLES = [
    "squad_foundation",
    "ones_to_watch",
    "debut_international_icon",
    "partnerships",
    "special_base_hall_of_fut",
    "base_hall_of_fut",
    "special_sbc",
    "sbc",
    "potm",
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
        return max(int(header_val), 5)
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


def fetch_futgg_price(api_id: int, max_429_retries: int = 4):
    sign_url = "https://www.fut.gg/api/fut/price-access/sign/"
    target_path = f"/api/fut/player-prices/{GAME_VERSION}/{api_id}/?platform={PLATFORM}"

    retry_429 = 0
    net_retry = 0

    while True:
        try:
            # 1단계: 동적 접근 서명(sign) 발급 요청
            sign_res = session.post(sign_url, json={"url": target_path}, timeout=10)
            if sign_res.status_code == 429:
                retry_429 += 1
                if retry_429 > max_429_retries:
                    return None, f"RATE_LIMIT_429_EXCEEDED({max_429_retries}회)"
                wait_sec = parse_retry_after(
                    sign_res.headers.get("Retry-After")
                ) or min(60 * retry_429, 300)
                countdown_sleep(wait_sec, f"FUT.GG 서명 429({retry_429}/{max_429_retries}) - ")
                continue

            if sign_res.status_code == 403 or "Just a moment" in sign_res.text:
                return None, "CLOUDFLARE_403_BLOCKED"

            if sign_res.status_code != 200:
                return None, f"SIGN_FAIL_{sign_res.status_code} ({sign_res.text[:50]})"

            sign_json = sign_res.json()
            sign_data = sign_json.get("data", {})
            signed_path = sign_data.get("url")

            if sign_data.get("challengeRequired"):
                return None, "CLOUDFLARE_403_BLOCKED"

            if not signed_path:
                return None, "NO_SIGNED_URL"

            # 2단계: 서명된 URL로 시세 조회
            price_res = session.get(f"https://www.fut.gg{signed_path}", timeout=10)
            if price_res.status_code == 429:
                retry_429 += 1
                if retry_429 > max_429_retries:
                    return None, f"RATE_LIMIT_429_EXCEEDED({max_429_retries}회)"
                wait_sec = parse_retry_after(
                    price_res.headers.get("Retry-After")
                ) or min(60 * retry_429, 300)
                countdown_sleep(wait_sec, f"FUT.GG 가격 429({retry_429}/{max_429_retries}) - ")
                continue

            if price_res.status_code == 403 or "Just a moment" in price_res.text:
                return None, "CLOUDFLARE_403_BLOCKED"

            if price_res.status_code == 404:
                return None, "이적시장_미출시(404)"
            if price_res.status_code != 200:
                error_msg = price_res.text.strip().replace("\n", " ")[:60]
                return None, f"HTTP_{price_res.status_code} ({error_msg})"

            # 3단계: 가격 및 귀속/SBC/시즌패스 여부 파싱
            price_data = price_res.json().get("data", {})
            curr = price_data.get("currentPrice", {}) or {}
            overview = price_data.get("overview", {}) or {}
            prange = price_data.get("priceRange", {}) or {}

            if (
                curr.get("isSbc") is True
                or curr.get("isObjective") is True
                or curr.get("isUntradeable") is True
                or curr.get("premiumSeasonPassLevel") is not None
                or curr.get("standardSeasonPassLevel") is not None
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
            if net_retry > 3:
                return None, f"ERROR_{str(e)}"
            countdown_sleep(4, f"네트워크 재시도({net_retry}/3) - ")


def update_card_price(card_id: int, price: int, updated_at: str):
    now_utc = (
        updated_at
        if updated_at and not updated_at.startswith("ERROR")
        else datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    supabase.table("card_versions").update({
        "price": price,
        "price_updated_at": now_utc,
    }).eq("id", card_id).execute()


# 4. 메인 실행 흐름
log("=" * 65)
log(f"▶ 대상 버전 검색어 : *{raw_ver}* (부분 일치)")
log(f"▶ 플랫폼           : {PLATFORM}")
log(f"▶ 요청 딜레이       : {args.delay}초")
log(f"▶ 429 최대 재시도   : {args.max_429_retries}회")
log("=" * 65)

res = (
    supabase.table("card_versions")
    .select("id, api_id, player_id, overall, price, version, card_type, players(name)")
    .ilike("version", f"%{raw_ver}%")
    .not_.ilike("card_type", "%sbc%")
    .not_.ilike("card_type", "%token%")
    .not_.ilike("card_type", "%tocken%")
    .not_.ilike("card_type", "%season%")
    .not_.ilike("card_type", "%obj%")
    .not_.ilike("card_type", "%potm%")
    .not_.is_("api_id", "null")
    .order("overall", desc=True)
    .execute()
)

raw_cards = res.data or []
cards = []
excluded_cnt = 0

for card in raw_cards:
    if is_excluded_card(card):
        excluded_cnt += 1
        continue
    cards.append(card)

if not cards:
    log(f"[경고] '*{raw_ver}*' 조건에 맞는 거래 가능 카드가 DB에 없습니다. (제외됨: {excluded_cnt}장)")
    sys.exit(0)

log(f"총 {len(cards)}장의 카드를 대상으로 시세를 수집합니다. (TOKEN/SBC/SEASON/거래불가 {excluded_cnt}장 추가 제외)")

success_count = 0
skip_count = 0
fail_count = 0
consecutive_403_count = 0
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

    price, status_or_date = fetch_futgg_price(
        int(api_id), max_429_retries=args.max_429_retries
    )
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # 서킷 브레이커: 403 연속 2회 감지 시 즉시 중단
    if status_or_date == "CLOUDFLARE_403_BLOCKED":
        consecutive_403_count += 1
        log(
            f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name}) -> "
            f"⚠️ Cloudflare 403 감지 ({consecutive_403_count}/2회)"
        )
        if consecutive_403_count >= 2:
            log("!" * 65)
            log("[서킷 브레이커 발동] Cloudflare 차단 챌린지 감지! 안전하게 종료합니다.")
            log(f"현재까지 수집 성공: {success_count}장")
            log("!" * 65)
            sys.exit(0)
        time.sleep(5)
        continue
    else:
        consecutive_403_count = 0

    if price is not None:
        update_card_price(card_db_id, price, status_or_date)
        log(
            f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name} / API: {api_id}) -> "
            f"{price:,} C 갱신 완료"
        )
        success_count += 1
    elif status_or_date == "이적시장_미출시(404)":
        update_card_price(card_db_id, 0, now_iso)
        log(
            f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name} / API: {api_id}) -> "
            "미출시 확인 (0원 저장)"
        )
        success_count += 1
    elif status_or_date == "거래_내역_없음":
        current_price = card.get("price") if card.get("price") is not None else 0
        update_card_price(card_db_id, current_price, now_iso)
        log(
            f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name} / API: {api_id}) -> "
            "거래내역 없음 (시간만 갱신)"
        )
        success_count += 1
    elif status_or_date == "SBC_OR_UNTRADEABLE":
        log(
            f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name} / API: {api_id}) -> "
            "건너뜀 (SBC/시즌패스/귀속 카드)"
        )
        skip_count += 1
    else:
        log(
            f"[{idx}/{total}] {p_name} (OVR: {ovr} / {ver_name} / API: {api_id}) -> "
            f"수집 실패 ({status_or_date})"
        )
        fail_count += 1

    if idx < total:
        sleep_time = random.uniform(args.delay, args.delay + 1.2)
        time.sleep(sleep_time)

        if idx % 50 == 0:
            rest_time = random.uniform(6.0, 9.0)
            log(f"[안전 대기] 50건 수집 완료. 휴식 중 ({rest_time:.1f}초)...")
            time.sleep(rest_time)

log("=" * 65)
log(f"[완료] 총 {total}장 중 갱신: {success_count}장, 건너뜀: {skip_count}장, 실패: {fail_count}장")
log("=" * 65)
