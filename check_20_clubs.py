import json
import os
from pathlib import Path
import re
import time
import requests
from dotenv import load_dotenv

# 1. 환경변수 로드
load_dotenv(Path(".env.local") if Path(".env.local").exists() else Path(".env"))

# 어제 갱신했던 최신 쿠키 적용
COOKIE_STRING = (
    os.getenv("FUTGG_COOKIE")
    or "_ga=GA1.1.963824020.1787069981; "
    "__Host-futgg_price_sid=Bs9QCk-wurGCMzZ2NH0fiVfj23CcH3s6.XIZHbBc1HR0lbGySTjCa2PgT11mMOJTN7VXuLCYPxS0; "
    "cookieyes-consent=consentid:YjZOOUV4T2h6UkFoTUwzM2ZpWGE0SFFpZXZaUXFhMk8,consent:,action:,necessary:,functional:,analytics:,performance:,advertisement:,other:; "
    "cf_clearance=cf8XBlEmXCV4ZjQogjvid83bHUZqFN9fu2BBa9IAkm0-1790165596-1.2.1.1-hMJQxrW6cy5GIHwjWIYshaHvNWksQBSK6yIrpi3LfUTYuy.Z4s1oen34Z3lLD8_AdJQLhlEylm4.QtyLAJRxX.nQGWPUTH3V8FgLhmSUXBd_xnKhNaHagsQuOz5i3NYo433jSFAkJwvdKTve11ncLYEhqCXl_TVuIQG9fAL8gXl0KfSJkjUsdvbuHtx8jjiCZ1_0ZfocWqZdZDGpLwBVolM4R5Qp7zOJLQ3cCVXhnC7MtOlaunlAl1y75UuFc43rJHtY24JZSrNjAbuiI3r3XSiallL2bZWza2uH1mb0Ex9n5xt5Owqa3bUnMCNVzkio.wwnFd_eWOZ7ym5G9JlpBlkPlqZjPlnORZDGpBTK8rw; "
    "__cf_bm=8tHqHuw.Lo0fTYGtXJ6oOad.k2LEMOTiXsETCH5IvyQ-1790165596.6087818-1.0.1.1-oPFbWwR_mFLbmHT8sLTUlgzLcmRJ531pbygExj8rJxygD9PqNO1SZ3KwPOKH1F1V_PQuw0svnIW1LIdMYLmYeZZ9nO7mtQE198F898BBjQueaIkjRAW_t4CV0ric1ERk; "
    "_ga_JBQ8V6N36N=GS2.1.s1790165593$o15$g1$t1790165622$j31$l0$h0"
)

session = requests.Session()
session.headers.update({
    "accept": "application/json",
    "accept-language": "ko,en;q=0.9",
    "content-type": "application/json",
    "origin": "https://www.fut.gg",
    "referer": "https://www.fut.gg/",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,"
        " like Gecko) Chrome/153.0.0.0 Safari/537.36"
    ),
    "cookie": COOKIE_STRING,
})

# 어제 404 실패한 20명 대상 카드 목록 (Card ID, Base API ID, 선수명)
TARGET_PLAYERS = [
    (891, 242835, "Leonardo Balerdi"),
    (853, 228413, "Emil Audero"),
    (881, 237985, "Kevin Danso"),
    (909, 251806, "Quinten Timber"),
    (1128, 241671, "Dominik Livaković"),
    (1221, 262881, "Richard Ríos"),
    (1198, 256958, "Fábio Vieira"),
    (1286, 272600, "Marc Casadó"),
    (1294, 274915, "El Hadji Malick Diouf"),
    (1297, 275353, "Zakaria El Ouahdi"),
    (1295, 275208, "Guéla Doué"),
    (1199, 257278, "Arthur Theate"),
    (1300, 276048, "Matias Fernandez-Pardo"),
    (1044, 219693, "Diego Carlos"),
    (1181, 252162, "Ayase Ueda"),
    (1187, 253473, "Samuele Ricci"),
    (1156, 246242, "Boulaye Dia"),
    (1147, 245152, "Santiago Giménez"),
    (1144, 244369, "Viktor Tsygankov"),
    (1021, 201153, "Álvaro Morata"),
]


def get_player_info(base_id: int):
  new_id = base_id + 50331648
  api_url = f"https://www.fut.gg/api/fut/player-items/27-{new_id}/"

  try:
    res = session.get(api_url, timeout=7)
    if res.status_code == 200:
      data = res.json().get("data", {})
      pdef = data.get("playerDef", data)
      name = (
          pdef.get("commonName")
          or f"{pdef.get('firstName', '')} {pdef.get('lastName', '')}".strip()
      )
      club_name = pdef.get("club", {}).get("name")
      league_name = pdef.get("league", {}).get("name")
      return name, club_name, league_name, new_id, res.status_code
    return None, None, None, new_id, res.status_code
  except Exception as e:
    return None, None, None, new_id, str(e)


def main():
  print("==================================================================")
  print(f"이적 대상 {len(TARGET_PLAYERS)}명 카드의 FUT.GG 인게임 소속 구단/리그 조회 시작")
  print("==================================================================\n")

  results = []
  for idx, (card_id, base_id, default_name) in enumerate(
      TARGET_PLAYERS, start=1
  ):
    name, club, league, new_id, status = get_player_info(base_id)

    if club:
      player_display = name if name else default_name
      print(
          f"[{idx:2d}/20] Card ID: {card_id:4d} | 새 ID: {new_id} | 선수:"
          f" {player_display:20s} | 구단: {club:18s} | 리그: {league}"
      )
      results.append({
          "card_id": card_id,
          "api_id": new_id,
          "name": player_display,
          "club": club,
          "league": league,
      })
    else:
      print(
          f"[{idx:2d}/20] Card ID: {card_id:4d} | 새 ID: {new_id} | 선수:"
          f" {default_name:20s} | 조회 실패 (HTTP {status})"
      )

    time.sleep(1.5)

  print("\n==================================================================")
  print(f"조회 완료: 성공 {len(results)}명 / 전체 {len(TARGET_PLAYERS)}명")
  print("==================================================================")


if __name__ == "__main__":
  main()