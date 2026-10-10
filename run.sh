#!/usr/bin/env bash
# 예약 작업 전용 진입점 (권한 허용 목록에 이 스크립트만 등록됨)
#   bash run.sh prepare  -> 최신화, 이번 슬롯 확인, 지금까지 주제 목록 출력
#   bash run.sh render   -> post.json 으로 카드 + 릴스 렌더링
#   bash run.sh publish  -> posts/<슬롯>/ 로 복사, 커밋·푸시, 인스타 게시, 기록 커밋·푸시
set -euo pipefail
cd "$(dirname "$0")"
D=$(date +%F)-$( [ "$(date +%H)" -lt 12 ] && echo am || echo pm )  # PC 시계 = KST

case "${1:-}" in
  prepare)
    git pull -q
    [ -d node_modules ] || npm ci --silent
    if [ -f "posts/$D/published.json" ]; then echo "DONE $D (이미 게시됨, 종료)"; exit 0; fi
    echo "SLOT $D"
    echo "--- 지금까지 다룬 주제 (폴더 / 카테고리 / 주제) ---"
    for f in posts/*/post.json; do
      node -e "const p=require('./$f');console.log('$(basename "$(dirname "$f")")\t'+p.cover.kicker+'\t'+p.topic)"
    done
    ;;
  render)
    node render.js && node reel.js
    ;;
  publish)
    if [ -f "posts/$D/published.json" ]; then echo "이미 게시됨: $D"; exit 0; fi
    mkdir -p "posts/$D"
    cp out/0*.png out/reel.mp4 out/caption.txt post.json "posts/$D/"
    git add -A && git commit -qm "post: $D $(node -p "require('./post.json').topic")" && git push -q origin HEAD:main
    node publish.js "posts/$D"
    git add -A && git commit -qm "published: $D" && git push -q origin HEAD:main
    cat "posts/$D/published.json"
    ;;
  *)
    echo "사용법: bash run.sh prepare|render|publish"; exit 1
    ;;
esac
