import csv
from datetime import datetime

print("데이터 불러오는 중 (보안 차단 없는 순수 파이썬 모드)...")

# 원본 데이터 로드
with open('fc27_dataset.csv', mode='r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# ---------------------------------------------------------
# 1. 국가 (Nations) 테이블 생성
# ---------------------------------------------------------
nations_map = {}
nations_list = []
for r in rows:
    nat = r.get('nationality', '').strip()
    if nat and nat not in nations_map:
        nid = len(nations_map) + 1
        nations_map[nat] = nid
        flag_url = f"https://iqfbyjvnzthixbxeuewk.supabase.co/storage/v1/object/public/fc-assets/nations/{nid}.webp"
        nations_list.append({'id': nid, 'name': nat, 'flag_url': flag_url})

# ---------------------------------------------------------
# 2. 리그 (Leagues) 테이블 생성
# ---------------------------------------------------------
leagues_map = {}
leagues_list = []
for r in rows:
    lg = r.get('league', '').strip()
    if lg and lg not in leagues_map:
        lid = len(leagues_map) + 1
        leagues_map[lg] = lid
        leagues_list.append({'id': lid, 'name': lg})

# ---------------------------------------------------------
# 3. 클럽 (Clubs) 테이블 생성
# ---------------------------------------------------------
clubs_map = {}
clubs_list = []
for r in rows:
    cl = r.get('club', '').strip()
    lg = r.get('league', '').strip()
    if cl and lg:
        lid = leagues_map.get(lg, 0)
        key = (cl, lid)
        if key not in clubs_map:
            cid = len(clubs_map) + 1
            clubs_map[key] = cid
            clubs_list.append({
                'id': cid,
                'name': cl,
                'logo_url': '',
                'league_id': lid,
                'short_name': ''
            })

# ---------------------------------------------------------
# 4. 선수 (Players) 테이블 생성
# ---------------------------------------------------------
players_dict = {}
for r in rows:
    pid = r.get('player_id', '').strip()
    if pid and pid not in players_dict:
        nat = r.get('nationality', '').strip()
        nation_id = nations_map.get(nat, 0)
        
        fname = r.get('first_name', '').strip()
        lname = r.get('last_name', '').strip()
        long_name = f"{fname} {lname}".strip()
        cname = r.get('common_name', '').strip()
        name = cname if cname else long_name
        
        # 나이 계산
        birth = r.get('birthdate', '').strip()
        snapshot = r.get('snapshot_date', '').strip()
        age = 25
        try:
            b_dt = datetime.strptime(birth[:10], '%Y-%m-%d')
            s_dt = datetime.strptime(snapshot[:10], '%Y-%m-%d')
            age = (s_dt - b_dt).days // 365
        except:
            pass
            
        try:
            height = int(float(r.get('height_cm', 180)))
        except:
            height = 180
            
        try:
            weight = int(float(r.get('weight_kg', 75)))
        except:
            weight = 75
            
        gender = r.get('gender', '').strip() or 'Male'
        
        players_dict[pid] = {
            'id': pid,
            'name': name,
            'gender': gender,
            'height': height,
            'weight': weight,
            'age': age,
            'nation_id': nation_id,
            'long_name': long_name
        }

# ---------------------------------------------------------
# 5. 카드 버전 (Card Versions) 테이블 생성
# ---------------------------------------------------------
cards_list = []
for idx, r in enumerate(rows, start=1):
    pid = r.get('player_id', '').strip()
    cl = r.get('club', '').strip()
    lg = r.get('league', '').strip()
    lid = leagues_map.get(lg, 0)
    cid = clubs_map.get((cl, lid), 0)
    
    edition = r.get('edition', '').strip() or 'Normal'
    try:
        overall = int(float(r.get('overall_rating', 50)))
    except:
        overall = 50
        
    try:
        sm = int(float(r.get('skill_moves', 3)))
    except:
        sm = 3
        
    try:
        wf = int(float(r.get('weak_foot', 3)))
    except:
        wf = 3
        
    pref_foot = r.get('preferred_foot', '').strip() or 'Right'
    
    cards_list.append({
        'id': idx,
        'player_id': pid,
        'version': edition,
        'overall': overall,
        'price': 0,
        'image_url': '',
        'sm': sm,
        'wf': wf,
        'preferred_foot': pref_foot,
        'accele_type': 'Controlled',
        'body_type': 'Average',
        'club_id': cid,
        'league_id': lid,
        'card_type': 'NORMAL'
    })

# CSV 파일로 저장하는 함수
def save_csv(filename, fieldnames, data):
    with open(filename, mode='w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

save_csv('new_nations.csv', ['id', 'name', 'flag_url'], nations_list)
save_csv('new_leagues.csv', ['id', 'name'], leagues_list)
save_csv('new_clubs.csv', ['id', 'name', 'logo_url', 'league_id', 'short_name'], clubs_list)
save_csv('new_players.csv', ['id', 'name', 'gender', 'height', 'weight', 'age', 'nation_id', 'long_name'], list(players_dict.values()))
save_csv('new_card_versions.csv', ['id', 'player_id', 'version', 'overall', 'price', 'image_url', 'sm', 'wf', 'preferred_foot', 'accele_type', 'body_type', 'club_id', 'league_id', 'card_type'], cards_list)

print("작업 완료! 5개의 CSV 파일이 생성되었습니다.")