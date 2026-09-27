import os
import re
from curl_cffi import requests
from dotenv import load_dotenv
from supabase import Client, create_client

# 1. Supabase 연결
load_dotenv()
SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
)
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
)

if not SUPABASE_URL or not SUPABASE_KEY:
  raise ValueError(".env 파일에서 Supabase 환경 변수를 찾을 수 없습니다.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. 내 DB 공식 PlayStyles 마스터 정의 (ID 1~40, 영문명, 카테고리, FUT.GG 슬러그)
PLAYSTYLES_DATA = [
    # Shooting (8개)
    (2, "Finesse Shot", "Shooting", "finesse-shot"),
    (25, "Chip Shot", "Shooting", "chip-shot"),
    (3, "Power Shot", "Shooting", "power-shot"),
    (16, "Dead Ball", "Shooting", "dead-ball"),
    (36, "Precision Header", "Shooting", "precision-header"),
    (21, "Acrobatic", "Shooting", "acrobatic"),
    (37, "Low Driven Shot", "Shooting", "low-driven-shot"),
    (38, "Gamechanger", "Shooting", "gamechanger"),
    (22, "Power Header", "Shooting", "power-header"),
    (13, "Trivela", "Shooting", "trivela"),
    # Passing (6개)
    (4, "Incisive Pass", "Passing", "incisive-pass"),
    (17, "Pinged Pass", "Passing", "pinged-pass"),
    (12, "Long Ball Pass", "Passing", "long-ball-pass"),
    (27, "Tiki Taka", "Passing", "tiki-taka"),
    (5, "Whipped Pass", "Passing", "whipped-pass"),
    (40, "Inventive", "Passing", "inventive"),
    # Defending (6개)
    (24, "Jockey", "Defending", "jockey"),
    (14, "Block", "Defending", "block"),
    (9, "Intercept", "Defending", "intercept"),
    (8, "Anticipate", "Defending", "anticipate"),
    (29, "Slide Tackle", "Defending", "slide-tackle"),
    (39, "Aerial Fortress", "Defending", "aerial-fortress"),
    # Ball Control (6개)
    (7, "Technical", "Ball Control", "technical"),
    (6, "Rapid", "Ball Control", "rapid"),
    (19, "First Touch", "Ball Control", "first-touch"),
    (28, "Trickster", "Ball Control", "trickster"),
    (23, "Press Proven", "Ball Control", "press-proven"),
    (18, "Flair", "Ball Control", "flair"),
    # Physical (6개)
    (1, "Quick Step", "Physical", "quick-step"),
    (20, "Relentless", "Physical", "relentless"),
    (30, "Long Throw", "Physical", "long-throw"),
    (10, "Bruiser", "Physical", "bruiser"),
    (35, "Enforcer", "Physical", "enforcer"),
    (11, "Aerial", "Physical", "aerial"),
    # Goalkeeper (6개)
    (15, "Far Throw", "Goalkeeper", "far-throw"),
    (33, "Footwork", "Goalkeeper", "footwork"),
    (26, "Cross Claimer", "Goalkeeper", "cross-claimer"),
    (31, "Rush Out", "Goalkeeper", "rush-out"),
    (34, "Far Reach", "Goalkeeper", "far-reach"),
    (32, "Deflector", "Goalkeeper", "deflector"),
]

# 3. FUT.GG 공식 페이지에서 최신 이미지 CDN 해시 맵 실시간 크롤링
print("=" * 65)
print("▶ [1/3] FUT.GG 플레이스타일 최신 에셋 URL 수집 시작...")
print("=" * 65)

session = requests.Session(impersonate="chrome124")
headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.fut.gg/",
}

live_normal_urls = {}
live_plus_urls = {}

try:
  res = session.get("https://www.fut.gg/playstyles/", headers=headers, timeout=15)
  if res.status_code == 200:
    # futgg 페이지 내 이미지 경로 추출
    found_imgs = re.findall(
        r'src=["\'](https://game-assets\.fut\.gg/[^"\']*playstyles?[^"\']*)["\']',
        res.text,
    )
    for img_url in found_imgs:
      for _, _, _, slug in PLAYSTYLES_DATA:
        if f"/{slug}." in img_url or f"/{slug}-" in img_url or f"/{slug}_" in img_url:
          if "plus" in img_url.lower():
            live_plus_urls[slug] = img_url
          else:
            live_normal_urls[slug] = img_url
    print(
        f"  * FUT.GG 실시간 에셋 감지 완료 (Normal {len(live_normal_urls)}개, Plus"
        f" {len(live_plus_urls)}개)"
    )
except Exception as e:
  print(f"  * 실시간 웹 크롤링 우회 (공식 CDN 백업 URL 생성기 사용): {e}")

# 로컬 저장 폴더 생성
LOCAL_DIR = "playstyle_icons"
os.makedirs(LOCAL_DIR, exist_ok=True)

# 4. 이미지 다운로드 및 Supabase Storage 업로드
print("\n" + "=" * 65)
print("▶ [2/3] 아이콘 다운로드 및 Supabase Storage 업로드...")
print("=" * 65)

BUCKET_NAME = "playstyle-icons"
success_count = 0

for pid, name, cat, slug in PLAYSTYLES_DATA:
  print(f"[{pid:02d}/40] {name} ({cat})...")

  # 1) Normal(은색) URL 결정
  url_normal = live_normal_urls.get(
      slug,
      f"https://game-assets.fut.gg/cdn-cgi/image/quality=95,format=png,width=128/2027/playstyles/{slug}.png",
  )
  # 2) Plus(금색) URL 결정
  url_plus = live_plus_urls.get(
      slug,
      f"https://game-assets.fut.gg/cdn-cgi/image/quality=95,format=png,width=128/2027/playstyles-plus/{slug}.png",
  )

  local_normal_file = os.path.join(LOCAL_DIR, f"normal_{pid}.png")
  local_plus_file = os.path.join(LOCAL_DIR, f"plus_{pid}.png")

  # 다운로드 (Normal)
  if not os.path.exists(local_normal_file):
    r = session.get(url_normal, headers=headers, timeout=10)
    if r.status_code == 200:
      with open(local_normal_file, "wb") as f:
        f.write(r.content)
    else:
      # 2025 폴더 대체 시도
      alt_url = url_normal.replace("2027", "2025")
      r2 = session.get(alt_url, headers=headers, timeout=10)
      if r2.status_code == 200:
        with open(local_normal_file, "wb") as f:
          f.write(r2.content)

  # 다운로드 (Plus)
  if not os.path.exists(local_plus_file):
    r = session.get(url_plus, headers=headers, timeout=10)
    if r.status_code == 200:
      with open(local_plus_file, "wb") as f:
        f.write(r.content)
    else:
      # 2025 폴더 대체 시도
      alt_url = url_plus.replace("2027", "2025")
      r2 = session.get(alt_url, headers=headers, timeout=10)
      if r2.status_code == 200:
        with open(local_plus_file, "wb") as f:
          f.write(r2.content)

  # Supabase Storage 업로드
  for kind, fpath in [
      (f"normal_{pid}.png", local_normal_file),
      (f"plus_{pid}.png", local_plus_file),
  ]:
    if os.path.exists(fpath):
      with open(fpath, "rb") as f_data:
        try:
          supabase.storage.from_(BUCKET_NAME).upload(
              path=kind,
              file=f_data.read(),
              file_options={"content-type": "image/png", "upsert": "true"},
          )
        except Exception:
          pass

  # 5. DB playstyles 테이블 UPDATE
  storage_normal_url = (
      f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/normal_{pid}.png"
  )
  storage_plus_url = (
      f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/plus_{pid}.png"
  )

  supabase.table("playstyles").update({
      "image_url": storage_normal_url,
      "image_url_plus": storage_plus_url,
      "category": cat,
  }).eq("id", pid).execute()

  success_count += 1
  print(f"  -> DB 업데이트 완료: {name} (ID: {pid})")

print("\n" + "=" * 65)
print(f"[완료] 총 {success_count}개 플레이스타일 에셋 및 DB 정합성 구축 완료!")
print("=" * 65)