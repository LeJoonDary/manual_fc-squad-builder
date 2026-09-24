import json
import re
from curl_cffi import requests

session = requests.Session(impersonate="chrome124")
session.headers.update({
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Referer": "https://www.fut.gg/players/?quality_id=%5B10%5D",
})

url = "https://www.fut.gg/players/153079-sergio-aguero/27-153079/"
res = session.get(url, timeout=15)
text = res.text

print("=" * 65)
print(f"HTML 내 playerDef 등장 횟수: {text.count('playerDef')}회")
print("=" * 65)

# 1. 실제 HTML 안에서 playerDef 주변 150글자 구조 확인
for i, m in enumerate(re.finditer(r"playerDef", text), start=1):
  start = max(0, m.start() - 30)
  end = min(len(text), m.end() + 120)
  print(f"\n[#{i}번째 playerDef 주변 문자열]")
  print(repr(text[start:end]))

# 2. Next.js App Router RSC 청크 파서 테스트
print("\n" + "=" * 65)
print("   RSC 청크 추출 테스트")
print("=" * 65)

extracted = None
for m in re.finditer(r'\.push\(\[\d+,\s*"(.*?)"\]\)', text, re.DOTALL):
  chunk = m.group(1)
  if "playerDef" in chunk:
    try:
      unescaped = json.loads(f'"{chunk}"')
    except Exception:
      unescaped = chunk.replace(r"\"", '"').replace(r"\\", "\\")

    p_idx = unescaped.find('"playerDef"')
    if p_idx != -1:
      b_start = unescaped.find("{", p_idx)
      if b_start != -1:
        cnt = 0
        b_end = b_start
        for idx in range(b_start, len(unescaped)):
          if unescaped[idx] == "{":
            cnt += 1
          elif unescaped[idx] == "}":
            cnt -= 1
            if cnt == 0:
              b_end = idx + 1
              break
        try:
          extracted = json.loads(unescaped[b_start:b_end])
          break
        except Exception:
          pass

if extracted:
  name = extracted.get("commonName") or extracted.get("firstName")
  ovr = extracted.get("overall")
  acc = extracted.get("attributeAcceleration")
  print(f"-> [추출 대성공!] 선수명: {name}, OVR: {ovr}, 가속 스탯: {acc}")
else:
  print("-> [알림] 청크 패턴 추가 보완 필요")
print("=" * 65)