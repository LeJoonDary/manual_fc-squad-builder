import json
import os
import requests

INPUT_FILE = "special_cards.json"
SAVE_DIR = "card_backgrounds"

if not os.path.exists(INPUT_FILE):
  print(f"[오류] '{INPUT_FILE}' 파일이 없습니다.")
  exit(1)

os.makedirs(SAVE_DIR, exist_ok=True)

with open(INPUT_FILE, "r", encoding="utf-8") as f:
  cards = json.load(f)

unique_bgs = {}

for c in cards:
  ea_id = c.get("eaId") or 0
  rarity = c.get("rarity") or {}
  r_slug = (rarity.get("slug") or "").lower()

  if (67000000 <= ea_id < 68000000) or "debut" in r_slug:
    target_ver = "special_debut_international_icon"
  elif (
      c.get("leagueEaId") == 2118
      or (c.get("club") or {}).get("isIconClub")
      or "icon" in r_slug
  ):
    target_ver = "special_base_icon"
  elif c.get("isHero") or "hero" in r_slug:
    target_ver = "special_base_hero"
  elif "totw" in r_slug:
    target_ver = "special_totw"
  else:
    target_ver = f"special_{r_slug.replace('-', '_')}"

  # 고화질 대형 카드 배경 URL 추출
  bg_url = rarity.get("imageUrl")
  if not bg_url and rarity.get("imagePath"):
    bg_url = f"https://game-assets.fut.gg/cdn-cgi/image/quality=95,format=png,width=500/{rarity.get('imagePath')}"

  if bg_url and target_ver not in unique_bgs:
    unique_bgs[target_ver] = {
        "name": rarity.get("name"),
        "url": bg_url,
    }

print("=" * 65)
print(f"총 {len(unique_bgs)}종류의 카드 배경 이미지를 추출했습니다.\n")

headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0"
        " Safari/537.36"
    )
}

for ver_name, data in unique_bgs.items():
  file_path = os.path.join(SAVE_DIR, f"{ver_name}.png")
  try:
    res = requests.get(data["url"], headers=headers)
    if res.status_code == 200:
      with open(file_path, "wb") as f_img:
        f_img.write(res.content)
      print(f"[{ver_name}] ({data['name']}) -> 저장 완료")
    else:
      print(f"[{ver_name}] 다운로드 실패: HTTP {res.status_code}")
  except Exception as e:
    print(f"[{ver_name}] 오류 발생: {e}")

print("=" * 65)
print(f"작업 완료! '{SAVE_DIR}' 폴더에 투명 배경 PNG가 저장되었습니다.")