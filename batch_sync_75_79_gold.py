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
    print("[오류] Supabase 환경 변수를 확인하세요.")
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
    full_pattern = rf'https?://game-assets\.fut\.gg/[^"\'\s)]+/{asset_type}/[^"\'\s)]+\.png'
    m = re.search(full_pattern, html_text)
    if m: return m.group(0)
    rel_pattern = rf'202\d/{asset_type}/[^"\'\s)]+\.png'
    m = re.search(rel_pattern, html_text)
    if m: return f"https://game-assets.fut.gg/cdn-cgi/image/quality=85,format=auto,width=80/{m.group(0)}"
    return None

def sync_club_and_league_logos(html_text, club_id, league_id):
    if league_id:
        res = supabase.table("leagues").select("logo_url").eq("id", league_id).execute()
        if res.data and (not res.data[0].get("logo_url") or "fc-assets" not in str(res.data[0].get("logo_url"))):
            l_url = extract_asset_url_from_html(html_text, "league")
            if l_url:
                up_url = upload_to_supabase_storage(l_url, f"leagues/{league_id}.png", "image/png")
                if up_url:
                    supabase.table("leagues").update({"logo_url": up_url}).eq("id", league_id).execute()

    if club_id:
        res = supabase.table("clubs").select("logo_url").eq("id", club_id).execute()
        if res.data and (not res.data[0].get("logo_url") or "fc-assets" not in str(res.data[0].get("logo_url"))):
            c_url = extract_asset_url_from_html(html_text, "club")
            if c_url:
                up_url = upload_to_supabase_storage(c_url, f"clubs/{club_id}.png", "image/png")
                if up_url:
                    supabase.table("clubs").update({"logo_url": up_url}).eq("id", club_id).execute()

def fetch_75_79_unprocessed_gold_cards():
    """DB에서 75~79 OVR 골드 카드 중 아직 Storage에 없는 카드만 선별"""
    print("📦 Supabase에서 75~79 골드 카드 목록을 조회 중...")
    cards = []
    page_size = 1000
    offset = 0
    while True:
        res = supabase.table("card_versions") \
            .select("id, player_id, api_id, version, overall, image_url, club_id, league_id, players(name)") \
            .gte("overall", 75) \
            .lte("overall", 79) \
            .order("overall", desc=True) \
            .range(offset, offset + page_size - 1) \
            .execute()
        if not res.data: break
        cards.extend(res.data)
        if len(res.data) < page_size: break
        offset += page_size

    # 순수 골드 카드 필터
    gold_cards = [
        c for c in cards 
        if c.get("version") and c["version"].strip().lower() == "gold"
    ]

    # 이미 Storage에 다운로드 완료된 카드 제외 (자동 이어하기)
    unprocessed = [
        c for c in gold_cards 
        if not (c.get("image_url") and "fc-assets/players" in str(c.get("image_url")))
    ]
    return unprocessed, len(gold_cards)

def request_with_backoff(url, max_retries=4):
    wait_time = 60
    for attempt in range(max_retries):
        resp = requests.get(url, headers=HEADERS, timeout=14)
        if resp.status_code == 429:
            print(f"\n⚠️ [429 감지] {wait_time}초 대기 후 재시도... (시도 {attempt+1}/{max_retries})")
            time.sleep(wait_time)
            wait_time *= 2
            continue
        return resp
    return resp

def process_single_card(card, index, total):
    card_id = card["id"]
    player_id = card["player_id"]
    api_id = card.get("api_id") or player_id
    overall = card["overall"]
    
    player_data = card.get("players") or {}
    if isinstance(player_data, list) and player_data:
        player_data = player_data[0]
    player_name = player_data.get("name") if isinstance(player_data, dict) else "Unknown"
    slug = to_slug(player_name)

    target_url = f"https://www.fut.gg/players/{player_id}-{slug}/27-{api_id}/"
    try:
        resp = request_with_backoff(target_url)
        if resp.status_code == 404:
            fallback_url = f"https://www.fut.gg/players/{player_id}-{slug}/"
            resp = request_with_backoff(fallback_url)

        if resp.status_code != 200:
            print(f"[{index}/{total}] ❌ [실패: HTTP {resp.status_code}] {player_name}")
            return False

        html_text = resp.text
        m_img = re.search(r'202\d/player-item/[^"\'\s)]+\.webp', html_text)
        if not m_img:
            m_img = re.search(r'https?://game-assets\.fut\.gg/[^"\'\s)]+/player-item/([^"\'\s)]+\.webp)', html_text)

        if not m_img:
            print(f"[{index}/{total}] ⚠️ [누끼 없음] {player_name}")
            return False

        matched_path = m_img.group(0)
        source_img_url = matched_path if matched_path.startswith("http") else f"https://game-assets.fut.gg/cdn-cgi/image/quality=85,format=auto,width=500/{matched_path}"

        uploaded_url = upload_to_supabase_storage(source_img_url, f"players/{api_id}.webp", "image/webp")
        if not uploaded_url:
            return False

        supabase.table("card_versions").update({"image_url": uploaded_url}).eq("id", card_id).execute()
        sync_club_and_league_logos(html_text, card.get("club_id"), card.get("league_id"))

        print(f"[{index}/{total}] ✔ [{overall} OVR] {player_name} 적재 완료")
        return True

    except Exception as e:
        print(f"[{index}/{total}] ❌ [에러] {player_name}: {e}")
        return False

def main():
    if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
    
    parser = argparse.ArgumentParser(description="75~79 골드 카드 500장 분할 동기화")
    parser.add_argument("--batch-size", type=int, default=500, help="한 번 실행 시 처리할 카드 개수 (기본 500개)")
    args = parser.parse_args()

    unprocessed_cards, total_gold_75_79 = fetch_75_79_unprocessed_gold_cards()
    remain_count = len(unprocessed_cards)

    print("=" * 65)
    print(f"📊 75~79 골드 총 {total_gold_75_79:,}장 중 현재 미등록: {remain_count:,}장")
    
    if remain_count == 0:
        print("🎉 모든 75~79 골드 카드의 다운로드가 완료되었습니다!")
        return

    # 이번 회차에 처리할 카드 슬라이싱 (최대 500장)
    current_batch = unprocessed_cards[:args.batch_size]
    batch_total = len(current_batch)
    print(f"🚀 이번 실행 처리 대상: {batch_total:,}장 (대기시간: 3.5초~5.0초)")
    print("=" * 65)

    success_cnt = 0
    fail_cnt = 0

    for idx, card in enumerate(current_batch, 1):
        ok = process_single_card(card, idx, batch_total)
        if ok: success_cnt += 1
        else: fail_cnt += 1
        
        time.sleep(random.uniform(3.5, 5.0))

    print("=" * 65)
    print(f"🏁 이번 500장 회차 완료! (성공: {success_cnt}건, 실패: {fail_cnt}건)")
    print(f"👉 남은 미처리 카드: {remain_count - success_cnt:,}장")
    print("   (다음 번에 같은 명령어를 다시 실행하시면 다음 500장을 이어받습니다)")
    print("=" * 65)

if __name__ == "__main__":
    main()