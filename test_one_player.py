import re
from bs4 import BeautifulSoup
import requests

headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

url = "https://www.fut.gg/players/227102-caroline-graham-hansen/27-227102/"
print(f"▶ 접속 시도: {url}")

resp = requests.get(url, headers=headers, timeout=12)
print(f"✔ 응답 상태: {resp.status_code}")

# HTML 태그를 모두 벗겨내고 순수 텍스트만 추출
soup = BeautifulSoup(resp.text, "html.parser")
clean_text = soup.get_text(separator=" ", strip=True)

# 순수 텍스트 내에서 체형 정밀 탐색
m = re.search(
    r"Body\s*Type\s*[:]?\s*(Lean Short|Lean Medium|Lean Tall|Average"
    r" Short|Average Medium|Average Tall|Stocky Short|Stocky Medium|Stocky"
    r" Tall|Unique)",
    clean_text,
    re.IGNORECASE,
)

if m:
  print(f"🎉 추출 성공: Caroline Graham Hansen ➔ {m.group(1).title()}")
else:
  # 주변 텍스트 덤프 (확인용)
  idx = clean_text.find("Body Type")
  print("결과: 미발견")
  if idx != -1:
    print("주변 텍스트:", repr(clean_text[idx : idx + 80]))