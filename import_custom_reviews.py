import html
import os
from pathlib import Path
import re
import unicodedata
from dotenv import load_dotenv
from googleapiclient.discovery import build
from supabase import create_client

# 1. 환경변수 로드
env_path = Path('.env')
if env_path.exists():
  load_dotenv(dotenv_path=env_path)
else:
  load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')

if not SUPABASE_URL or not SUPABASE_KEY or not YOUTUBE_API_KEY:
  raise ValueError('.env 파일의 설정값(SUPABASE, YOUTUBE 키)을 확인해주세요.')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
youtube = build(
    'youtube', 'v3', developerKey=YOUTUBE_API_KEY, cache_discovery=False
)


def extract_video_id(url: str):
  """유튜브 URL에서 11자리 비디오 ID 추출"""
  match = re.search(r'(?:shorts/|v=|youtu\.be/)([\w-]{11})', url)
  return match.group(1) if match else None


def normalize_text(text: str):
  """악센트 제거 및 소문자 정규화 (예: Pelé -> pele, Mbappé -> mbappe)"""
  return ''.join(
      c
      for c in unicodedata.normalize('NFKD', text.casefold())
      if not unicodedata.combining(c)
  )


def fetch_youtube_meta(video_id: str):
  """유튜브 공식 API로 영상 메타데이터 1회 단건 조회 (할당량 1 unit만 소모)"""
  try:
    res = (
        youtube.videos().list(part='snippet', id=video_id).execute(num_retries=1)
    )
    items = res.get('items', [])
    if not items:
      return None

    snippet = items[0]['snippet']
    title = html.unescape(snippet.get('title', ''))
    channel = html.unescape(snippet.get('channelTitle', ''))
    thumbs = snippet.get('thumbnails', {})
    thumb_url = next(
        (
            thumbs[s]['url']
            for s in ('high', 'medium', 'default')
            if thumbs.get(s, {}).get('url')
        ),
        '',
    )
    return {'title': title, 'channel_title': channel, 'thumbnail_url': thumb_url}
  except Exception as e:
    print(f'   [!] 유튜브 API 오류 ({video_id}): {e}')
    return None


def find_card_id(player_name: str, overall: int, version_hint: str = ''):
  """DB에서 선수명과 오버롤, 버전 힌트로 정확한 card_id 탐색"""
  # 1. 오버롤이 일치하는 카드 후보군 조회
  res = (
      supabase.table('card_versions')
      .select('id, overall, version, players!inner(name)')
      .eq('overall', overall)
      .execute()
  )
  candidates = res.data or []

  norm_search = normalize_text(player_name)
  matched = []

  for c in candidates:
    p_name = normalize_text(c.get('players', {}).get('name', ''))
    # 부분 검색 매칭 (예: 'mbappe' in 'k. mbappe')
    if norm_search in p_name:
      matched.append(c)

  if not matched:
    return None, f"선수 '{player_name}' (OVR {overall})를 DB에서 찾을 수 없습니다."

# 2. 버전 힌트가 있거나 후보가 2개 이상인 경우 버전 매칭 (공백과 언더바 자동 무시)
  if len(matched) > 1 and version_hint:
    v_clean = version_hint.lower().replace(' ', '').replace('_', '')
    narrowed = [
      c for c in matched
      if v_clean in str(c.get('version', '')).lower().replace('_', '')
    ]
    if narrowed:
      matched = narrowed

  if len(matched) == 1:
    return matched[0]['id'], matched[0]['version']
  else:
    versions = [c.get('version') for c in matched]
    return (
      None,
      f"동일 오버롤 카드가 여러 개 있습니다 ({versions}). reviews.txt에 "
      "버전을 명시해주세요."
    )


def main():
  txt_file = Path('reviews.txt')
  if not txt_file.exists():
    print('[오류] reviews.txt 파일이 없습니다. 파일을 먼저 생성해주세요.')
    return

  with open(txt_file, 'r', encoding='utf-8') as f:
    lines = [line.strip() for line in f if line.strip()]

  print(f'🚀 총 {len(lines)}건의 쇼츠 리뷰 등록을 시작합니다...\n' + '=' * 60)

  success = 0
  skipped = 0
  failed = 0

  for idx, line in enumerate(lines, start=1):
    if line.startswith('#'):
      continue  # 주석 줄 제외

    parts = [p.strip() for p in line.split(',')]
    if len(parts) < 3:
      print(f'[{idx}번 줄 오류] 형식 부족: {line}')
      failed += 1
      continue

    player_name = parts[0]
    try:
      overall = int(parts[1])
    except ValueError:
      print(f"[{idx}번 줄 오류] 오버롤 숫자가 올바르지 않음: '{parts[1]}'")
      failed += 1
      continue

    # 3개 또는 4개 인자 분기 처리
    if len(parts) >= 4:
      version_hint = parts[2]
      url = parts[3]
    else:
      version_hint = ''
      url = parts[2]

    video_id = extract_video_id(url)
    if not video_id:
      print(f"[{idx}번 줄 오류] 유효하지 않은 유튜브 URL: '{url}'")
      failed += 1
      continue

    # 1. DB에서 card_id 매칭
    card_id, ver_or_err = find_card_id(player_name, overall, version_hint)
    if not card_id:
      print(f'[{idx}번 줄 실패] {ver_or_err}')
      failed += 1
      continue

    # 2. 유튜브 영상 메타데이터 가져오기
    meta = fetch_youtube_meta(video_id)
    if not meta:
      print(f'[{idx}번 줄 실패] 유튜브 메타데이터 조회 불가 (ID: {video_id})')
      failed += 1
      continue

    # 3. card_reviews 테이블에 upsert
    try:
      supabase.table('card_reviews').upsert(
          {
              'card_id': card_id,
              'youtube_video_id': video_id,
              'title': meta['title'],
              'channel_title': meta['channel_title'],
              'thumbnail_url': meta['thumbnail_url'],
          },
          on_conflict='card_id',
      ).execute()

      print(
          f'✔ [{idx}] {player_name} ({overall} {ver_or_err}) ->'
          f" [{meta['channel_title']}] {meta['title'][:30]}..."
      )
      success += 1
    except Exception as e:
      print(f'[{idx}번 줄 DB 저장 실패] {e}')
      failed += 1

  print('=' * 60)
  print(f'🎉 등록 완료! (성공: {success}건, 실패: {failed}건)')


if __name__ == '__main__':
  main()