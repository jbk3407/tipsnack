# 매일 게시 루틴 (@tip.snack)

매일 07:00, 15:00 KST 에 클라우드 루틴이 이 문서를 그대로 따른다. 사람 개입 없이 끝까지 진행하고, 실패하면 원인을 남기고 멈춘다.

## 0. 준비
실행 위치는 사용자 PC(Windows)의 `C:\Users\LT01-P022-2301\tipsnack`. 셸은 Bash(Git Bash) 기준.
- `git pull -q` 로 최신화.
- `.env` 에 `IG_TOKEN`, `IG_USER_ID` 가 있어야 한다 (publish.js 가 자동으로 읽음). 없으면 즉시 중단하고 보고. **토큰 값은 절대 출력·커밋하지 않는다.**
- `node_modules` 가 없으면 `npm ci`. Chrome 은 `C:/Program Files/Google/Chrome/Application/chrome.exe` 를 render.js 가 자동 사용.
- (클라우드에서 돌릴 경우에만) 환경변수로 토큰을 받고, Chromium 은 `apt-get install -y chromium fonts-noto-cjk fonts-noto-color-emoji` 후 `CHROME` 지정.
- 게시 슬롯 `$D` = KST 날짜 + 오전/오후: `D=$(date +%F)-$( [ $(date +%H) -lt 12 ] && echo am || echo pm )` (PC 시계가 KST. Git Bash 는 `TZ=Asia/Seoul` 을 무시하므로 쓰지 말 것) (예 `2026-10-09-am`).
  `posts/$D/published.json` 이 이미 있으면 이 슬롯은 게시 완료 → 아무것도 하지 말고 종료.

## 1. 주제 고르기
- `posts/*/post.json` 의 `topic` 을 모두 읽어 지금까지 다룬 주제 목록을 만든다. 겹치거나 아주 비슷한 주제는 금지.
- 카테고리는 아래를 순서대로 돌린다 (직전 게시물과 다른 카테고리, 같은 날 오전·오후도 서로 다르게):
  업무·디지털(엑셀/윈도우/맥/스마트폰/AI 도구) → 생활·살림 → 자기계발·습관 → 음식·요리 → 여행·외출
- **금지**: 세금·금리·지원금·법·의료·투자처럼 숫자/제도가 바뀌거나 틀리면 해가 되는 주제, 시사 뉴스, 특정 브랜드 비방, 저작권 있는 문구 인용.
- 확실히 아는 사실만 쓴다. 단축키·메뉴 이름처럼 검증 가능한 것은 정확해야 한다. 애매하면 그 항목은 빼고 다른 팁으로.

## 2. post.json 작성
루트의 `post.json` 을 오늘 내용으로 덮어쓴다. 형식은 기존 파일과 동일:
- `topic`: 짧은 주제명
- `cover`: `kicker`(카테고리 라벨, 예 "업무 꿀팁"), `title`(두 줄, `\n` 으로 구분, 한 줄 9자 이내), `sub`(한 줄)
- `cards`: 정확히 7개. 각 `keys`(키 모양 배지로 표시됨. 단축키 주제면 키 이름들, 아니면 핵심 키워드 1개, 6자 이내, 이모지 1개 포함 가능), `title`(12자 이내), `desc`(두 줄, 줄당 20자 이내), `example`(25자 이내)
- `outro`: `title` 은 "오늘의 팁 스낵 끝 🍪" 고정, `sub` 는 주의사항/기준 한두 줄
- `caption`: 기존과 같은 구조 (후킹 한 줄 → 7개 요약 → 마무리 → "매일 한 입 꿀팁은 @tip.snack" → 해시태그 8~12개, 마지막은 #팁스낵)

## 3. 렌더링 + 검수
- `node render.js` → `out/01.png ~ 09.png`, `out/reel/*.png`
- `node reel.js` → `out/reel.mp4`
- **반드시 out/01.png, 05.png, 09.png 를 열어서 직접 본다.** 글자가 박스를 넘치거나, 잘리거나, 네모(□)로 깨지면 post.json 문구를 줄이고 다시 렌더링. 3회 실패하면 중단.

## 4. 게시
- `mkdir -p posts/$D && cp out/0*.png out/reel.mp4 out/caption.txt post.json posts/$D/`
- `git add -A && git commit -m "post: $D <topic>" && git push origin HEAD:main`
- `node publish.js posts/$D` (Pages 배포를 알아서 기다린 뒤 캐러셀 + 릴스 게시, `published.json` 생성)
- `git add -A && git commit -m "published: $D" && git push origin HEAD:main`

## 5. 보고
마지막 메시지에 주제, 캐러셀/릴스 링크, 문제가 있었다면 그 내용을 짧게 적는다.
