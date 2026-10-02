import os
import sys
import re
import time
import random
import argparse
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Supabase 관리자 클라이언트 초기화
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
)

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("[오류] Supabase 환경 변수를 확인하세요.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

# 2. 브라우저 위장 헤더
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.fut.gg/players/",
}

def fetch_correct_specs(player_id, api_id, player_name):
    """FUT.GG 상세 페이지에서 Body Type과 AcceleRATE만 정밀 추출"""
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", player_name.strip()).lower().strip("-")
    urls_to_try = [
        f"https://www.fut.gg/players/{player_id}-{slug}/27-{api_id}/",
        f"https://www.fut.gg/players/{player_id}/27-{api_id}/",
    ]

    resp = None
    for url in urls_to_try:
        try:
            r = requests.get(url, headers=HEADERS, timeout=12)
            if r.status_code == 200:
                resp = r
                break
            elif r.status_code == 429:
                print("\n  ⚠️ [경고] FUT.GG 일시 차단 감지(429). 60초간 대기합니다...")
                time.sleep(60)
                r = requests.get(url, headers=HEADERS, timeout=12)
                if r.status_code == 200:
                    resp = r
                    break
        except Exception:
            continue

    if not resp:
        return None

    html = resp.text
    soup = BeautifulSoup(html, "html.parser")
    clean_full = soup.get_text(separator=" ", strip=True)

    # 1) Player Information 영역 추출
    info_text = ""
    for el in soup.find_all(["div", "section"]):
        if "Player Information" in el.get_text():
            info_text = el.get_text(separator="\n", strip=True)
            break

    # 2) Body Type 추출 (Ruud Gullit, Kylian Mbappé 고유 체형 및 일반 체형 완벽 대응)
    body_type = None
    m_body = re.search(r"Body\s*Type\s*\n+\s*([^\n]+)", info_text, re.IGNORECASE)
    if m_body:
        cand_body = m_body.group(1).strip()
        if cand_body.lower() not in ["real face", "yes", "no", "age"]:
            body_type = cand_body

    # 3) EA FC 공식 7대 가속 유형 정밀 매칭
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

    return {
        "body_type": body_type,
        "accele_type": accele_type,
    }

def run_patch(start_index=1):
    print("=" * 70)
    print("🛠️  스페셜 카드 Body Type & AcceleRATE 전용 패치 시작")
    print("    - 필터 기준: card_versions.version 에 'special' 포함")
    print("    - 안전 딜레이: 3.5초 ~ 5.0초 (FUT.GG 봇 차단 원천 방지)")
    print("=" * 70)

    # 1. version에 'special'이 들어간 모든 카드 조회 (최대 1000개 허용)
    res = (
        supabase.table("card_versions")
        .select("id, player_id, api_id, version, overall, body_type, accele_type")
        .ilike("version", "%special%")
        .order("id")
        .limit(1000)
        .execute()
    )
    cards = res.data or []

    # api_id가 있는 대상만 정제
    target_cards = [c for c in cards if c.get("api_id")]
    total = len(target_cards)
    print(f"▶ DB 조회 결과: 총 {total}장의 대상 스페셜 카드 확인 완료\n")

    if total == 0:
        print("[종료] 패치할 스페셜 카드가 없습니다.")
        return

    updated_count = 0
    start_time = time.time()

    for idx in range(start_index - 1, total):
        card = target_cards[idx]
        c_id = card["id"]
        p_id = card["player_id"]
        api_id = card["api_id"]
        version_name = card.get("version")

        # 선수 이름 가져오기
        p_res = supabase.table("players").select("name").eq("id", p_id).execute()
        p_name = p_res.data[0]["name"] if p_res.data else f"Player_{p_id}"

        # 경과 시간 및 남은 예상 시간(ETA) 계산
        elapsed = time.time() - start_time
        avg_time = elapsed / (idx + 1 - (start_index - 1)) if (idx + 1 > start_index) else 4.2
        remain_sec = int((total - (idx + 1)) * avg_time)
        remain_min = remain_sec // 60

        current_body = card.get("body_type")
        current_acc = card.get("accele_type")

        specs = fetch_correct_specs(p_id, api_id, p_name)
        if not specs:
            print(f"[{idx+1}/{total}] ⚠️ {p_name} (ID: {c_id}) ➔ 페이지 조회 실패 (건너뜀)")
        else:
            new_body = specs["body_type"] or current_body
            new_acc = specs["accele_type"]

            update_payload = {}
            if new_body and new_body != current_body:
                update_payload["body_type"] = new_body
            if new_acc and new_acc != current_acc:
                update_payload["accele_type"] = new_acc

            if update_payload:
                supabase.table("card_versions").update(update_payload).eq("id", c_id).execute()
                print(
                    f"[{idx+1}/{total}] ✔ {p_name} ({version_name}) [남은시간: ~{remain_min}분]\n"
                    f"       • Body: {current_body} ➔ {new_body}\n"
                    f"       • Accele: {current_acc} ➔ {new_acc}"
                )
                updated_count += 1
            else:
                print(
                    f"[{idx+1}/{total}] ➖ {p_name} ({version_name}) ➔ 이미 정상 값 "
                    f"({new_body} / {new_acc})"
                )

        # 3.5초 ~ 5.0초 지정 딜레이 (FUT.GG 봇 차단 방지)
        if idx + 1 < total:
            delay = random.uniform(3.5, 5.0)
            time.sleep(delay)

    print("\n" + "=" * 70)
    print(f"🎉 총 {total}명 검사 완료! (실제 수정된 카드: {updated_count}장)")
    print("=" * 70)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="스페셜 카드 Body Type & AcceleRATE 일괄 동기화")
    parser.add_argument("--start", type=int, default=1, help="시작할 순번 번호 (기본값: 1)")
    args = parser.parse_args()

    try:
        run_patch(start_index=args.start)
    except KeyboardInterrupt:
        print("\n\n[중단됨] 사용자가 작업을 멈췄습니다.")