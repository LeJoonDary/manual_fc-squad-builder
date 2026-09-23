import json
import os
from pathlib import Path
import re
import time
import requests
from dotenv import load_dotenv

# 1. 환경변수 로드
load_dotenv(Path(".env.local") if Path(".env.local").exists() else Path(".env"))

COOKIE_STRING = (
    os.getenv("FUTGG_COOKIE")
    or "_ga=GA1.1.963824020.1787069981; "
    "__Host-futgg_price_sid=Bs9QCk-wurGCMzZ2NH0fiVfj23CcH3s6.XIZHbBc1HR0lbGySTjCa2PgT11mMOJTN7VXuLCYPxS0; "
    "cookieyes-consent=consentid:YjZOOUV4T2h6UkFoTUwzM2ZpWGE0SFFpZXZaUXFhMk8,consent:,action:,necessary:,functional:,analytics:,performance:,advertisement:,other:; "
    "_cfuvid=4ZFUsuXuK0kiu9uAJNFNfJc.Yrt.mKGXndq80JSrclY-1790142673.4499288-1.0.1.1-ghnpsOsnOmkZJU9YH5L4s2Bs36p8xnsQC73y_7TF6GQ; "
    "cf_clearance=FrNwr46zT0HlakHT4JiRETy_ocjlJ5wltxwJlaXDpuo-1790143934-1.2.1.1-2N3YCv3M7__M7KR8DWcMZABdWHz4.7yKmk6peaEFiif1UZMvVr6p46sLJaZAF2wHA27aznW4bx7fHJMsKHs0HiuGLze8sq9rFGgeYMvbFGy6vDkXBBdcoNiaDRprNQS5F4qUn9cRjRbtjXCyjgTdOWYAXSw5iq7bS8ClXJmzc4741iKTy5V1S3Q3t_BrBmd.XeffGGp7uu4yCrvDRgucmgME5GWMJQ2w7WIpQqBtBYY5bYKVrjozMmZ1_i2L193PK8T3y3mX0z8paJxOs9d9jFL9zKO0_QqH8A2B8q2tD8oYvVyi6dSeB5D8KG5XF3icmFQhVzXI9Mb5N..Aun8PXOzH5L3m7u3ErHXFmx8fzvY; "
    "__cf_bm=xYhlHLwOSCK9Sn4dRttQnWhdUJhEvgq5zjtxrD8cG5c-1790143934.8071065-1.0.1.1-edbCVrMlSACUqeJ9HzbZ3GL9_IQXY7VEoPt1EY1kRDY17P2C5LMrCC5VqAnsvt6t1_IgdW8_da8ID3V43qzkBTK93329KuM9C_jw.GvpoWDppxCiwmrk9CEioGThZN0D; "
    "_ga_JBQ8V6N36N=GS2.1.s1790142619$o12$g1$t1790143933$j59$l0$h0"
)

session = requests.Session()
session.headers.update({
    "accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "accept-language": "ko,en;q=0.9",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/153.0.0.0 Safari/537.36"
    ),
    "cookie": COOKIE_STRING,
})

# 404 실패 카드 전체 명단 (총 38명)
TARGET_PLAYERS = [
    # 이전 실패 33명
    221697,
    231521,
    241721,
    266933,
    237646,
    165153,
    206517,
    236610,
    261188,
    229391,
    241852,
    240950,
    256675,
    216460,
    255069,
    210413,
    212523,
    228383,
    265856,
    245630,
    251566,
    232411,
    208461,
    242434,
    243630,
    253469,
    270409,
    254022,
    228789,
    272500,
    235840,
    230666,
    255125,
    # 이번 스크린샷 추가 5명
    224158,
    259197,
    262659,
    264697,
    259868,
]


def get_futgg_club_info(base_id: int):
  """FUT.GG 페이지에서 인게임 실제 카드 소속 구단명을 크롤링"""
  new_id = base_id + 50331648

  # 1. API 엔드포인트 호출 시도
  api_url = f"https://www.fut.gg/api/fut/player-items/27-{new_id}/"
  try:
    res = session.get(api_url, timeout=7)
    if res.status_code == 200:
      data = res.json().get("data", {})
      pdef = data.get("playerDef", data)
      name = (
          pdef.get("commonName")
          or f"{pdef.get('firstName', '')} {pdef.get('lastName', '')}".strip()
      )
      club_name = pdef.get("club", {}).get("name")
      if club_name:
        return name, club_name, new_id
  except Exception:
    pass

  # 2. 웹 페이지 HTML 내 __NEXT_DATA__ 파싱 시도 (Fallback)
  web_url = f"https://www.fut.gg/players/{new_id}/"
  try:
    res = session.get(web_url, timeout=7)
    if res.status_code == 200:
      match = re.search(
          r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
          res.text,
      )
      if match:
        page_data = json.loads(match.group(1))
        player_data = page_data.get("props", {}).get("pageProps", {})
        item = player_data.get("playerItem", {}).get("playerDef", {})
        name = (
            item.get("commonName")
            or f"{item.get('firstName', '')} {item.get('lastName', '')}".strip()
        )
        club_name = item.get("club", {}).get("name")
        if club_name:
          return name, club_name, new_id
  except Exception:
    pass

  return None, None, new_id


def main():
  print("==========================================================")
  print(f"총 {len(TARGET_PLAYERS)}명 카드의 FUT.GG 인게임 실제 소속 구단 확인 시작")
  print("==========================================================\n")

  results = []
  for idx, base_id in enumerate(TARGET_PLAYERS, start=1):
    name, club, new_id = get_futgg_club_info(base_id)
    if club:
      print(
          f"[{idx:2d}/{len(TARGET_PLAYERS)}] 원본 ID: {base_id} -> 새 ID:"
          f" {new_id} | 선수명: {name} | 실제 구단: {club}"
      )
      results.append({
          "base_id": base_id,
          "new_id": new_id,
          "name": name,
          "club": club,
      })
    else:
      print(
          f"[{idx:2d}/{len(TARGET_PLAYERS)}] 원본 ID: {base_id} -> 새 ID:"
          f" {new_id} | 구단 정보 조회 대기 (쿨다운 확인 필요)"
      )

    time.sleep(2.0)

  print("\n==========================================================")
  print("확인 완료. 결과를 바탕으로 정확한 club_id를 매핑합니다.")
  print("==========================================================")


if __name__ == "__main__":
  main()