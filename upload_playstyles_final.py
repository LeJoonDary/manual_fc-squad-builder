import base64
import json
import os
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()
SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
)
SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
)

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
  print("[오류] .env 파일에서 Supabase 환경 변수를 확인하세요.")
  exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
BUCKET_NAME = "playstyle-icons"
LOCAL_DIR = "playstyle_icons"
os.makedirs(LOCAL_DIR, exist_ok=True)

JSON_FILE = "playstyle_icons_base64.json"
if not os.path.exists(JSON_FILE):
  print(f"[오류] '{JSON_FILE}' 파일을 프로젝트 루트에 넣어주세요.")
  exit(1)

with open(JSON_FILE, "r", encoding="utf-8") as f:
  items = json.load(f)

print("=" * 65)
print(f"▶ 대상 데이터: {len(items)}개 플레이스타일 (총 80개 이미지)")
print(f"▶ 스토리지 버킷: {BUCKET_NAME}")
print("=" * 65)

success_count = 0

for item in items:
  pid = item["id"]
  name = item["name"]
  category = item["category"]

  # Base64 디코딩 및 로컬 고화질 PNG 저장
  norm_b64 = item["normal_png"].split(",")[1]
  plus_b64 = item["plus_png"].split(",")[1]

  norm_bytes = base64.b64decode(norm_b64)
  plus_bytes = base64.b64decode(plus_b64)

  norm_file = os.path.join(LOCAL_DIR, f"normal_{pid}.png")
  plus_file = os.path.join(LOCAL_DIR, f"plus_{pid}.png")

  with open(norm_file, "wb") as f:
    f.write(norm_bytes)
  with open(plus_file, "wb") as f:
    f.write(plus_bytes)

  # Supabase Storage 업로드 (Service Role Key로 RLS 무관하게 강제 저장)
  supabase.storage.from_(BUCKET_NAME).upload(
      path=f"normal_{pid}.png",
      file=norm_bytes,
      file_options={"content-type": "image/png", "upsert": "true"},
  )
  supabase.storage.from_(BUCKET_NAME).upload(
      path=f"plus_{pid}.png",
      file=plus_bytes,
      file_options={"content-type": "image/png", "upsert": "true"},
  )

  # DB playstyles 테이블 갱신
  storage_normal_url = (
      f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/normal_{pid}.png"
  )
  storage_plus_url = (
      f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/plus_{pid}.png"
  )

  supabase.table("playstyles").update({
      "image_url": storage_normal_url,
      "image_url_plus": storage_plus_url,
      "category": category,
  }).eq("id", pid).execute()

  success_count += 1
  print(f"  ✔ [{pid:02d}/40] {name:18s} -> 256px PNG 업로드 및 DB 갱신 완료")

print("=" * 65)
print(f"[완료] 총 {success_count}개 플레이스타일 에셋 구축이 완료되었습니다!")
print("=" * 65)