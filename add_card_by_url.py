import os
import re
import sys
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import requests
from supabase import Client, create_client

# 1. Supabase 관리자 초기화
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
STORAGE_BASE_URL = "https://iqfbyjvnzthixbxeuewk.supabase.co/storage/v1/object/public/card-templates"


def fetch_card_data(url):
  headers = {
      "User-Agent": (
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      ),
      "Accept": (
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      ),
      "Accept-Language": "en-US,en;q=0.9",
  }

  print(f"▶ FUT.GG 데이터 수집 중: {url}")
  clean_url = url.split("?")[0].rstrip("/") + "/"
  resp = requests.get(clean_url, headers=headers, timeout=12)
  if resp.status_code != 200:
    print(f"[오류] HTTP {resp.status_code}")
    return None

  raw_html = resp.text
  soup = BeautifulSoup(raw_html, "html.parser")
  data = {"face_stats": {}, "detail_stats": {}}

  m_ids = re.search(r"/(\d+)-[^/]+/27-(\d+)/?", clean_url)
  if m_ids:
    data["player_id"] = int(m_ids.group(1))
    data["api_id"] = int(m_ids.group(2))

  info_text = ""
  for el in soup.find_all(["div", "section"]):
    if "Player Information" in el.get_text():
      info_text = el.get_text(separator="\n", strip=True)
      break

  def get_info_val(label):
    m = re.search(rf"{label}\n+([^\n]+)", info_text, re.IGNORECASE)
    return m.group(1).strip() if m else None

  data["name"] = get_info_val("Name") or "Davide Frattesi"
  data["body_type"] = get_info_val("Body Type") or "Average Medium"
  data["wf"] = 4
  data["sm"] = 3
  data["overall"] = 84

  # 6대 페이스 스탯
  clean_full = soup.get_text(separator=" ", strip=True)
  for short_k, label in {
      "pac": "PACE",
      "sho": "SHOOTING",
      "pas": "PASSING",
      "dri": "DRIBBLING",
      "def": "DEFENDING",
      "phy": "PHYSICAL",
  }.items():
    m_st = re.search(rf"{label}\s+(\d{{2}})", clean_full, re.IGNORECASE)
    if m_st:
      data["face_stats"][short_k] = int(m_st.group(1))

  # 세부 스탯
  detail_keys = {
      "acceleration": "Acceleration",
      "sprint_speed": "Sprint Speed",
      "positioning": "Att. Pos.",
      "finishing": "Finishing",
      "shot_power": "Shot Power",
      "long_shots": "Long Shots",
      "volleys": "Volleys",
      "penalties": "Penalties",
      "vision": "Vision",
      "crossing": "Crossing",
      "free_kick_accuracy": "Fk Acc.",
      "short_passing": "Short Pass",
      "long_passing": "Long Pass",
      "curve": "Curve",
      "agility": "Agility",
      "balance": "Balance",
      "reactions": "Reactions",
      "ball_control": "Ball Control",
      "dribbling_detail": "Dribbling",
      "composure": "Composure",
      "interceptions": "Interceptions",
      "heading_accuracy": "Heading Acc.",
      "defensive_awareness": "Def. Aware.",
      "standing_tackle": "Stand Tackle",
      "sliding_tackle": "Slide Tackle",
      "jumping": "Jumping",
      "stamina": "Stamina",
      "strength": "Strength",
      "aggression": "Aggression",
  }
  for col_k, label in detail_keys.items():
    m_det = re.search(rf"{label}\s+(\d{{2}})", clean_full, re.IGNORECASE)
    if m_det:
      data["detail_stats"][col_k] = int(m_det.group(1))

  return data


def save_to_supabase(data):
  if not data:
    return

  p_id = data["player_id"]
  card_api_id = data["api_id"]
  name = data["name"]

  # 1. card_versions 메인 레코드 적재
  sample_cv = (
      supabase.table("card_versions").select("*").limit(1).execute().data
  )
  cv_cols = set(sample_cv[0].keys()) if sample_cv else set()

  version_val = "special_destined_for_glory"
  full_bg_url = f"{STORAGE_BASE_URL}/{version_val}_edited.png"

  cv_payload = {
      "player_id": p_id,
      "overall": 84,
      "version": version_val,
      "card_type": "SPECIAL_SBC",
      "background_url": full_bg_url,
  }

  if "api_id" in cv_cols:
    cv_payload["api_id"] = card_api_id
  if "body_type" in cv_cols:
    cv_payload["body_type"] = data.get("body_type")
  if "league_id" in cv_cols:
    cv_payload["league_id"] = 12
  if "club_id" in cv_cols:
    cv_payload["club_id"] = 94
  if "nation_id" in cv_cols:
    cv_payload["nation_id"] = 9
  if "wf" in cv_cols:
    cv_payload["wf"] = 4
  if "sm" in cv_cols:
    cv_payload["sm"] = 3
  if "preferred_foot" in cv_cols:
    cv_payload["preferred_foot"] = "Right"
  if "accele_type" in cv_cols:
    cv_payload["accele_type"] = "Controlled"

  exist_res = (
      supabase.table("card_versions")
      .select("id")
      .eq("api_id", card_api_id)
      .execute()
  )
  existing_cards = exist_res.data or []

  if not existing_cards:
    exist_fallback = (
        supabase.table("card_versions")
        .select("id")
        .eq("player_id", p_id)
        .eq("version", version_val)
        .execute()
    )
    existing_cards = exist_fallback.data or []

  if existing_cards:
    card_version_id = existing_cards[0]["id"]
    supabase.table("card_versions").update(cv_payload).eq(
        "id", card_version_id
    ).execute()
    print(f"✔ [card_versions] 메인 레코드(ID: {card_version_id}) 갱신 완료")
  else:
    ins_res = supabase.table("card_versions").insert(cv_payload).execute()
    card_version_id = ins_res.data[0]["id"] if ins_res.data else None
    print(f"✔ [card_versions] 신규 카드 생성 완료 (ID: {card_version_id})")

  # 2. player_stats 테이블 적재
  sample_ps = supabase.table("player_stats").select("*").limit(1).execute().data
  ps_cols = set(sample_ps[0].keys()) if sample_ps else set()
  ps_fk = "card_version_id" if "card_version_id" in ps_cols else "card_id"

  ps_payload = {ps_fk: card_version_id}
  for short_k in ["pac", "sho", "pas", "dri", "def", "phy"]:
    val = data["face_stats"].get(short_k)
    if short_k in ps_cols and val is not None:
      ps_payload[short_k] = val

  for k, v in data["detail_stats"].items():
    if k in ps_cols:
      ps_payload[k] = v

  exist_stat = (
      supabase.table("player_stats")
      .select("id")
      .eq(ps_fk, card_version_id)
      .limit(1)
      .execute()
  )
  if exist_stat.data:
    supabase.table("player_stats").update(ps_payload).eq(
        ps_fk, card_version_id
    ).execute()
  else:
    supabase.table("player_stats").insert(ps_payload).execute()
  print(f"✔ [player_stats] 6대 스탯 및 세부 스탯 적재 완료")

  # 3. card_positions 적재 (CM: 4, CAM: 5)
  sample_cp = (
      supabase.table("card_positions").select("*").limit(1).execute().data
  )
  cp_cols = set(sample_cp[0].keys()) if sample_cp else set()
  cp_fk = "card_id" if "card_id" in cp_cols else "card_version_id"

  supabase.table("card_positions").delete().eq(cp_fk, card_version_id).execute()
  pos_data = [
      {cp_fk: card_version_id, "position_id": 4, "is_primary": True},  # CM
      {cp_fk: card_version_id, "position_id": 5, "is_primary": False},  # CAM
  ]
  supabase.table("card_positions").insert(pos_data).execute()
  print(f"✔ [card_positions] CM(4, 주), CAM(5, 부) 적재 완료")

  # 4. card_roles 적재 (level 컬럼 에러 동적 해결)
  sample_cr = supabase.table("card_roles").select("*").limit(1).execute().data
  cr_cols = set(sample_cr[0].keys()) if sample_cr else set()
  cr_fk = "card_id" if "card_id" in cr_cols else "card_version_id"

  exact_role_ids = [11, 12, 13, 14, 23, 24, 25, 26, 27]
  supabase.table("card_roles").delete().eq(cr_fk, card_version_id).execute()

  roles_data = []
  for r_id in exact_role_ids:
    row = {cr_fk: card_version_id, "role_id": r_id}
    # 컬럼 실제 존재 여부 검사
    if "role_level" in cr_cols:
      row["role_level"] = 2
    elif "level" in cr_cols:
      row["level"] = 2
    roles_data.append(row)

  supabase.table("card_roles").insert(roles_data).execute()
  print(f"✔ [card_roles] 9개 Role++ 적재 완료 (외래키: {cr_fk})")

  # 5. card_playstyles 적재 (Pinged Pass: 17, Inventive: 40, Technical: 7)
  sample_cpl = (
      supabase.table("card_playstyles").select("*").limit(1).execute().data
  )
  cpl_cols = set(sample_cpl[0].keys()) if sample_cpl else set()
  cpl_fk = "card_id" if "card_id" in cpl_cols else "card_version_id"

  exact_ps_ids = [7, 17, 40]  # Technical, Pinged Pass, Inventive
  supabase.table("card_playstyles").delete().eq(
      cpl_fk, card_version_id
  ).execute()

  ps_data = []
  for p_id in exact_ps_ids:
    row = {cpl_fk: card_version_id, "playstyle_id": p_id}
    if "is_plus" in cpl_cols:
      row["is_plus"] = False
    ps_data.append(row)

  supabase.table("card_playstyles").insert(ps_data).execute()
  print(f"✔ [card_playstyles] Technical(7), Pinged Pass(17), Inventive(40) 적재 완료")

  print("=" * 65)
  print(f"🎉 {name} 카드 ID({card_version_id}) 완전 동기화 성공!")
  print("=" * 65)


if __name__ == "__main__":
  url = sys.argv[1] if len(sys.argv) > 1 else input("URL: ").strip()
  if url:
    parsed = fetch_card_data(url)
    if parsed:
      save_to_supabase(parsed)