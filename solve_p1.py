import re
from bs4 import BeautifulSoup
from curl_cffi import requests

session = requests.Session(impersonate="chrome124")

# 1페이지를 강제로 SSR(324KB)하게 만드는 후보 URL 및 헤더
tests = [
    # 1. 58KB 껍데기 내부의 스크립트 안에 이미 링크가 들어있는지 검사
    (
        "기본 1페이지 (스크립트/JSON 정규식 추출)",
        "https://www.fut.gg/players/?quality_id=%5B10%5D",
        {},
    ),
    # 2. 정렬 파라미터를 붙여 동적 렌더링 강제 (overall 순)
    (
        "정렬 추가 (sort=overall)",
        "https://www.fut.gg/players/?quality_id=%5B10%5D&sort=overall",
        {},
    ),
    # 3. Next.js 서버 컴포넌트(RSC) 헤더 요청
    (
        "Next.js RSC 헤더 요청",
        "https://www.fut.gg/players/?quality_id=%5B10%5D",
        {"RSC": "1"},
    ),
    # 4. 캐시 무효화 파라미터 추가
    (
        "캐시 우회 파라미터 (_rsc)",
        "https://www.fut.gg/players/?quality_id=%5B10%5D&_rsc=1",
        {},
    ),
]

print("=" * 65)
print("   1페이지 선수 30명 추출 경로 탐색")
print("=" * 65)

for name, url, headers in tests:
  try:
    res = session.get(url, headers=headers, timeout=15)
    text = res.text

    # 호나우두, 펠레, 지단이 텍스트에 들어있는지 확인
    has_legends = any(
        legend in text for legend in ["Ronaldo", "Pelé", "Pele", "Zidane"]
    )

    # <a> 태그 탐색
    soup = BeautifulSoup(text, "html.parser")
    a_cards = [
        a["href"]
        for a in soup.find_all("a", href=True)
        if "/players/" in a["href"] and any(c.isdigit() for c in a["href"])
    ]

    # 정규식으로 텍스트/스크립트 내 /players/... 링크 전체 탐색
    raw_cards = list(
        set(re.findall(r"/players/\d+-[a-zA-Z0-9\-]+(?:/\d+-[a-zA-Z0-9\-]+)?/?", text))
    )

    print(f"\n[{name}]")
    print(
        f"  - 응답 길이: {len(text):,} bytes | 레전드(호나우두 등) 포함 여부:"
        f" {has_legends}"
    )
    print(f"  - <a> 태그 카드: {len(a_cards)}장 | 본문 전체 링크: {len(raw_cards)}장")

    if len(raw_cards) >= 25 or len(a_cards) >= 25:
      print("  >>> 성공! 유효한 링크 샘플 3개:")
      sample = (a_cards if len(a_cards) >= 25 else raw_cards)[:3]
      for s in sample:
        print(f"      {s}")
      break

  except Exception as e:
    print(f"[{name}] 오류: {e}")