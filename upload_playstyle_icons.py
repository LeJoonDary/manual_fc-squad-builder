import base64
import json
import os
from curl_cffi import requests
from dotenv import load_dotenv
from supabase import Client, create_client

# 1. 환경 변수 로드 및 서비스 롤 키 정밀 검증
load_dotenv()
SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
)

# service_role 키를 최우선으로 탐색
SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_SERVICE_KEY")
    or os.getenv("SUPABASE_KEY")
)

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
  print("[오류] .env 파일에서 SUPABASE_URL 또는 키를 찾을 수 없습니다.")
  exit(1)


# JWT 디코딩으로 키 권한 확인
def check_key_role(key_str):
  try:
    part = key_str.split(".")[1]
    part += "=" * (-len(part) % 4)
    data = json.loads(base64.b64decode(part).decode())
    return data.get("role", "unknown")
  except Exception:
    return "unknown"


role = check_key_role(SERVICE_ROLE_KEY)
print("=" * 65)
print(f"▶ Supabase URL: {SUPABASE_URL}")
print(f"▶ 감지된 키 권한: [{role}]")
if role == "service_role":
  print("  ✔ 서비스 롤 키(관리자) 정상 확인! RLS 정책 없이 안전하게 업로드합니다.")
else:
  print("  ! 주의: service_role 키가 아닐 경우 스토리지 정책에 따라 차단될 수 있습니다.")
print("=" * 65)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
BUCKET_NAME = "playstyle-icons"
LOCAL_DIR = "playstyle_icons"
os.makedirs(LOCAL_DIR, exist_ok=True)

# 2. 내 DB 공식 40종 PlayStyles 정의 (ID, 명칭, 카테고리, 슬러그 후보군)
PLAYSTYLES_DATA = [
    # Shooting
    (2, "Finesse Shot", "Shooting", ["finesse-shot"]),
    (25, "Chip Shot", "Shooting", ["chip-shot"]),
    (3, "Power Shot", "Shooting", ["power-shot"]),
    (16, "Dead Ball", "Shooting", ["dead-ball"]),
    (36, "Precision Header", "Shooting", ["precision-header"]),
    (21, "Acrobatic", "Shooting", ["acrobatic"]),
    (37, "Low Driven Shot", "Shooting", ["low-driven-shot", "low-driven"]),
    (38, "Gamechanger", "Shooting", ["gamechanger", "game-changer"]),
    (22, "Power Header", "Shooting", ["power-header"]),
    (13, "Trivela", "Shooting", ["trivela"]),
    # Passing
    (4, "Incisive Pass", "Passing", ["incisive-pass"]),
    (17, "Pinged Pass", "Passing", ["pinged-pass"]),
    (12, "Long Ball Pass", "Passing", ["long-ball-pass", "long-ball"]),
    (27, "Tiki Taka", "Passing", ["tiki-taka"]),
    (5, "Whipped Pass", "Passing", ["whipped-pass"]),
    (40, "Inventive", "Passing", ["inventive"]),
    # Defending
    (24, "Jockey", "Defending", ["jockey"]),
    (14, "Block", "Defending", ["block"]),
    (9, "Intercept", "Defending", ["intercept"]),
    (8, "Anticipate", "Defending", ["anticipate"]),
    (29, "Slide Tackle", "Defending", ["slide-tackle"]),
    (39, "Aerial Fortress", "Defending", ["aerial-fortress"]),
    # Ball Control
    (7, "Technical", "Ball Control", ["technical"]),
    (6, "Rapid", "Ball Control", ["rapid"]),
    (19, "First Touch", "Ball Control", ["first-touch"]),
    (28, "Trickster", "Ball Control", ["trickster"]),
    (23, "Press Proven", "Ball Control", ["press-proven"]),
    (18, "Flair", "Ball Control", ["flair"]),
    # Physical
    (1, "Quick Step", "Physical", ["quick-step"]),
    (20, "Relentless", "Physical", ["relentless"]),
    (30, "Long Throw", "Physical", ["long-throw"]),
    (10, "Bruiser", "Physical", ["bruiser"]),
    (35, "Enforcer", "Physical", ["enforcer"]),
    (11, "Aerial", "Physical", ["aerial"]),
    # Goalkeeper
    (15, "Far Throw", "Goalkeeper", ["far-throw"]),
    (33, "Footwork", "Goalkeeper", ["footwork"]),
    (26, "Cross Claimer", "Goalkeeper", ["cross-claimer"]),
    (31, "Rush Out", "Goalkeeper", ["rush-out"]),
    (34, "Far Reach", "Goalkeeper", ["far-reach"]),
    (32, "Deflector", "Goalkeeper", ["deflector"]),
]

session = requests.Session(impersonate="chrome124")
headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Referer": "https://www.fut.gg/",
}


# 다중 CDN 후보군 다운로드 함수
def fetch_icon(slug_list, is_plus, local_path):
  if os.path.exists(local_path) and os.path.getsize(local_path) > 300:
    return True

  folder = "playstyles-plus" if is_plus else "playstyles"
  fb_folder = "playstyles_plus" if is_plus else "playstyles"

  urls = []
  for slug in slug_list:
    # 1) FUT.GG 다중 시즌 및 CDN 포맷
    urls.extend([
        (
            "https://game-assets.fut.gg/cdn-cgi/image/quality=95,format=png,width=128/2025/"
            f"{folder}/{slug}.png"
        ),
        (
            "https://game-assets.fut.gg/cdn-cgi/image/quality=95,format=png,width=128/2027/"
            f"{folder}/{slug}.png"
        ),
        (
            "https://game-assets.fut.gg/cdn-cgi/image/quality=95,format=png,width=128/2026/"
            f"{folder}/{slug}.png"
        ),
        (
            "https://game-assets.fut.gg/cdn-cgi/image/quality=95,format=png,width=128/2024/"
            f"{folder}/{slug}.png"
        ),
        f"https://game-assets.fut.gg/2025/{folder}/{slug}.png",
        f"https://game-assets.fut.gg/2027/{folder}/{slug}.png",
        # 2) Futbin CDN 대체 경로
        f"https://cdn.futbin.com/content/fifa25/img/{fb_folder}/{slug}.png",
        f"https://cdn.futbin.com/content/fifa26/img/{fb_folder}/{slug}.png",
    ])

  for url in urls:
    try:
      r = session.get(url, headers=headers, timeout=6)
      if r.status_code == 200 and len(r.content) > 300:
        with open(local_path, "wb") as f:
          f.write(r.content)
        return True
    except Exception:
      continue
  return False


# 스토리지 업로드 (서비스 롤 키 권한으로 강제 Upsert)
def upload_to_storage(filename, local_path):
  if not os.path.exists(local_path):
    return False, "로컬 파일 없음"

  with open(local_path, "rb") as f:
    file_bytes = f.read()

  try:
    supabase.storage.from_(BUCKET_NAME).upload(
        path=filename,
        file=file_bytes,
        file_options={"content-type": "image/png", "upsert": "true"},
    )
    return True, "성공"
  except Exception as e:
    err_str = str(e)
    # 이미 파일이 있는 경우 update로 시도
    if (
        "Duplicate" in err_str
        or "already exists" in err_str
        or "409" in err_str
    ):
      try:
        supabase.storage.from_(BUCKET_NAME).update(
            path=filename,
            file=file_bytes,
            file_options={"content-type": "image/png", "upsert": "true"},
        )
        return True, "기존 파일 덮어쓰기 성공"
      except Exception as e2:
        return False, str(e2)
    return False, err_str


# 3. 메인 파이프라인 실행
print("▶ [1/2] 플레이스타일 40종 Normal/Plus 아이콘 다운로드 및 스토리지 적재...")
total_uploaded = 0

for pid, name, cat, slugs in PLAYSTYLES_DATA:
  file_norm = os.path.join(LOCAL_DIR, f"normal_{pid}.png")
  file_plus = os.path.join(LOCAL_DIR, f"plus_{pid}.png")

  ok_n = fetch_icon(slugs, False, file_norm)
  ok_p = fetch_icon(slugs, True, file_plus)

  # Normal 업로드
  up_n, msg_n = upload_to_storage(f"normal_{pid}.png", file_norm)
  if up_n:
    total_uploaded += 1
  else:
    print(f"  ❌ [{pid}] {name} Normal 실패: {msg_n}")

  # Plus 업로드
  up_p, msg_p = upload_to_storage(f"plus_{pid}.png", file_plus)
  if up_p:
    total_uploaded += 1
  else:
    print(f"  ❌ [{pid}] {name} Plus 실패: {msg_p}")

  if up_n and up_p:
    print(f"  ✔ [{pid:02d}/40] {name:18s} -> Storage 업로드 완료")

# 4. 버킷 실시간 검증
print("\n" + "=" * 65)
print("▶ [2/2] Supabase Storage 버킷 상태 검증 중...")
try:
  file_list = supabase.storage.from_(BUCKET_NAME).list()
  print(f"✔ 스토리지 버킷('{BUCKET_NAME}') 내 실제 저장된 파일 수: {len(file_list)}개")
except Exception as e:
  print(f"! 버킷 목록 조회 예외: {e}")

print("=" * 65)
print(f"[완료] 총 {total_uploaded}개 아이콘이 안전하게 스토리지에 저장되었습니다!")
print("=" * 65)