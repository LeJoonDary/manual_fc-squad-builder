"""Collect up to --limit missing FC 27 card reviews, highest overall first."""

import argparse
import html
import json
import logging
import os
from pathlib import Path
import re
import unicodedata

LOG = logging.getLogger(__name__)


def positive_limit(value):
  number = int(value)
  if not 1 <= number <= 100:
    raise argparse.ArgumentTypeError('--limit must be between 1 and 100')
  return number


def missing_cards(db, limit):
  # 이미 수집된 card_id 목록 추출 후 서버 부하 방지 제외
  reviewed_res = db.table('card_reviews').select('card_id').execute()
  existing_ids = [
      r['card_id'] for r in (reviewed_res.data or []) if r.get('card_id')
  ]

  query = (
      db.table('card_versions')
      .select('id, overall, players!inner(name)')
      .gte('overall', 84)
  )

  if existing_ids:
    query = query.not_.in_('id', existing_ids[:500])

  return (
      query.order('overall', desc=True)
      .order('id')
      .limit(limit)
      .execute()
      .data
      or []
  )


def normalized(value):
  return ''.join(
      c
      for c in unicodedata.normalize('NFKD', value.casefold())
      if not unicodedata.combining(c)
  )


def choose_review(items, player_name):
  candidates = [
      item
      for item in items
      if re.fullmatch(
          r'[\w-]{11}', item.get('id', {}).get('videoId', ''), re.ASCII
      )
  ]

  def score(item):
    title = normalized(html.unescape(item.get('snippet', {}).get('title', '')))
    # FC 27 키워드 점수 부여 및 구작(FC 26/25) 영상 강력 감점
    base_score = (
        8 * (normalized(player_name) in title)
        + 5 * ('fc 27' in title or 'fc27' in title)
        + 3 * ('review' in title)
        + 2 * ('shorts' in title)
    )
    if any(old in title for old in ['fc 26', 'fc26', 'fc 25', 'fc25', 'fifa']):
      base_score -= 15
    return base_score

  return max(candidates, key=score, default=None)


def collect(db, youtube, limit):
  cards = missing_cards(db, limit)
  saved = failed = searched = 0

  # ★ FC 27 출시 시점(2026년 8월 말) 이후 업로드 영상만 유튜브 API 서버단에서 엄격 필터링 ★
  FC27_RELEASE_DATE = '2026-08-25T00:00:00Z'

  for card in cards:
    player = card.get('players') or {}
    if isinstance(player, list):
      player = player[0] if player else {}
    name = player.get('name')
    if not name:
      LOG.warning('Card %s has no player name; skipped', card['id'])
      continue

    try:
      searched += 1
      # 검색어 FC 27 명시 및 publishedAfter 파라미터 적용
      result = (
          youtube.search()
          .list(
              part='snippet',
              q=f'FC 27 {name} review shorts',
              type='video',
              videoDuration='short',
              videoEmbeddable='true',
              publishedAfter=FC27_RELEASE_DATE,
              maxResults=3,
              order='relevance',
          )
          .execute(num_retries=0)
      )

      items = result.get('items', [])
      item = choose_review(items, name)

      if not item:
        LOG.info('No FC 27 result: %s (%s)', name, card['id'])
        continue

      snippet = item['snippet']
      thumbnails = snippet.get('thumbnails', {})
      thumbnail = next(
          (
              thumbnails[size]['url']
              for size in ('high', 'medium', 'default')
              if thumbnails.get(size, {}).get('url')
          ),
          '',
      )

      db.table('card_reviews').upsert(
          {
              'card_id': card['id'],
              'youtube_video_id': item['id']['videoId'],
              'title': html.unescape(snippet.get('title', '')),
              'channel_title': html.unescape(snippet.get('channelTitle', '')),
              'thumbnail_url': thumbnail,
          },
          on_conflict='card_id',
      ).execute()

      saved += 1
      LOG.info('Saved %s OVR %s (card %s)', name, card['overall'], card['id'])

    except Exception as exc:
      failed += 1
      reasons = set()
      try:
        payload = json.loads(getattr(exc, 'content', b'{}'))
        reasons = {
            e.get('reason') for e in payload.get('error', {}).get('errors', [])
        }
      except (ValueError, TypeError, AttributeError):
        pass
      status = getattr(getattr(exc, 'resp', None), 'status', None)
      LOG.warning(
          'Card %s failed (%s, HTTP %s)', card['id'], type(exc).__name__, status
      )
      if (
          reasons
          & {
              'quotaExceeded',
              'dailyLimitExceeded',
              'dailyLimitExceededUnreg',
              'keyInvalid',
              'accessNotConfigured',
              'rateLimitExceeded',
          }
          or status == 429
      ):
        LOG.warning(
          'YouTube quota/configuration limit reached; stopping safely.'
        )
        break

  LOG.info(
      'Finished: %s searches, %s saved, %s failed', searched, saved, failed
  )
  return 1 if failed else 0


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument(
      '--limit',
      type=positive_limit,
      default=25,
      help='Maximum cards/searches per run (1–100; default: 25)',
  )
  args = parser.parse_args()
  logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

  from dotenv import load_dotenv
  from googleapiclient.discovery import build
  from supabase import create_client

  load_dotenv(Path(__file__).with_name('.env'))
  required = ('YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
  missing = [key for key in required if not os.getenv(key)]
  if missing:
    parser.error('Missing environment variables: ' + ', '.join(missing))

  youtube = None
  try:
    db = create_client(
        os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY']
    )
    youtube = build(
        'youtube',
        'v3',
        developerKey=os.environ['YOUTUBE_API_KEY'],
        cache_discovery=False,
    )
    return collect(db, youtube, args.limit)
  except Exception as exc:
    LOG.error('Collection could not start (%s)', type(exc).__name__)
    return 1
  finally:
    if youtube:
      youtube.close()


if __name__ == '__main__':
  raise SystemExit(main())