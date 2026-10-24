import os
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
STORAGE_BUCKET = "fc-assets"

# 1. 인게임 스타일 남성 실루엣 (단정한 숏헤어 & 남성 어깨선)
MALE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 380" width="100%" height="100%">
  <defs>
    <linearGradient id="maleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#475569" stop-opacity="0.9"/>
      <stop offset="60%" stop-color="#1e293b" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <path d="M 160 30 C 120 30 100 55 100 95 C 100 135 125 160 142 168 L 142 188 C 95 198 50 230 25 285 C 15 308 10 338 10 370 L 310 370 C 310 338 305 308 295 285 C 270 230 225 198 178 188 L 178 168 C 195 160 220 135 220 95 C 220 55 200 30 160 30 Z" 
        fill="url(#maleGrad)" stroke="#64748b" stroke-width="2"/>
  <path d="M 125 225 Q 160 250 195 225" fill="none" stroke="#94a3b8" stroke-width="2.5" opacity="0.35"/>
</svg>"""

# 2. 인게임 스타일 여성 실루엣 (묶은 머리 포니테일 & 슬림 어깨선)
FEMALE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 380" width="100%" height="100%">
  <defs>
    <linearGradient id="femGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#475569" stop-opacity="0.9"/>
      <stop offset="60%" stop-color="#1e293b" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <path d="M 160 32 C 122 32 104 55 104 92 C 104 130 126 156 144 165 L 144 185 C 105 195 65 225 42 278 C 30 304 25 336 25 370 L 295 370 C 295 336 290 304 278 278 C 255 225 215 195 176 185 L 176 165 C 194 156 216 130 216 92 C 216 78 210 65 202 55 C 222 62 242 80 244 105 C 245 122 235 138 220 144 C 224 130 223 112 216 98 C 210 62 192 32 160 32 Z" 
        fill="url(#femGrad)" stroke="#64748b" stroke-width="2"/>
  <path d="M 130 220 Q 160 242 190 220" fill="none" stroke="#94a3b8" stroke-width="2.5" opacity="0.35"/>
</svg>"""

print("1. 남성 실루엣 업로드 중...")
supabase.storage.from_(STORAGE_BUCKET).upload(
    path="placeholders/silhouette_male.svg",
    file=MALE_SVG.encode("utf-8"),
    file_options={"content-type": "image/svg+xml", "upsert": "true"}
)

print("2. 여성 실루엣 업로드 중...")
supabase.storage.from_(STORAGE_BUCKET).upload(
    path="placeholders/silhouette_female.svg",
    file=FEMALE_SVG.encode("utf-8"),
    file_options={"content-type": "image/svg+xml", "upsert": "true"}
)

base_url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{STORAGE_BUCKET}/placeholders"
print("🎉 실루엣 2종 업로드 완료!")
print(f" - 남성: {base_url}/silhouette_male.svg")
print(f" - 여성: {base_url}/silhouette_female.svg")