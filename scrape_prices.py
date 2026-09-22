import os
import time
import requests
from supabase import create_client, Client

# Supabase 접속 정보 (환경변수에서 로드)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase 환경변수가 설정되지 않았습니다.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def fetch_target_cards():
    """OVR 78 이상이면서 api_id가 존재하는 카드 목록 조회"""
    response = supabase.table("card_versions") \
        .select("id, player_id, api_id, overall, price") \
        .gte("overall", 78) \
        .not_.is_("api_id", "null") \
        .execute()
    return response.data

def get_futbin_price(api_id):
    """Futbin API에서 PS/Console 최저가(LCPrice) 추출"""
    url = f"https://www.futbin.com/26/playerPrices?player={api_id}"
    try:
        res = requests.get(url, headers=HEADERS, timeout=10)
        if res.status_code == 200:
            data = res.json()
            str_id = str(api_id)
            if str_id in data:
                # PS5/Console 최저가 추출 (콤마 제거 후 int 변환)
                lc_price_str = data[str_id]["prices"]["ps"]["LCPrice"]
                clean_price = int(lc_price_str.replace(",", ""))
                return clean_price
    except Exception as e:
        print(f"[ERROR] API Request Failed for ID {api_id}: {e}")
    return None

def main():
    cards = fetch_target_cards()
    print(f"Total target cards (OVR 78+): {len(cards)}")
    
    updated_count = 0
    for idx, card in enumerate(cards, 1):
        card_id = card["id"]
        api_id = card["api_id"]
        
        price = get_futbin_price(api_id)
        if price is not None:
            # Supabase 가격 및 업데이트 시각 갱신
            supabase.table("card_versions") \
                .update({"price": price, "updated_at": "now()"}) \
                .eq("id", card_id) \
                .execute()
            updated_count += 1
            print(f"[{idx}/{len(cards)}] Card ID {card_id} (API ID: {api_id}) -> Price: {price:,} coins")
        else:
            print(f"[{idx}/{len(cards)}] Card ID {card_id} (API ID: {api_id}) -> Price fetch failed")
        
        # Futbin 차단 방지를 위한 1.5초 지연
        time.sleep(1.5)
        
    print(f"\nSuccessfully updated {updated_count}/{len(cards)} prices.")

if __name__ == "__main__":
    main()