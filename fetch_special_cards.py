import json
import os
import random
import re
import time
from bs4 import BeautifulSoup
from curl_cffi import requests

BASE_URL = "https://www.fut.gg"
OUTPUT_FILE = "special_cards.json"
PAGE1_FILE = "page1.json"
TOTAL_PAGES = 12

session = requests.Session(impersonate="chrome124")
session.headers.update({
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.fut.gg/players/?quality_id=%5B10%5D",
})


def safe_load_page1():
  """page1.json에서 1페이지 30명 링크 추출"""
  if not os.path.exists(PAGE1_FILE):
    return []
  try:
    with open(PAGE1_FILE, "r", encoding="utf-8") as f:
      content = f.read()
    links = re.findall(r'["\'](/players/\d+-[^"\'\s<>]+)[\'"]', content)
    cleaned = []
    for l in links:
      c = l.split("?")[0].strip()
      if not c.endswith("/"):
        c += "/"
      if c not in cleaned and "/compare" not in c and "/26/" not in c:
        cleaned.append(c)
    return cleaned
  except Exception as e:
    print(f"[경고] {PAGE1_FILE} 읽기 오류: {e}")
    return []


def classify_card(pdef):
  """카드의 실제 등급 이름을 분석하여 card_type과 version 결정"""
  rarity = pdef.get("rarity") or {}
  r_name = (rarity.get("name") or "").strip()
  r_slug = (rarity.get("slug") or "").lower().strip()

  league_ea_id = pdef.get("leagueEaId")
  is_hero = pdef.get("isHero", False)
  is_sbc = pdef.get("isSbcItem", False)
  club = pdef.get("club") or {}
  is_icon_club = club.get("isIconClub", False)

  # 아이콘 & 히어로 베이스 버전 네이밍 반영
  if (
      league_ea_id == 2118
      or is_icon_club
      or "icon" in r_slug
      or "icon" in r_name.lower()
  ):
    card_type = "ICON"
    version = "special_base_icon"
  elif is_hero or "hero" in r_slug or "hero" in r_name.lower():
    card_type = "HERO"
    version = "special_base_hero"
  elif is_sbc or "sbc" in r_slug or "sbc" in r_name.lower():
    card_type = "SPECIAL"
    version = "special_sbc"
  elif "totw" in r_slug or "team of the week" in r_name.lower():
    card_type = "SPECIAL"
    version = "special_totw"
  else:
    card_type = "SPECIAL"
    clean_slug = r_slug.replace("-", "_") if r_slug else "promo"
    version = f"special_{clean_slug}"

  return {
      "card_type": card_type,
      "version": version,
      "rarity_name": r_name or "Special",
      "rarity_slug": r_slug or "special",
  }


def extract_player_def(html):
  """FUT.GG 상세 페이지에서 playerDef 데이터 자동 해독 및 추출"""
  p_idx = html.find("playerDef")
  if p_idx == -1:
    return None

  brace_start = html.find("{", p_idx)
  if brace_start == -1 or brace_start - p_idx > 60:
    return None

  count = 0
  in_str = False
  quote_char = ""
  escape = False
  brace_end = brace_start
  n = len(html)

  for i in range(brace_start, n):
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
  if not raw_obj.startswith("{") or not raw_obj.endswith("}"):
    return None

  # 특수 기호 및 압축 불리언 치환
  cleaned = re.sub(r"\$R\[\d+\]\s*=\s*", "", raw_obj)
  cleaned = re.sub(r":\s*(\$R\[\d+\])", r':"\1"', cleaned)
  cleaned = re.sub(r"(?<=[,:\[])\s*!\s*0\b", "true", cleaned)
  cleaned = re.sub(r"(?<=[,:\[])\s*!\s*1\b", "false", cleaned)
  cleaned = re.sub(r"\bvoid\s+0\b", "null", cleaned)
  cleaned = re.sub(r"\bundefined\b", "null", cleaned)
  cleaned = re.sub(r"\bNaN\b", "null", cleaned)

  try:
    data = json.loads(cleaned)
    if isinstance(data, dict):
      return data
  except Exception:
    pass

  try:
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
    data = json.loads(json_ready)
    if isinstance(data, dict):
      return data
  except Exception:
    pass

  return None


def get_all_special_player_urls():
  """1페이지(30명) + 2~12페이지 전체 링크 결합"""
  all_urls = []

  print("=" * 65)
  print("   [1단계] Special 카드 전체 목록 수집 (총 12페이지)")
  print("=" * 65)

  p1_urls = safe_load_page1()
  if p1_urls:
    all_urls.extend(p1_urls)
    print(
        f"[1/12페이지] page1.json에서 {len(p1_urls)}장 로드 완료 (호나우두,"
        f" 펠레 등 포함)"
    )
  else:
    print("[1/12페이지] page1.json이 비어있어 2페이지부터 수집합니다.")

  for page in range(2, TOTAL_PAGES + 1):
    url = f"{BASE_URL}/players/?quality_id=%5B10%5D&page={page}"
    try:
      res = session.get(url, timeout=15)
      if res.status_code != 200:
        continue

      soup = BeautifulSoup(res.text, "html.parser")
      page_urls = []

      for a in soup.find_all("a", href=True):
        href = a["href"].split("?")[0].strip()
        if (
            href.startswith("/players/")
            and any(c.isdigit() for c in href)
            and "/compare" not in href
            and "/26/" not in href
        ):
          if not href.endswith("/"):
            href += "/"
          if href not in all_urls and href not in page_urls:
            page_urls.append(href)

      all_urls.extend(page_urls)
      print(
          f"[{page}/{TOTAL_PAGES}페이지] 수집 완료: {len(page_urls)}장 발견"
          f" (누적: {len(all_urls)}장)"
      )

      time.sleep(random.uniform(2.0, 3.2))

    except Exception as e:
      print(f"[{page}페이지] 오류: {e}")

  return all_urls


def main():
  total_urls = get_all_special_player_urls()
  total_count = len(total_urls)
  print(f"\n총 {total_count}장의 Special 카드 목록 확보 완료!")

  if total_count == 0:
    print("[오류] 수집 대상 카드가 없습니다.")
    return

  print("\n" + "=" * 65)
  print("   [2단계] 카드별 상세 스탯 및 등급 정보 수집 시작")
  print("=" * 65)

  collected_cards = []
  collected_urls = set()

  # 기존 수집 파일 이어받기
  if os.path.exists(OUTPUT_FILE):
    try:
      with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        collected_cards = json.load(f)
        for c in collected_cards:
          if "url" in c:
            collected_urls.add(c["url"])
      print(
          f"[이어받기] 기존에 저장된 {len(collected_cards)}장 감지. 이어서"
          " 수집합니다.\n"
      )
    except Exception:
      collected_cards = []

  for idx, p_url in enumerate(total_urls, start=1):
    if p_url in collected_urls:
      continue

    full_url = f"{BASE_URL}{p_url}"
    try:
      res = session.get(full_url, timeout=15)
      pdef = extract_player_def(res.text) if res.status_code == 200 else None

      if pdef:
        meta = classify_card(pdef)
        pdef["card_type"] = meta["card_type"]
        pdef["version"] = meta["version"]
        pdef["rarity_name"] = meta["rarity_name"]
        pdef["rarity_slug"] = meta["rarity_slug"]
        pdef["url"] = p_url

        name = (
            pdef.get("commonName")
            or f"{pdef.get('firstName', '')} {pdef.get('lastName', '')}".strip()
        )
        ovr = pdef.get("overall")

        print(
            f"[{idx}/{total_count}] {name} (OVR: {ovr}) -> 타입:"
            f" {meta['card_type']}, 버전: {meta['version']}, 등급:"
            f" {meta['rarity_name']}"
        )
        collected_cards.append(pdef)
        collected_urls.add(p_url)

        # 1장마다 실시간 안전 저장
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
          json.dump(collected_cards, f, ensure_ascii=False, indent=2)

      else:
        print(f"[{idx}/{total_count}] 데이터 누락 ({p_url})")

    except Exception as e:
      print(f"[{idx}/{total_count}] 오류 발생 ({p_url}): {e}")

    time.sleep(random.uniform(2.5, 3.8))

    if idx % 50 == 0:
      rest_time = random.uniform(8.0, 12.0)
      print(
          f"\n[안전 대기] 50명 수집 완료. 서버 휴식 중 ({rest_time:.1f}초)..."
      )
      time.sleep(rest_time)

  print("\n" + "=" * 65)
  print(
      f"   전체 수집 완료! 총 {len(collected_cards)}장이 '{OUTPUT_FILE}'에"
      " 저장되었습니다."
  )
  print("=" * 65)


if __name__ == "__main__":
  main()