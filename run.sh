#!/usr/bin/env bash
# 예약 작업 전용 진입점 (권한 허용 목록에 이 스크립트만 등록됨)
#   bash run.sh prepare  -> 최신화, 이번 슬롯 확인(DONE 이면 종료), 최근 30일 이력 출력
#   bash run.sh render   -> out/ 비우고 post.json 으로 캐러셀 + 릴스 렌더 + 최종 MP4 검수 (슬롯당 최대 3회)
#   bash run.sh publish  -> 게이트 통과 시 posts/<슬롯>/ 로 복사, 커밋·푸시, 인스타 게시, 기록 커밋·푸시
set -euo pipefail
cd "$(dirname "$0")"
D=$(date +%F)-$( [ "$(date +%H)" -lt 12 ] && echo am || echo pm )  # PC 시계 = KST
mkdir -p .state

case "${1:-}" in
  prepare)
    git pull -q
    [ -d node_modules ] || npm ci --silent
    if [ -f "posts/$D/published.json" ]; then echo "DONE $D (이미 게시됨, 종료)"; exit 0; fi
    echo "SLOT $D"
    node history.js
    ;;
  render)
    if [ -f "posts/$D/published.json" ]; then echo "DONE $D (이미 게시됨, 렌더하지 않음)"; exit 0; fi
    n=$(( $(cat ".state/render-$D" 2>/dev/null || echo 0) + 1 ))
    if [ "$n" -gt 3 ]; then echo "중단: $D 슬롯 렌더 시도 3회 초과"; exit 1; fi
    echo "$n" > ".state/render-$D"
    echo "렌더 시도 $n/3 ($D)"
    rm -rf out
    node render.js
    node reel.js
    node check.js
    ;;
  publish)
    if [ -f "posts/$D/published.json" ]; then echo "이미 게시됨: $D"; exit 0; fi
    node publish.js --gate
    mkdir -p "posts/$D"
    cp out/0*.png out/reel.mp4 out/caption.txt out/reel-caption.txt out/check/report.json out/check/report.md post.json "posts/$D/"
    git add "posts/$D" post.json && git commit -qm "post: $D $(node -p "require('./post.json').topic")" && git push -q origin HEAD:main
    rc=0; node publish.js "posts/$D" || rc=$?
    if [ -f "posts/$D/published.json" ]; then
      git add "posts/$D" && git commit -qm "published: $D" && git push -q origin HEAD:main
      cat "posts/$D/published.json"
    fi
    exit $rc
    ;;
  *)
    echo "사용법: bash run.sh prepare|render|publish"; exit 1
    ;;
esac
