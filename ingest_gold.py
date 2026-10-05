import os
import sys
import re
import json
import time
import random
import argparse
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Supabase 클라이언트 초기화
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
FUTGG_GOLD_PAGE_TEMPLATE = "https://www.fut.gg/players/?overall_gte=82&quality_id=%5B1%5D&page={page}"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.fut.gg/",
}

# EA 역할 고유 ID -> DB role_id 매핑 사전
EA_ROLE_TO_DB = {
    1: 48, 2: 49, 45: 47,
    3: 40, 4: 39, 5: 42, 6: 38, 46: 41,
    7: 35, 8: 34, 9: 37, 10: 33, 47: 36,
    11: 44, 12: 45, 13: 43, 48: 46,
    14: 31, 15: 29, 16: 30, 17: 32, 49: 28,
    18: 23, 19: 26, 20: 24, 21: 27, 22: 25,
    23: 22, 24: 20, 25: 21, 26: 19,
    27: 18, 28: 16, 29: 17, 30: 15,
    31: 13, 32: 14, 33: 12, 34: 11,
    35: 10, 36: 8, 37: 9,
    38: 7, 39: 5, 40: 6,
    41: 1, 42: 3, 43: 2, 44: 4,
}

def get_table_columns(table_name):
    res = supabase.table(table_name).select("*").limit(1).execute()
    return set(res.data[0].keys()) if res.data else set()

def owned_ids(card, *keys):
    for key in keys:
        if key in card:
            values = card[key]
            if values is None:
                return []
            if isinstance(values, list):
                return [int(v) for v in values if isinstance(v, (int, str)) and str(v).isdigit()]
    return []

def player_def_fields(text, card_api_id, player_id=None):
    candidates = []
    for match in re.finditer(r"\bplayerDef\s*:\s*(?:\$R\[\d+\]\s*=\s*)?\{", text):
        depth, quote, escaped = 1, None, False
        begin = match.end()
        fields = {}
        for index in range(begin, len(text)):
            ch = text[index]
            if quote:
                if escaped: escaped = False
                elif ch == "\\": escaped = True
                elif ch == quote: quote = None
                continue
            if ch in ('"', "'"): quote = ch
            elif ch in "{[": depth += 1
            elif ch in "}]": depth -= 1
            if (ch == "," and depth == 1) or depth == 0:
                key, sep, value = text[begin:index].partition(":")
                if sep:
                    value = re.sub(r"^\s*\$R\[\d+\]\s*=\s*", "", value)
                    try:
                        fields[key.strip().strip('"\'')] = json.loads(value)
                    except ValueError:
                        pass
                begin = index + 1
            if depth == 0:
                break
        candidates.append(fields)
        if (
            fields.get("eaId") == card_api_id
            or str(fields.get("eaId")) == str(card_api_id)
            or (player_id and fields.get("basePlayerEaId") == player_id)
            or (player_id and fields.get("eaId") == player_id)
        ):
            return fields

    if candidates:
        return candidates[0]
    raise ValueError("playerDef 파싱 실패")

def extract_player_urls_from_page(page_num):
    """지정된 페이지에서 선수 카드 URL 추출"""
    page_url = FUTGG_GOLD_PAGE_TEMPLATE.format(page=page_num)
    print(f"\n📂 [페이지 {page_num}] 목록 로드 중: {page_url}")
    resp = requests.get(page_url, headers=HEADERS, timeout=15)
    if resp.status_code != 200:
        print(f"  [오류] 페이지 로드 실패 HTTP {resp.status_code}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    found_urls = []
    
    # /players/{id}-{slug}/27-{api_id}/ 패턴 탐색
    for a in soup.find_all("a", href=True):
        m = re.search(r"/players/(\d+-[^/]+/27-\d+)/?", a["href"])
        if m:
            full_card_url = f"{BASE_URL}/players/{m.group(1)}/"
            if full_card_url not in found_urls:
                found_urls.append(full_card_url)

    print(f"  ✔ {len(found_urls)}개의 카드 링크 발견")
    return found_urls

def parse_gold_card(url):
    """키, 몸무게, 바디타입, 엑셀타입, 롤들만 정밀 추출"""
    clean_url = url.split("?")[0].rstrip("/") + "/"
    resp = requests.get(clean_url, headers=HEADERS, timeout=12)
    if resp.status_code != 200:
        print(f"  [오류] HTTP {resp.status_code}")
        return None

    m_ids = re.search(r"/(\d+)-[^/]+/27-(\d+)/?", clean_url)
    if not m_ids:
        return None
    player_id = int(m_ids.group(1))
    card_api_id = int(m_ids.group(2))

    html_text = resp.text
    soup = BeautifulSoup(html_text, "html.parser")
    card = player_def_fields(html_text, card_api_id, player_id)
    clean_full = soup.get_text(separator=" ", strip=True)

    info_text = ""
    for el in soup.find_all(["div", "section"]):
        if "Player Information" in el.get_text():
            info_text = el.get_text(separator="\n", strip=True)
            break

    def get_info(label):
        m = re.search(rf"{label}\n+([^\n]+)", info_text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    name = card.get("commonName") or get_info("Name") or "Unknown"

    # 1. 키 (Height) & 몸무게 (Weight)
    height = 180
    m_h = re.search(r"(\d{3})\s*cm", info_text)
    if m_h: height = int(m_h.group(1))
    elif card.get("height"): height = int(card["height"])

    weight = 75
    m_w = re.search(r"(\d{2,3})\s*kg", info_text)
    if m_w: weight = int(m_w.group(1))
    elif card.get("weight"): weight = int(card["weight"])

    # 2. 바디 타입 (Body Type)
    body_type = None
    m_body = re.search(r"Body\s*Type\s*\n+\s*([^\n]+)", info_text, re.IGNORECASE)
    if m_body:
        cand_b = m_body.group(1).strip()
        if cand_b.lower() not in ["real face", "yes", "no", "age"]:
            body_type = cand_b
    if not body_type:
        body_type = get_info("Body Type") or "Average Medium"

    # 3. 엑셀 타입 (AcceleRATE)
    accele_patterns = (
        r"AcceleRATE\s*[:\n\s]*"
        r"(Mostly\s+Explosive|Controlled\s+Explosive|Explosive|"
        r"Mostly\s+Lengthy|Controlled\s+Lengthy|Lengthy|Controlled)"
    )
    m_acc = re.search(accele_patterns, clean_full, re.IGNORECASE)
    if m_acc:
        accele_type = " ".join(w.capitalize() for w in m_acc.group(1).split())
    else:
        m_acc_info = re.search(r"AcceleRATE\s*\n+\s*([^\n]+)", info_text, re.IGNORECASE)
        accele_type = m_acc_info.group(1).strip() if m_acc_info else "Controlled"

    # 4. 롤스 (Roles - rolesPlus, rolesPlusPlus)
    role_values = {}
    for field, level in (("rolesPlus", 1), ("rolesPlusPlus", 2)):
        for raw in owned_ids(card, field):
            base = raw - 100 if 101 <= raw <= 149 else raw
            if base in EA_ROLE_TO_DB:
                rid = EA_ROLE_TO_DB[base]
                role_values[rid] = max(level, role_values.get(rid, 0))
    roles_list = [{"role_id": rid, "level": level} for rid, level in role_values.items()]

    overall = int(card.get("overall") or 82)

    return {
        "player_id": player_id,
        "api_id": card_api_id,
        "name": name,
        "overall": overall,
        "height": height,
        "weight": weight,
        "body_type": body_type,
        "accele_type": accele_type,
        "roles": roles_list,
    }

def update_gold_card_in_supabase(data):
    """키, 몸무게, 바디타입, 엑셀타입, 롤들만 타겟 갱신"""
    if not data:
        return

    p_id = data["player_id"]
    card_api_id = data["api_id"]
    name = data["name"]

    # 1. players 테이블: height, weight만 업데이트
    player_cols = get_table_columns("players")
    p_payload = {}
    if "height" in player_cols: p_payload["height"] = data["height"]
    if "weight" in player_cols: p_payload["weight"] = data["weight"]

    if p_payload:
        supabase.table("players").update(p_payload).eq("id", p_id).execute()

    # 2. card_versions 테이블: body_type, accele_type, version='gold', card_type='NORMAL' 갱신
    cv_cols = get_table_columns("card_versions")
    cv_payload = {
        "version": "gold",         # special 제거 후 gold 고정
        "card_type": "NORMAL",     # 노말 카드타입 고정
    }
    if "body_type" in cv_cols and data.get("body_type"):
        cv_payload["body_type"] = data["body_type"]
    if "accele_type" in cv_cols and data.get("accele_type"):
        cv_payload["accele_type"] = data["accele_type"]

    # 카드 매칭 (api_id 우선 -> 없으면 player_id + version 'gold')
    exist_cv = supabase.table("card_versions").select("id").eq("api_id", card_api_id).execute()
    if not exist_cv.data:
        exist_cv = supabase.table("card_versions").select("id").eq("player_id", p_id).eq("version", "gold").execute()
    if not exist_cv.data:
        exist_cv = supabase.table("card_versions").select("id").eq("player_id", p_id).ilike("version", "%gold%").execute()
    if not exist_cv.data:
        exist_cv = supabase.table("card_versions").select("id").eq("player_id", p_id).execute()

    if exist_cv.data:
        card_id = exist_cv.data[0]["id"]
        supabase.table("card_versions").update(cv_payload).eq("id", card_id).execute()
        status_label = f"기존 카드(ID: {card_id}) 갱신"
    else:
        # 혹시 카드가 없으면 신규 생성
        cv_payload.update({"player_id": p_id, "overall": data["overall"], "api_id": card_api_id})
        ins_cv = supabase.table("card_versions").insert(cv_payload).execute()
        card_id = ins_cv.data[0]["id"] if ins_cv.data else None
        status_label = f"신규 카드(ID: {card_id}) 생성"

    if not card_id:
        return

    # 3. card_roles 테이블: 롤 갱신
    cr_cols = get_table_columns("card_roles")
    cr_fk = "card_id" if "card_id" in cr_cols else "card_version_id"
    supabase.table("card_roles").delete().eq(cr_fk, card_id).execute()

    if data.get("roles"):
        role_batch = []
        for r in data["roles"]:
            row = {cr_fk: card_id, "role_id": r["role_id"]}
            if "role_level" in cr_cols: row["role_level"] = r["level"]
            elif "level" in cr_cols: row["level"] = r["level"]
            role_batch.append(row)
        supabase.table("card_roles").insert(role_batch).execute()

    print(f"  ✔ [{data['overall']}] {name} ({data['height']}cm / {data['weight']}kg | {data['body_type']} / {data['accele_type']} | Roles: {len(data['roles'])}개) ➔ {status_label}")

def run_gold_pipeline(start_page=1, end_page=15):
    print("=" * 75)
    print(f"🚀 FUT.GG 82+ 골드 카드 전용 데이터 동기화 파이프라인 (총 {start_page} ~ {end_page} 페이지)")
    print("   • 대상 항목: 키(Height), 몸무게(Weight), 바디타입, 엑셀타입, 롤(Roles)")
    print("   • 버전: 'gold', 카드타입: 'NORMAL', 딜레이: 3.5 ~ 5.0초")
    print("=" * 75)

    all_card_urls = []
    for p in range(start_page, end_page + 1):
        urls = extract_player_urls_from_page(p)
        if not urls:
            print(f"  ℹ {p}페이지에 카드가 없어 수집을 중단합니다.")
            break
        all_card_urls.extend(urls)
        # 페이지 이동 딜레이
        time.sleep(random.uniform(2.0, 3.5))

    total = len(all_card_urls)
    print(f"\n총 {total}명의 골드 카드 상세 데이터 크롤링을 시작합니다.")

    success = 0
    for idx, card_url in enumerate(all_card_urls, 1):
        print(f"\n[{idx}/{total}] 수집 중: {card_url}")
        try:
            parsed = parse_gold_card(card_url)
            if parsed:
                update_gold_card_in_supabase(parsed)
                success += 1
        except Exception as e:
            print(f"  ❌ 파싱/적재 에러 발생: {e}")

        # 3.5초 ~ 5.0초 랜덤 딜레이
        if idx < total:
            delay = random.uniform(3.5, 5.0)
            print(f"  ⏳ 봇 차단 방지 대기 중: {delay:.2f}초...")
            time.sleep(delay)

    print("\n" + "=" * 75)
    print(f"🎉 82+ 골드 카드 총 {success}/{total}명 동기화 완료!")
    print("=" * 75)

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="FUT.GG 82+ 골드 카드 데이터 정밀 동기화기")
    parser.add_argument("--start-page", type=int, default=1, help="시작 페이지 번호 (기본값: 1)")
    parser.add_argument("--end-page", type=int, default=15, help="종료 페이지 번호 (기본값: 15)")
    args = parser.parse_args()

    run_gold_pipeline(start_page=args.start_page, end_page=args.end_page)