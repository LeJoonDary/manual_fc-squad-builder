import json
import os
from pathlib import Path
import time
import requests

# =====================================================================
# 1. .env 파일에서 인증 정보 로드
# =====================================================================
env_file = Path(".env")
url, key = None, None
if env_file.exists():
  for line in env_file.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
      k, v = line.split("=", 1)
      k, v = k.strip(), v.strip().strip("'\"")
      if k in ("SUPABASE_URL", "VITE_SUPABASE_URL") and not url:
        url = v
      if k in ("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"):
        key = v

SUPABASE_URL = (
    url or os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
)
SUPABASE_KEY = (
    key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
)

if not SUPABASE_URL or not SUPABASE_KEY:
  print("[오류] .env 파일에서 URL 또는 SERVICE_ROLE_KEY를 찾을 수 없습니다.")
  exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# =====================================================================
# 2. 국가명 동의어(Alias) 매핑 사전
# =====================================================================
COUNTRY_ALIASES = {
    "netherlands": "holland",
    "the netherlands": "holland",
    "ivory coast": "côte d'ivoire",
    "cote d'ivoire": "côte d'ivoire",
    "south korea": "korea republic",
    "korea": "korea republic",
    "usa": "united states",
    "united states of america": "united states",
    "republic of ireland": "ireland",
    "dr congo": "congo dr",
    "democratic republic of the congo": "congo dr",
    "cape verde": "cape verde islands",
    "curacao": "curaçao",
    "turkey": "türkiye",
    "czechia": "czech republic",
    "bosnia and herzegovina": "bosnia herzegovina",
    "trinidad and tobago": "trinidad & tobago",
}


def main():
  input_file = "special_cards.json"
  if not os.path.exists(input_file):
    print(f"[오류] '{input_file}' 파일이 없습니다.")
    return

  with open(input_file, "r", encoding="utf-8") as f:
    cards = json.load(f)

  session = requests.Session()

  print("=" * 65)
  print("1. Supabase 마스터 국가 테이블 조회 중...")
  res_nats = session.get(
      f"{SUPABASE_URL}/rest/v1/nations?select=id,name", headers=HEADERS
  ).json()
  nat_map = {
      n["name"].strip().lower(): n["id"]
      for n in res_nats
      if isinstance(n, dict)
  }
  print(f"-> 총 {len(nat_map)}개 국가 정보 로드 완료")
  print("=" * 65)

  # 선수 ID 기준으로 중복을 제거하여 고유 선수 맵 생성
  unique_players = {}
  for c in cards:
    pid = c.get("basePlayerEaId") or c.get("eaId")
    pname = (
        c.get("commonName")
        or f"{c.get('firstName', '')} {c.get('lastName', '')}".strip()
    )
    nat_obj = c.get("nation") or {}
    nat_name = (nat_obj.get("name") or "").strip()
    if pid and nat_name:
      unique_players[pid] = {"name": pname, "nation": nat_name}

  print(
      f"2. 총 {len(unique_players)}명의 특수 카드 선수 국적 일괄 수정 시작...\n"
  )

  success_cnt = 0
  fail_cnt = 0

  for idx, (pid, info) in enumerate(unique_players.items(), start=1):
    raw_nat = info["nation"].lower()
    target_nat = COUNTRY_ALIASES.get(raw_nat, raw_nat)
    correct_nation_id = nat_map.get(target_nat) or nat_map.get(raw_nat)

    if not correct_nation_id:
      print(
          f"[{idx}/{len(unique_players)}] 매칭 실패: {info['name']} (국가:"
          f" {info['nation']})"
      )
      fail_cnt += 1
      continue

    # 강제 덮어쓰기 (PATCH)
    patch_res = session.patch(
        f"{SUPABASE_URL}/rest/v1/players?id=eq.{pid}",
        headers=HEADERS,
        json={"nation_id": correct_nation_id},
    )

    if patch_res.status_code in (200, 204):
      success_cnt += 1
      print(
          f"[{idx}/{len(unique_players)}] {info['name']} -> {info['nation']}"
          f" (nation_id: {correct_nation_id}) 수정 완료"
      )
    else:
      print(
          f"[{idx}/{len(unique_players)}] 수정 실패 ({info['name']}):"
          f" {patch_res.text}"
      )
      fail_cnt += 1

    time.sleep(0.03)

  print("\n" + "=" * 65)
  print(
      f"작업 완료! 성공: {success_cnt}명 / 실패: {fail_cnt}명 (총"
      f" {len(unique_players)}명)"
  )
  print("=" * 65)


if __name__ == "__main__":
  main()