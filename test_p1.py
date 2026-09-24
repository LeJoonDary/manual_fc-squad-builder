from bs4 import BeautifulSoup
from curl_cffi import requests

session = requests.Session(impersonate="chrome124")

urls = [
    (
        "트릭 1 (page=01)",
        "https://www.fut.gg/players/?page=01&quality_id=%5B10%5D",
    ),
    (
        "트릭 2 (page=0)",
        "https://www.fut.gg/players/?page=0&quality_id=%5B10%5D",
    ),
    (
        "트릭 3 (page=1.0)",
        "https://www.fut.gg/players/?page=1.0&quality_id=%5B10%5D",
    ),
]

print("=" * 65)
print("   1페이지 CDN 캐시 우회 테스트")
print("=" * 65)

for name, u in urls:
  res = session.get(u, timeout=15)
  soup = BeautifulSoup(res.text, "html.parser")
  cards = [
      a["href"]
      for a in soup.find_all("a", href=True)
      if "/players/" in a["href"] and any(c.isdigit() for c in a["href"])
  ]
  has_ronaldo = "Ronaldo" in res.text or "ronaldo" in res.text
  print(
      f"[{name}] 길이: {len(res.text):,} bytes | 발견 카드: {len(cards)}장 |"
      f" 호나우두 포함: {has_ronaldo}"
  )