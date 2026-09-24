from bs4 import BeautifulSoup
from curl_cffi import requests

session = requests.Session(impersonate="chrome124")

urls = [
    ("URL 1 (&page=1)", "https://www.fut.gg/players/?quality_id=%5B10%5D&page=1"),
    ("URL 2 (no page)", "https://www.fut.gg/players/?quality_id=%5B10%5D"),
    (
        "URL 3 (page=1 앞)",
        "https://www.fut.gg/players/?page=1&quality_id=%5B10%5D",
    ),
    (
        "URL 4 (원형 괄호)",
        "https://www.fut.gg/players/?quality_id=[10]&page=1",
    ),
    ("URL 5 (원형 no page)", "https://www.fut.gg/players/?quality_id=[10]"),
    ("URL 6 (검증용 2페이지)", "https://www.fut.gg/players/?quality_id=%5B10%5D&page=2"),
]

print("=" * 65)
print("   1페이지 URL 응답 및 링크 진단")
print("=" * 65)

for name, u in urls:
  try:
    res = session.get(u, timeout=15)
    soup = BeautifulSoup(res.text, "html.parser")
    cards = [
        a["href"]
        for a in soup.find_all("a", href=True)
        if "/players/" in a["href"] and any(c.isdigit() for c in a["href"])
    ]
    print(
        f"[{name}] 상태: {res.status_code}, 길이: {len(res.text)}, 발견 카드:"
        f" {len(cards)}장"
    )

    # 2페이지가 정상 작동하므로, 2페이지 안의 1페이지 페이지네이션 링크 추출
    if "page=2" in u:
      pagi = [
          (a.text.strip(), a["href"])
          for a in soup.find_all("a", href=True)
          if "quality" in a["href"] or "page" in a["href"]
      ]
      print("\n[2페이지 내부의 페이지 이동 링크]")
      for text, href in pagi[:5]:
        print(f"  버튼 '{text}' -> 링크: {href}")

  except Exception as e:
    print(f"[{name}] 오류: {e}")