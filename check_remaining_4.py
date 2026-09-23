import json
import os
from pathlib import Path
import time
import requests
from dotenv import load_dotenv

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
    "accept": "application/json",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/153.0.0.0 Safari/537.36"
    ),
    "cookie": COOKIE_STRING,
})

FOUR_PLAYERS = [
    (165153, 50496801, "Benzema"),
    (210413, 50542061, "Romagnoli"),
    (212523, 50544171, "Talisca"),
    (242434, 50574082, "Curtis Jones"),
]

print("=== 남은 4명 정밀 진단 시작 ===\n")

for base_id, new_id, name in FOUR_PLAYERS:
  print(f"[{name}] (기본 ID: {base_id}, 새 ID: {new_id})")

  # 1. 새 ID 응답 코드 확인
  r_new = session.get(
      f"https://www.fut.gg/api/fut/player-items/27-{new_id}/", timeout=5
  )
  print(f"  - 새 ID(27-{new_id}) 응답: HTTP {r_new.status_code}")

  # 2. 기본 ID 응답 코드 확인
  r_base = session.get(
      f"https://www.fut.gg/api/fut/player-items/27-{base_id}/", timeout=5
  )
  print(f"  - 기본 ID(27-{base_id}) 응답: HTTP {r_base.status_code}")
  if r_base.status_code == 200:
    club = (
        r_base.json().get("data", {}).get("club", {}).get("name", "구단명 없음")
    )
    print(f"    ==> 기본 ID로 찾음! 소속 구단: {club}")

  # 3. FUT.GG 검색 API 질의
  r_search = session.get(
      f"https://www.fut.gg/api/fut/player-search/?query={name}", timeout=5
  )
  if r_search.status_code == 200:
    items = r_search.json().get("data", [])
    if items:
      first = items[0]
      print(
          f"    ==> 검색 결과: {first.get('name')} | EA ID:"
          f" {first.get('eaId')} | 구단: {first.get('clubName')}"
      )

  print("-" * 50)
  time.sleep(1.5)