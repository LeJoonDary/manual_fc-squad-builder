import json
import random
import re
import sys
import time

try:
  from curl_cffi import requests

  USE_CURL_CFFI = True
except ImportError:
  import requests

  USE_CURL_CFFI = False

OUTPUT_FILE = "futgg_female_players.json"
TOTAL_PAGES = 65

session = (
    requests.Session(impersonate="chrome124")
    if USE_CURL_CFFI
    else requests.Session()
)
headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}


def find_players_in_props(obj):
  """Next.js JSON 트리 안에서 선수 목록 배열 재귀 탐색"""
  if isinstance(obj, list):
    if len(obj) > 0 and isinstance(obj[0], dict):
      sample = obj[0]
      if (
          "playerDef" in sample
          or "eaId" in sample
          or "basePlayerEaId" in sample
          or "card" in sample
      ):
        return obj
  elif isinstance(obj, dict):
    for v in obj.values():
      res = find_players_in_props(v)
      if res:
        return res
  return None


def fetch_page_players(page_no):
  url = f"https://www.fut.gg/players/?page={page_no}&quality_id=%5B1%2C4%2C7%5D&gender=%5B2%5D"
  try:
    r = session.get(url, headers=headers, timeout=15)
    if r.status_code == 200:
      match = re.search(
          r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text
      )
      if match:
        data = json.loads(match.group(1))
        page_props = data.get("props", {}).get("pageProps", {})
        return find_players_in_props(page_props)
  except Exception as e:
    print(f"    ! Page {page_no} 요청 오류: {e}")
  return None


def main():
  print("=" * 70)
  print("▶ [FUT.GG 여성 노말 카드 덤프] 골드·실버·브론즈 65페이지 순회 수집")
  print("  - 대상: 65페이지 (페이지당 약 30명, 총 약 1,950명)")
  print("  - 딜레이: 3.5초 ~ 5.0초 랜덤 지터 (차단 방지)")
  print("=" * 70)

  all_female_players = []
  seen_ea_ids = set()

  try:
    for page in range(1, TOTAL_PAGES + 1):
      items = fetch_page_players(page)
      if not items:
        print(f"  ! [Page {page:02d}/{TOTAL_PAGES}] 데이터를 가져오지 못했습니다.")
      else:
        page_new = 0
        for item in items:
          p_def = (
              item.get("playerDef")
              or item.get("card", {}).get("playerDef")
              or (
                  item.get("card")
                  if isinstance(item.get("card"), dict)
                  else None
              )
              or item
          )
          if not isinstance(p_def, dict):
            continue

          ea_id = (
              p_def.get("basePlayerEaId")
              or p_def.get("eaId")
              or (
                  item.get("card", {}).get("eaId")
                  if isinstance(item.get("card"), dict)
                  else None
              )
              or item.get("eaId")
          )
          if not ea_id:
            continue
          ea_id = int(ea_id)

          if ea_id in seen_ea_ids:
            continue
          seen_ea_ids.add(ea_id)

          # 신체 스펙 및 Roles 데이터 파싱
          player_info = {
              "eaId": ea_id,
              "name": (
                  p_def.get("commonName")
                  or f"{p_def.get('firstName', '')} {p_def.get('lastName', '')}".strip()
              ),
              "overall": p_def.get("overall"),
              "height": p_def.get("height"),
              "weight": p_def.get("weight"),
              "bodytypeCode": p_def.get("bodytypeCode"),
              "foot": p_def.get("foot"),
              "rolesPlus": p_def.get("rolesPlus") or [],
              "rolesPlusPlus": p_def.get("rolesPlusPlus") or [],
              "playstyles": p_def.get("playstyles") or [],
              "playstylesPlus": p_def.get("playstylesPlus") or [],
          }
          all_female_players.append(player_info)
          page_new += 1

        print(
            f"✔ [Page {page:02d}/{TOTAL_PAGES}] +{page_new}명 수집 (누적:"
            f" {len(all_female_players):,}명)"
        )

      # 마지막 페이지가 아닐 때 3.5~5.0초 랜덤 딜레이
      if page < TOTAL_PAGES:
        delay = round(random.uniform(3.5, 5.0), 2)
        time.sleep(delay)

  except KeyboardInterrupt:
    print(
        "\n\n[중단 감지] 사용자에 의해 중단되었습니다. 현재까지 수집된 데이터를"
        " 저장합니다..."
    )

  # 수집 결과 JSON 저장
  with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(all_female_players, f, ensure_ascii=False, indent=2)

  print("=" * 70)
  print(
      f"🎉 [수집 완료] 총 {len(all_female_players):,}명의 여성 선수 데이터가"
      f" '{OUTPUT_FILE}'로 저장되었습니다!"
  )
  print("=" * 70)


if __name__ == "__main__":
  main()