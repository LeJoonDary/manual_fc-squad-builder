import os
import sys
import re
import time
import random
import unicodedata
import argparse
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Supabase 관리자 클라이언트 초기화
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
)

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("[오류] Supabase 환경 변수(URL, KEY)를 확인하세요.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
STORAGE_BUCKET = "fc-assets"
STORAGE_BASE_URL = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{STORAGE_BUCKET}"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.fut.gg/",
}

def to_slug(name):
    """선수 이름을 URL용 영문 슬러그로 변환 (예: Kylian Mbappé -> kylian-mbappe)"""
    if not name: return "player"
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('utf-8')
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s or "player"

def upload_to_supabase_storage(source_url, storage_path, content_type="image/webp"):
    if not source_url: return None
    try:
        resp = requests.get(source_url, headers=HEADERS, timeout=12)
        if resp.status_code != 200: return None
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=resp.content,
            file_options={"content-type": content_type, "upsert": "true"}
        )
        return f"{STORAGE_BASE_URL}/{storage_path}"
    except Exception:
        return None

def extract_asset_url_from_html(html_text, asset_type):
    """HTML 본문에서 club 또는 league 이미지 URL 정규식 직통 추출"""
    full_pattern = rf'https?://game-assets\.fut\.gg/[^"\'\s)]+/{asset_type}/[^"\'\s)]+\.png'
    m = re.search(full_pattern, html_text)
    if m: return m.group(0)
    rel_pattern = rf'202\d/{asset_type}/[^"\'\s)]+\.png'
    m = re.search(rel_pattern, html_text)
    if m: return f"https://game-assets.fut.gg/cdn-cgi/image/quality=85,format=auto,width=80/{m.group(0)}"
    return None

def sync_club_and_league_logos(html_text, club_id, league_id):
    """리그 및 클럽 로고가 DB에 등록되어 있지 않을 때만 1회 자동 업로드 (국기는 제외)"""
    if league_id:
        res = supabase.table("leagues").select("logo_url").eq("id", league_id).execute()
        if res.data and (not res.data[0].get("logo_url") or "fc-assets" not in str(res.data[0].get("logo_url"))):
            l_url = extract_asset_url_from_html(html_text, "league")
            if l_url:
                up_url = upload_to_supabase_storage(l_url, f"leagues/{league_id}.png", "image/png")
                if up_url:
                    supabase.table("leagues").update({"logo_url": up_url}).eq("id", league_id).execute()
                    print(f"  🏆 [리그 로고 동기화 완료] ID: {league_id}")

    if club_id:
        res = supabase.table("clubs").select("logo_url").eq("id", club_id).execute()
        if res.data and (not res.data[0].get("logo_url") or "fc-assets" not in str(res.data[0].get("logo_url"))):
            c_url = extract_asset_url_from_html(html_text, "club")
            if c_url:
                up_url = upload_to_supabase_storage(c_url, f"clubs/{club_id}.png", "image/png")
                if up_url:
                    supabase.table("clubs").update({"logo_url": up_url}).eq("id", club_id).execute()
                    print(f"  🛡️ [클럽 로고 동기화 완료] ID: {club_id}")

def fetch_80plus_gold_cards_from_db():
    """DB에서 80+ 순수 골드(Gold) 카드만 엄격 선별"""
    print("📦 Supabase에서 80+ 골드 카드 목록을 불러오는 중...")
    cards = []
    page_size = 500
    offset = 0
    while True:
        res = supabase.table("card_versions") \
            .select("id, player_id, api_id, version, overall, image_url, club_id, league_id, players(name)") \
            .gte("overall", 80) \
            .order("overall", desc=True) \
            .range(offset, offset + page_size - 1) \
            .execute()
        if not res.data: break
        cards.extend(res.data)
        if len(res.data) < page_size: break
        offset += page_size

    # 오직 'gold' 버전 카드만 선별 (스페셜, 아이콘, 히어로, 홀오브풋 완전 배제)
    gold_cards = [
        c for c in cards 
        if c.get("version") and c["version"].strip().lower() == "gold" and (c.get("overall") or 0) >= 80
    ]
    return gold_cards

def request_with_backoff(url, max_retries=4):
    """429 봇 감지 발생 시 지수 백오프로 안전 대기 (60s -> 120s -> 240s)"""
    wait_time = 60
    for attempt in range(max_retries):
        resp = requests.get(url, headers=HEADERS, timeout=14)
        if resp.status_code == 429:
            print(f"\n⚠️ [429 봇 감지!] 방화벽 휴식 모드: {wait_time}초 대기 후 재시도합니다... (시도 {attempt+1}/{max_retries})")
            time.sleep(wait_time)
            wait_time *= 2
            continue
        return resp
    return resp

def process_single_card(card, index, total, force=False):
    card_id = card["id"]
    player_id = card["player_id"]
    api_id = card.get("api_id") or player_id
    overall = card["overall"]
    existing_img = card.get("image_url")
    
    player_data = card.get("players") or {}
    if isinstance(player_data, list) and player_data:
        player_data = player_data[0]
    player_name = player_data.get("name") if isinstance(player_data, dict) else "Unknown"
    slug = to_slug(player_name)

    # 1. 이미 내 Storage에 등록된 카드는 스킵 (force=True 제외)
    if not force and existing_img and "fc-assets/players" in existing_img:
        print(f"[{index}/{total}] ⏩ [스킵] [{overall} OVR] {player_name} - 이미 Storage 등록 완료")
        return True

    # 2. 골드 카드 FUT.GG URL 접속
    target_url = f"https://www.fut.gg/players/{player_id}-{slug}/27-{api_id}/"
    
    try:
        resp = request_with_backoff(target_url)
        if resp.status_code == 404:
            # 2차 fallback URL 시도
            fallback_url = f"https://www.fut.gg/players/{player_id}-{slug}/"
            resp = request_with_backoff(fallback_url)

        if resp.status_code != 200:
            print(f"[{index}/{total}] ❌ [실패: HTTP {resp.status_code}] {player_name} ({target_url})")
            return False

        html_text = resp.text

        # 3. 누끼/헤드샷 이미지 경로 추출
        m_img = re.search(r'202\d/player-item/[^"\'\s)]+\.webp', html_text)
        if not m_img:
            m_img = re.search(r'https?://game-assets\.fut\.gg/[^"\'\s)]+/player-item/([^"\'\s)]+\.webp)', html_text)

        if not m_img:
            print(f"[{index}/{total}] ⚠️ [누끼 누락] {player_name} - player-item 이미지를 찾지 못함")
            return False

        matched_path = m_img.group(0)
        source_img_url = matched_path if matched_path.startswith("http") else f"https://game-assets.fut.gg/cdn-cgi/image/quality=85,format=auto,width=500/{matched_path}"

        # 4. 내 Supabase Storage (fc-assets/players/{api_id}.webp) 업로드
        uploaded_url = upload_to_supabase_storage(source_img_url, f"players/{api_id}.webp", "image/webp")
        if not uploaded_url:
            print(f"[{index}/{total}] ❌ [업로드 실패] {player_name}")
            return False

        # 5. DB card_versions 테이블 image_url 업데이트
        supabase.table("card_versions").update({"image_url": uploaded_url}).eq("id", card_id).execute()

        # 6. 클럽 및 리그 로고 검사 & 필요 시 자동 동기화
        sync_club_and_league_logos(html_text, card.get("club_id"), card.get("league_id"))

        print(f"[{index}/{total}] ✔ [완료] [{overall} OVR] {player_name} (Gold) ➔ fc-assets 영구 저장 성공")
        return True

    except Exception as e:
        print(f"[{index}/{total}] ❌ [에러] {player_name}: {e}")
        return False

def main():
    if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
    
    parser = argparse.ArgumentParser(description="OVR 80+ 골드 카드 컷아웃 및 클럽/리그 엠블럼 동기화")
    parser.add_argument("--limit", type=int, default=0, help="처리할 카드 개수 제한 (0: 전체)")
    parser.add_argument("--force", action="store_true", help="기존 이미지 있어도 강제 재다운로드")
    args = parser.parse_args()

    cards = fetch_80plus_gold_cards_from_db()
    total = len(cards)
    print(f"🎯 80+ 골드 카드 총 대상: {total:,}장")

    if total == 0:
        print("조건에 맞는 80+ 골드 카드가 없습니다.")
        return

    if args.limit > 0:
        cards = cards[:args.limit]
        print(f"⚙️ 테스트 모드: 상위 {args.limit}장만 먼저 실행합니다.")

    success_cnt = 0
    fail_cnt = 0

    print("=" * 65)
    print("🚀 80+ 골드 카드 동기화 시작 (안전 딜레이: 3.5초 ~ 5.0초)")
    print("=" * 65)

    for idx, card in enumerate(cards, 1):
        ok = process_single_card(card, idx, len(cards), force=args.force)
        if ok: success_cnt += 1
        else: fail_cnt += 1
        
        # 3.5초 ~ 5.0초 안전 대기
        delay = random.uniform(3.5, 5.0)
        time.sleep(delay)

    print("=" * 65)
    print(f"🎉 80+ 골드 카드 작업 완료! (성공/유지: {success_cnt:,}건, 실패: {fail_cnt:,}건)")
    print("=" * 65)

if __name__ == "__main__":
    main()