import re
from curl_cffi import requests

session = requests.Session(impersonate="chrome124")
session.headers.update({
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.fut.gg/players/?quality_id=%5B10%5D",
})

# 1번 카드(아구에로) 주소로 직접 요청
url = "https://www.fut.gg/players/153079-sergio-aguero/27-153079/"
res = session.get(url, timeout=15)

print("=" * 60)
print(f"상태 코드: {res.status_code}")
print(f"HTML 크기: {len(res.text):,} 글자")
print(f"최종 도착 URL: {res.url}")

# 핵심 키워드 포함 여부 확인
text = res.text
print(f"- 'playerDef' 포함: {'playerDef' in text}")
print(f"- 'playerItem' 포함: {'playerItem' in text}")
print(f"- 'Aguero' 포함: {'Aguero' in text or 'Agüero' in text}")
print(f"- '__NEXT_DATA__' 포함: {'__NEXT_DATA__' in text}")

# 스크립트 태그 내 JSON 데이터 탐색
scripts = re.findall(r'<script[^>]*>(.*?)</script>', text, re.DOTALL)
print(f"전체 script 태그 수: {len(scripts)}개")

for idx, s in enumerate(scripts):
  if any(
      k in s
      for k in [
          "overall",
          "attributeAcceleration",
          "facePace",
          "Aguero",
          "Agüero",
      ]
  ):
    print(f"\n[데이터 발견! Script #{idx}] (길이: {len(s):,} 글자)")
    print("미리보기 (앞 250자):")
    print(s[:250].strip())
    break
print("=" * 60)