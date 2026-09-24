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

url = "https://www.fut.gg/players/37576-ronaldo/27-37576/"
res = session.get(url, timeout=15)
html = res.text

print("=" * 65)
print(f"호나우두 페이지 응답 상태: {res.status_code} (크기: {len(html):,} 글자)")
print("=" * 65)

matches = [m.start() for m in re.finditer(r"playerDef", html)]

for idx, p_idx in enumerate(matches, 1):
  brace_start = html.find("{", p_idx)
  diff = brace_start - p_idx if brace_start != -1 else -1

  if brace_start == -1 or diff > 60:
    continue

  count = 0
  in_str = False
  quote_char = ""
  escape = False
  brace_end = brace_start

  for i in range(brace_start, len(html)):
    c = html[i]
    if in_str:
      if escape:
        escape = False
      elif c == "\\":
        escape = True
      elif c == quote_char:
        in_str = False
    else:
      if c in ('"', "'"):
        in_str = True
        quote_char = c
      elif c == "{":
        count += 1
      elif c == "}":
        count -= 1
        if count == 0:
          brace_end = i + 1
          break

  raw_obj = html[brace_start:brace_end]

  # 1. 특수 기호 정리
  cleaned = re.sub(r"\$R\[\d+\]\s*=\s*", "", raw_obj)
  cleaned = re.sub(r":\s*(\$R\[\d+\])", r':"\1"', cleaned)

  # [핵심 추가] !0 -> true, !1 -> false 변환
  cleaned = re.sub(r"(?<=[,:\[])\s*!\s*0\b", "true", cleaned)
  cleaned = re.sub(r"(?<=[,:\[])\s*!\s*1\b", "false", cleaned)
  cleaned = re.sub(r"\bvoid\s+0\b", "null", cleaned)
  cleaned = re.sub(r"\bundefined\b", "null", cleaned)
  cleaned = re.sub(r"\bNaN\b", "null", cleaned)

  # 2. 키 따옴표 자동 보정
  result = []
  i = 0
  L = len(cleaned)
  while i < L:
    c = cleaned[i]
    if c in ('"', "'"):
      q = c
      start = i
      i += 1
      esc = False
      while i < L:
        if esc:
          esc = False
        elif cleaned[i] == "\\":
          esc = True
        elif cleaned[i] == q:
          i += 1
          break
        i += 1
      s_val = cleaned[start:i]
      if q == "'":
        inner = s_val[1:-1].replace('"', '\\"')
        s_val = f'"{inner}"'
      result.append(s_val)
    elif c in ("{", ","):
      result.append(c)
      i += 1
      ws_start = i
      while i < L and cleaned[i] in " \t\r\n":
        i += 1
      result.append(cleaned[ws_start:i])
      id_start = i
      while i < L and (cleaned[i].isalnum() or cleaned[i] in "_$"):
        i += 1
      ident = cleaned[id_start:i]
      ws2_start = i
      while i < L and cleaned[i] in " \t\r\n":
        i += 1
      if ident and i < L and cleaned[i] == ":":
        result.append(f'"{ident}"')
        result.append(cleaned[ws2_start:i])
        result.append(":")
        i += 1
      else:
        i = id_start
    else:
      result.append(c)
      i += 1

  json_ready = "".join(result)
  json_ready = re.sub(r",\s*([}\]])", r"\1", json_ready)

  try:
    data = json.loads(json_ready)
    print("-> [성공!] 호나우두 파싱 완벽 성공!")
    print(
        f"   선수명: {data.get('commonName') or data.get('firstName')}, OVR:"
        f" {data.get('overall')}"
    )
    print(
        f"   가속(Acceleration): {data.get('attributeAcceleration')},"
        f" 질주(SprintSpeed): {data.get('attributeSprintSpeed')}"
    )
    print(f"   등급 정보: {data.get('rarity')}")
    break
  except Exception as e:
    print(f"-> [실패] 에러 내용: {e}")