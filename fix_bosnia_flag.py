import os
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

# 세계 표준 공식 보스니아 국기 PNG (160px 고화질)
FLAG_URL = "https://flagcdn.com/w160/ba.png"
STORAGE_PATH = "nations/65.png"

print("1. 보스니아 국기 다운로드 중...")
resp = requests.get(FLAG_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)

if resp.status_code == 200:
    print("2. Supabase Storage (fc-assets/nations/65.png) 업로드 중...")
    supabase.storage.from_("fc-assets").upload(
        path=STORAGE_PATH,
        file=resp.content,
        file_options={"content-type": "image/png", "upsert": "true"}
    )
    public_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/fc-assets/{STORAGE_PATH}"

    print(f"3. nations 테이블 ID 65번 flag_url 갱신 중: {public_url}")
    supabase.table("nations").update({"flag_url": public_url}).eq("id", 65).execute()
    print("🎉 완료! 브라우저 새로고침을 해보세요.")
else:
    print(f"다운로드 실패: HTTP {resp.status_code}")