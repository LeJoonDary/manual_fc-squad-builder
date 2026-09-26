# 특수 카드 특성 재동기화

루트의 `sync_special_traits.py`는 `special_cards.json` 353장의 특성만 교체합니다.

```sh
python -m pip install "psycopg[binary]" python-dotenv
python sync_special_traits.py          # 조회 및 사전 검증
python -m unittest test_sync_special_traits -v
python sync_special_traits.py --apply  # 전체 교체 및 커밋 후 재조회
```

`.env.local`, `.env`의 `DATABASE_URL`을 사용합니다. `supabase/.temp/pooler-url`이 있으면 기존 프로젝트 방식대로 해당 풀러에 DATABASE_URL의 비밀번호로 연결합니다.

`data/special-trait-mapping.json`은 2026-09-26 확인한 FUT.GG 클라이언트의 원본 enum에 기반합니다. 출처 URL과 SHA-256을 함께 저장했습니다. 사용자 확인에 따라 ID 10은 Jockey, 15는 Bruiser입니다. 롤은 원본 ID → 포지션·이름 → DB ID로 변환하며 주·보조 포지션을 모두 검사합니다. 롤 레벨은 배열 이름을 따릅니다. 중복 특성은 최고 등급을 유지합니다.

전체 매핑을 먼저 검증하며 알 수 없는 ID, 누락 카드, 중복 마스터, 잘못된 포지션은 DB 변경 전에 실패합니다. 빈 특성 목록은 해당 카드·테이블의 기존 값을 보존합니다. 비어 있지 않은 목록만 삭제 후 삽입합니다. 전체 교체는 단일 PostgreSQL 트랜잭션에서 실행되어 실패하면 롤백됩니다. 잠금 중에는 다른 쓰기가 잠시 대기할 수 있습니다.

`sync_reports/`에 변경 전 레코드, 삽입 계획, 원본 해시, 커밋 후 검증 결과를 저장합니다. 커밋 전후 353장의 행 전체를 비교하고 펠레, 호나우두, 미아 햄의 JOIN 조회 결과를 터미널에 출력합니다. 백업 파일에는 자격증명이 포함되지 않습니다.
