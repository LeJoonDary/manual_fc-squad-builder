from bs4 import BeautifulSoup
from curl_cffi import requests

session = requests.Session(impersonate="chrome124")

# [1단계] 44장이 검증된 2페이지를 먼저 호출하여 세션과 쿠키를 확보
print("--- [1] 2페이지 먼저 호출 (세션 활성화) ---")
res2 = session.get(
    "https://www.fut.gg/players/?quality_id=%5B10%5D&page=2", timeout=15
)
soup2 = BeautifulSoup(res2.text, "html.parser")
cards2 = [
    a["href"]
    for a in soup2.find_all("a", href=True)
    if "/players/" in a["href"] and any(c.isdigit() for c in a["href"])
]
print(
    f"2페이지 결과: 상태 {res2.status_code}, 최종URL: {res2.url}, 길이"
    f" {len(res2.text):,} bytes, 발견: {len(cards2)}장"
)
print("2페이지 앞 3명 카드 샘플:", cards2[:3])

# [2단계] 2페이지 쿠키를 보유한 세션으로 1페이지 재요청
print("\n--- [2] 2페이지 세션 유지 상태에서 1페이지 재호출 ---")
p1_tests = [
    (
        "1페이지 (기본 주소)",
        "https://www.fut.gg/players/?quality_id=%5B10%5D",
    ),
    (
        "1페이지 (&page=1)",
        "https://www.fut.gg/players/?quality_id=%5B10%5D&page=1",
    ),
]

for name, u in p1_tests:
  res = session.get(u, timeout=15)
  soup = BeautifulSoup(res.text, "html.parser")
  cards = [
      a["href"]
      for a in soup.find_all("a", href=True)
      if "/players/" in a["href"] and any(c.isdigit() for c in a["href"])
  ]
  has_ronaldo = any(p in res.text for p in ["Ronaldo", "Pelé", "Pele", "Zidane"])

  print(f"\n[{name}]")
  print(f"  - 리다이렉트 이력: {res.history} -> 최종 도착 URL: {res.url}")
  print(
      f"  - 응답 길이: {len(res.text):,} bytes | 레전드(호나우두 등) 포함:"
      f" {has_ronaldo}"
  )
  print(f"  - 발견 카드: {len(cards)}장")
  if len(cards) > 0 and len(cards) < 5:
    print(f"  - 1장 잡힌 카드의 실제 주소: {cards}")