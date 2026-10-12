# tipsnack

Instagram @tip.snack 자동 게시. 콘셉트: **익숙해져도 다정하게 — 사랑하는 사람과 오래, 예쁘게 사랑하는 연습.**
매일 07:00·15:00 KST 에 Claude 데스크톱 로컬 예약 작업(`tipsnack-daily-post`)이 [ROUTINE.md](ROUTINE.md) 를 따라
주제를 고르고 `post.json` 을 쓴 뒤 `run.sh` 로 렌더·검수·게시한다. 슬롯마다 캐러셀 1개 + 릴스 1개.

## 흐름
| 명령 | 하는 일 |
|---|---|
| `bash run.sh prepare` | `git pull`, 의존성 확인, 이번 슬롯이 게시됐으면 `DONE`, 아니면 최근 30일 이력 출력 (`history.js`) |
| `bash run.sh render` | `out/` 초기화 → `render.js` → `reel.js` → `check.js`. 슬롯당 3회까지 (`.state/`) |
| `bash run.sh publish` | `publish.js --gate` 통과 시 `posts/<슬롯>/` 로 복사·커밋·푸시 → 게시 → `published.json` 커밋·푸시 |

## 파일
- `lib/post.js` — post.json(v2) 스키마 검증(카테고리·감정·표지 스타일·첫 장면 후킹 규칙), 읽기 시간 규칙, 내용 해시, 이력 비교(직전 카테고리·감정 연속·표지 제목·글자 2-gram 유사도 0.3)
- `render.js` — 캐러셀 9장(`out/01..09.png`) + 릴스 장면 상태(`out/reel/s<장면>-<문장>.png`) + `out/render.json`. Chrome 으로 실제 레이아웃을 재서 글자 넘침을 기록
- `render.js` 릴스: 말풍선만 있는 장면은 메신저 대화방 화면(연속 장면은 메시지가 쌓임), 나머지는 크림색 카드 화면
- 릴스 구성 `reel.mode`: `focus`(한 상황 집중, 새 게시물 기본) / `summary`(카드 1~7 요약, 생략 시 기본값·기존 호환). 연출: `typing`(답장 전 '입력 중…' 0.8초), `big`(강조 한 줄). 장면 여유 시간 상한(1.5초, 마지막 2.5초)
- `reel.js` — 장면 상태를 xfade 로 이어 `out/reel.mp4` (1080x1920, 30fps, H.264, 무음 AAC). 문장이 실제로 페이드인되며 등장
- `render.js` 표지: bold/dark/bubble 스타일, 제목 크기 자동, 강조어. 같은 디자인으로 릴스 커버 `out/reel-cover.png`. 릴스 첫 장면은 0초부터 완성된 후킹 문장
- `check.js` — 최종 MP4 검수: 디코딩, 길이=시간표, 규격, 오디오, 장면 프레임=입력, 빈/중복 장면, 움직임, 첫 프레임, 전개 속도(같은 화면 최장 5초), 글자 넘침, 이력 비교. `out/check/report.{json,md}`, `scene-N.png`, `motion-*.png`, `first-frame.png`, `reel-sheet.png`, `covers.png`, `timeline.png`(2초 간격)
- `publish.js` — 게이트(보고서 통과·해시 일치·육안 검수 renderId) + Instagram Graph API 게시. 캐러셀=`caption.txt`, 릴스=`reel-caption.txt` + 커버 `cover_url`(거부 시 첫 프레임). 부분 성공도 즉시 기록
- `history.js` — 최근 30일 이력(표지·상황·요약·릴스 흐름·감정, 최근 분포). 읽기 실패는 `HISTORY_ERROR`
- `examples/*.post.json` — v2 예시 (대화형 / 이야기형)
- `test.js` — 개발 테스트. 코드를 임시 폴더에 복사해 돌리고 게시는 `IG_DRY_RUN=1` 모의 처리 → 운영 데이터 무변경
- `posts/<슬롯>/` — 실제 게시 기록 (공개 URL: GitHub Pages)

## post.json
형식과 규칙은 [ROUTINE.md](ROUTINE.md) 4절. `version` 이 2 가 아니면 예약 경로에서 렌더·게시를 거부한다.
과거 생활 꿀팁 형식(v1)은 `TIPSNACK_ALLOW_LEGACY=1 node render.js` 로만 다시 렌더할 수 있고 게시 게이트는 통과하지 못한다.

## 개발
```bash
FFMPEG=<ffmpeg 경로> node test.js            # 전체 테스트
FFMPEG=<ffmpeg 경로> node test.js --drafts   # + drafts/ 에 시안 저장 (git 제외)
```
운영 폴더가 아닌 별도 클론에서 작업하고, 검증 후 운영 저장소에 반영한다. `.env`(토큰)는 운영 폴더에만 있다.

## 권한
예약 작업은 `~/.claude/settings.json` 의 허용 목록(이 저장소의 `run.sh` 실행, 저장소 파일 읽기, `post.json` 쓰기)만으로 승인 없이 돈다.
작업 흐름을 바꿀 때는 새 명령을 지침에 추가하지 말고 `run.sh` 안에서 바꾼다.

## 되돌리기
코드·지침만 되돌린다 (게시 기록 `posts/` 와 `published.json` 은 건드리지 않음):
```bash
git revert <이번 변경 커밋>
```
