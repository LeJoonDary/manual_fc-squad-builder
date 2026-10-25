import os
import sys
import re
import json
import time
import random
import unicodedata
import argparse
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
)

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("[오류] Supabase 환경 변수(URL, KEY)를 확인하세요.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
BASE_URL = "https://www.fut.gg"
PROGRESS_FILE = "progress_80plus.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.fut.gg/",
}

def load_progress() -> set:
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                return set(json.load(f))
        except Exception:
            return set()
    return set()

def save_progress(completed_ids: set):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(list(completed_ids), f, indent=2)

def slugify(text: str) -> str:
    if not text:
        return "player"
    normalized = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('utf-8')
    slug = re.sub(r'[^a-zA-Z0-9]+', '-', normalized).strip('-').lower()
    return slug or "player"

def extract_player_def(html_text: str, card_api_id: int):
    for match in re.finditer(r"\bplayerDef\s*:\s*(?:\$R\[\d+\]\s*=\s*)?\{", html_text):
        depth, quote, escaped = 1, None, False
        begin = match.end()
        fields = {}
        for idx in range(begin, len(html_text)):
            ch = html_text[idx]
            if quote:
                if escaped: escaped = False
                elif ch == "\\": escaped = True
                elif ch == quote: quote = None
                continue
            if ch in ('"', "'"): quote = ch
            elif ch in "{[": depth += 1
            elif ch in "}]": depth -= 1
            if (ch == "," and depth == 1) or depth == 0:
                key, sep, val = html_text[begin:idx].partition(":")
                if sep:
                    val = re.sub(r"^\s*\$R\[\d+\]\s*=\s*", "", val).strip()
                    try:
                        fields[key.strip().strip('"\'')] = json.loads(val)
                    except Exception:
                        pass
                begin = idx + 1
            if depth == 0: break
        if str(fields.get("eaId")) == str(card_api_id):
            return fields
    return None

def fetch_card_profile(player_id: int, card_api_id: int, player_name: str):
    slug = slugify(player_name)
    direct_url = f"{BASE_URL}/players/{player_id}-{slug}/27-{card_api_id}/"
    resp = requests.get(direct_url, headers=HEADERS, timeout=12)

    if resp.status_code in (403, 429):
        print(f"  🚨 [차단 경고] FUT.GG에서 HTTP {resp.status_code} 응답이 반환되었습니다!")
        return None

    if resp.status_code != 200:
        search_url = f"{BASE_URL}/players/?name={requests.utils.quote(player_name)}"
        s_resp = requests.get(search_url, headers=HEADERS, timeout=12)
        if s_resp.status_code == 200:
            soup = BeautifulSoup(s_resp.text, "html.parser")
            card_link = None
            for a in soup.find_all("a", href=True):
                if f"27-{card_api_id}" in a["href"]:
                    card_link = a["href"]
                    break
            if card_link:
                full_url = card_link if card_link.startswith("http") else f"{BASE_URL}{card_link}"
                resp = requests.get(full_url, headers=HEADERS, timeout=12)

    if resp.status_code != 200:
        return None

    html_text = resp.text
    soup = BeautifulSoup(html_text, "html.parser")
    p_def = extract_player_def(html_text, card_api_id) or {}

    # 1. 키 (Height)
    height = p_def.get("height")
    if not height:
        m_h = re.search(r"Height\s*[:\n]?\s*(\d{2,3})\s*cm", html_text, re.I)
        if m_h: height = int(m_h.group(1))

    # 2. 몸무게 (Weight)
    weight = p_def.get("weight")
    if not weight:
        m_w = re.search(r"Weight\s*[:\n]?\s*(\d{2,3})\s*kg", html_text, re.I)
        if m_w: weight = int(m_w.group(1))

    # 3. 바디타입 (Body Type)
    body_type = None
    info_section = ""
    for el in soup.find_all(["div", "section"]):
        if "Player Information" in el.get_text():
            info_section = el.get_text(separator="\n", strip=True)
            break

    if info_section:
        m_b = re.search(r"Body\s*Type\s*\n+([^\n;]+)", info_section, re.I)
        if m_b: body_type = m_b.group(1).strip()

    if not body_type:
        m_b2 = re.search(r"Body\s*Type\s*[:\s]+([A-Za-z0-9\s&+-]+?)(?=(?:Real\s*Face|Age|Player\s*ID|Item\s*ID|\n|<|$))", html_text, re.I)
        if m_b2: body_type = m_b2.group(1).strip()

    # 4. ★ 엑셀타입 (AcceleRATE) 정밀 파싱
    clean_full = soup.get_text(separator=" ", strip=True)
    m_acc = re.search(
        r"AcceleRATE(?:\s*2\.0)?\s*[:\n\s\-]*(Mostly\s+Explosive|Controlled\s+Explosive|Explosive|Mostly\s+Lengthy|Controlled\s+Lengthy|Lengthy|Controlled)",
        clean_full,
        re.IGNORECASE
    )
    if not m_acc:
        m_acc = re.search(
            r"AcceleRATE(?:\s*2\.0)?\s*[:\n\s\-]*(Mostly\s+Explosive|Controlled\s+Explosive|Explosive|Mostly\s+Lengthy|Controlled\s+Lengthy|Lengthy|Controlled)",
            html_text,
            re.IGNORECASE
        )
    accele_type = " ".join(w.capitalize() for w in m_acc.group(1).split()) if m_acc else "Controlled"

    return {
        "height": int(height) if height else None,
        "weight": int(weight) if weight else None,
        "body_type": body_type,
        "accele_type": accele_type
    }

def fetch_all_80plus_cards():
    all_cards = []
    page_size = 1000
    start = 0

    while True:
        res = (
            supabase.table("card_versions")
            .select("id, player_id, version, overall, api_id, body_type, accele_type")
            .gte("overall", 80)
            .order("overall", desc=True)
            .order("id", desc=False)
            .range(start, start + page_size - 1)
            .execute()
        )
        data = res.data or []
        all_cards.extend(data)
        if len(data) < page_size:
            break
        start += page_size

    return all_cards

def run_batch(limit=500, reset=False):
    if reset and os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)
        print("🔄 [리셋] 기존 진행 내역을 초기화했습니다. 처음부터 다시 시작합니다.")

    completed_ids = load_progress()
    print("=" * 70)
    print("🚀 [MetaXI] 80+ 골드 & 스페셜 전체 키·몸무게·바디타입·엑셀타입 스크래핑")
    print(f"📊 이전에 완료된 카드 수: {len(completed_ids)}개")
    print(f"⚡ 이번 배치 처리 한도: {limit}명 (요청 간격: 3.5~5.0초 랜덤)")
    print("=" * 70)

    print("🔍 Supabase에서 80+ 카드 전체 목록을 로드하는 중...")
    all_cards = fetch_all_80plus_cards()
    
    pending_cards = [c for c in all_cards if c["id"] not in completed_ids]

    print(f"📋 DB 전체 80+ 카드(골드+스페셜): {len(all_cards)}개")
    print(f"⏳ 남은 미처리 대상 카드: {len(pending_cards)}개")

    if not pending_cards:
        print("🎉 모든 80+ 카드의 동기화가 이미 완료되었습니다!")
        return

    target_batch = pending_cards[:limit]
    print(f"🎯 이번 회차 실행: {len(target_batch)}명 작업 시작\n")

    success_cnt = 0
    fail_cnt = 0

    for idx, card in enumerate(target_batch, start=1):
        c_id = card["id"]
        p_id = card["player_id"]
        api_id = card.get("api_id")
        ovr = card.get("overall")
        ver = card.get("version")

        p_res = supabase.table("players").select("name, height, weight").eq("id", p_id).execute()
        player_name = p_res.data[0]["name"] if (p_res.data and p_res.data[0].get("name")) else f"Player_{p_id}"
        curr_h = p_res.data[0].get("height") if p_res.data else None
        curr_w = p_res.data[0].get("weight") if p_res.data else None
        curr_bt = card.get("body_type")
        curr_acc = card.get("accele_type")

        print(f"[{idx}/{len(target_batch)}] ({ovr} OVR | {ver}) {player_name} [card_id: {c_id}, api_id: {api_id}]")

        if not api_id:
            print("  ⚠️ api_id 부재로 스킵")
            fail_cnt += 1
            completed_ids.add(c_id)
            save_progress(completed_ids)
            continue

        try:
            profile = fetch_card_profile(p_id, api_id, player_name)
            if not profile:
                print("  ❌ 프로필 파싱 실패")
                fail_cnt += 1
                if idx < len(target_batch):
                    delay = random.uniform(3.5, 5.0)
                    print(f"  ⏳ 봇 차단 방지 대기 중: {delay:.2f}초...")
                    time.sleep(delay)
                continue

            h = profile["height"] or curr_h
            w = profile["weight"] or curr_w
            bt = profile["body_type"] or curr_bt
            acc = profile["accele_type"] or curr_acc

            # 1) players 테이블 키/몸무게 갱신
            p_update = {}
            if h: p_update["height"] = h
            if w: p_update["weight"] = w
            if p_update:
                supabase.table("players").update(p_update).eq("id", p_id).execute()

            # 2) card_versions 테이블 바디타입 & 엑셀타입 갱신
            cv_update = {}
            if bt: cv_update["body_type"] = bt
            if acc: cv_update["accele_type"] = acc
            if cv_update:
                supabase.table("card_versions").update(cv_update).eq("id", c_id).execute()

            print(f"  ✔ [갱신 완료] {h}cm · {w}kg | 체형: {bt} | 가속: {acc}")
            success_cnt += 1
            completed_ids.add(c_id)
            save_progress(completed_ids)

        except Exception as e:
            print(f"  ❌ 에러: {e}")
            fail_cnt += 1

        if idx < len(target_batch):
            delay = random.uniform(3.5, 5.0)
            print(f"  ⏳ 봇 차단 방지 대기 중: {delay:.2f}초...")
            time.sleep(delay)

    print("\n" + "=" * 70)
    print(f"🏁 이번 배치 종료! 성공: {success_cnt}명 / 실패: {fail_cnt}명")
    remaining = len(pending_cards) - len(target_batch)
    print(f"📌 다음 실행 시 처리될 남은 카드: {max(0, remaining)}명")
    print("=" * 70)

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="80+ 골드 & 스페셜 전체 배치 업데이트")
    parser.add_argument("--limit", type=int, default=500, help="1회 실행 시 처리할 카드 개수 (기본 500)")
    parser.add_argument("--reset", action="store_true", help="기존 진행 기록 파일 초기화 후 1번부터 다시 시작")
    args = parser.parse_args()

    run_batch(limit=args.limit, reset=args.reset)