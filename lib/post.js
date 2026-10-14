// post.json 형식 검증 + 공용 상수. render/check/publish 가 모두 이 파일을 쓴다.
const crypto = require('crypto');
const { photoProblems } = require('./photo');
const fs = require('fs');
const path = require('path');

// 엄마(아빠)한테 카톡으로 물어본 살림 꿀팁
const CATEGORIES = ['요리', '세탁·얼룩', '청소', '정리수납', '식재료', '계절 살림', '생활 수리'];
const BRAND = '엄마한테 물어본 꿀팁 @tip.snack';
const CHAT_NAMES = ['엄마', '아빠']; // 릴스 대화 상대. 첫 메시지는 이 이름으로 부르며 시작
// 이전 콘셉트('다정한 사랑') 카테고리: 과거 게시물 호환 렌더(allowLegacy)에서만 허용
const LEGACY_CATEGORIES = [
  '다정하게 말하기',
  '고마움과 애정 표현',
  '취향과 작은 이야기를 기억하는 배려',
  '평범한 하루의 설렘',
  '서로의 시간과 경계 존중',
  '서운함을 솔직하고 부드럽게 전하기',
  '다툰 뒤 다시 대화하기',
];
const FORMATS = ['practical', 'story']; // practical = 다정한 대화형, story = 일상 이야기형
// 이 게시물이 남기는 주된 감정. 갈등 계열(서운함·화해)만 반복되지 않게 이력에서 분포를 본다
const EMOTIONS = ['설렘', '고마움', '편안함', '장난·웃음', '안심·위로', '존중', '서운함', '화해'];
// 표지 스타일: bold(크림 바탕 큰 제목) / dark(진한 갈색 바탕 고대비) / bubble(제목을 말풍선으로)
const COVER_STYLES = ['bold', 'dark', 'bubble'];
const SIM_LIMIT = 0.3;   // 이력 유사도 상한 (글자 2-gram Jaccard). 근거: test.js 의 중복/비중복 실측
const HISTORY_DAYS = 60; // 유사도 비교 기간
// 지어낸 근거·단정·통제형 연애기술로 흐르지 않게 막는 최소 금칙어
const BANNED = ['민간요법', '만병통치', '특효약', 'MBTI', '애착유형', '애착 유형', '밀당', '질투 유발', '질투나게', '연구에 따르면', '연구 결과', '통계적으로', '전문가에 따르면', '전문가들은'];
const FADE = 0.4;                 // 릴스 문장 등장(페이드) 시간, 초
const REEL_TOTAL = [20, 45];      // 허용 범위 (권장 25~40). 릴스가 캐러셀 7장 내용을 모두 다루므로
const SCENE_DUR = [2.5, 8];
// 완성된 문장을 읽는 데 필요한 시간(초): 기본 0.9초 + 글자(공백 제외)당 0.11초
const readTime = t => 0.9 + [...String(t).replace(/\s/g, '')].length * 0.11;
// 장면에 필요한 최소 시간: 문장마다 (등장 애니메이션 + 읽기 시간)
const TYPING = 0.8;               // 상대 답장 전 '입력 중…' 말풍선 노출 시간 (item.typing)
const sceneMinDur = items => items.reduce((s, it) => s + FADE + readTime(it.text) + (it.typing ? TYPING : 0), 0);
// 릴스 구성: summary = 캐러셀 1~7번 카드를 모두 짧게 담음(기존) / focus = 한 상황·대화에 집중(카드 전부 필요 없음)
const REEL_MODES = { summary: { scenes: [5, 10], total: [20, 45], rec: [25, 40] }, focus: { scenes: [5, 12], total: [15, 50], rec: [25, 48] } };
const MAX_SLACK = 1.5, MAX_SLACK_LAST = 2.5; // 장면 시간 - 필요 시간: 같은 화면이 오래 멈춰 있지 않게

const hashtags = s => (String(s).match(/#[^\s#]+/g) || []);
// visualReview 는 렌더 이후 육안 검수 기록이라 해시에서 제외 (기록해도 재렌더 불필요)
const contentHash = post => {
  const { visualReview, ...rest } = post;
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
};

function validate(p, { allowLegacy = false } = {}) {
  const e = [], w = [];
  if (!p || typeof p !== 'object') return { version: 0, errors: ['post.json 이 객체가 아님'], warnings: [] };

  const text = (v, name, max, lines = 1) => {
    if (typeof v !== 'string' || !v.trim()) return e.push(`${name}: 비어 있음`);
    const ls = v.split('\n');
    if (ls.length > lines) e.push(`${name}: ${lines}줄 이하여야 함 (현재 ${ls.length}줄)`);
    ls.forEach((l, i) => {
      const n = [...l].length;
      if (n > max) e.push(`${name}${ls.length > 1 ? ` ${i + 1}번째 줄` : ''}: ${max}자 이하여야 함 (현재 ${n}자)`);
    });
  };

  if (p.version !== 2) {
    // 과거 형식(v1, 생활 꿀팁): 예전 게시물 재렌더 같은 호환 경로에서만 허용
    if (!allowLegacy) return { version: 1, errors: ['version 이 2 가 아님: 예약 게시는 새 형식(version 2)만 허용'], warnings: [] };
    if (!p.cover || !Array.isArray(p.cards) || !p.outro || typeof p.caption !== 'string') e.push('과거 형식 필수 필드(cover/cards/outro/caption) 누락');
    else p.cards.forEach((c, i) => { if (!Array.isArray(c.keys)) e.push(`cards[${i}].keys 누락`); });
    return { version: 1, errors: e, warnings: w };
  }

  text(p.topic, 'topic', 24);
  if (!CATEGORIES.includes(p.category) && !(allowLegacy && LEGACY_CATEGORIES.includes(p.category))) e.push(`category: 다음 중 하나여야 함 → ${CATEGORIES.join(' / ')}`);
  if (!FORMATS.includes(p.format)) e.push('format: "practical"(대화형) 또는 "story"(이야기형)');
  text(p.summary, 'summary', 60);
  // 기획 메타데이터: 중복 판단용. 과거 v2 게시물에는 없으므로 호환 렌더(allowLegacy)에서만 생략 허용
  if (!allowLegacy || p.situation !== undefined) text(p.situation, 'situation', 40);
  if (!allowLegacy || p.emotion !== undefined) if (!EMOTIONS.includes(p.emotion)) e.push(`emotion: 다음 중 하나 → ${EMOTIONS.join(' / ')}`);

  if (!p.cover) e.push('cover 누락');
  else {
    text(p.cover.kicker, 'cover.kicker', 10); text(p.cover.title, 'cover.title', 9, 2); text(p.cover.sub, 'cover.sub', 22);
    if (!allowLegacy || p.cover.style !== undefined) if (!COVER_STYLES.includes(p.cover.style)) e.push(`cover.style: ${COVER_STYLES.join(' / ')}`);
    if (p.cover.emphasis !== undefined) {
      text(p.cover.emphasis, 'cover.emphasis', 6);
      if (typeof p.cover.emphasis === 'string' && !String(p.cover.title).split('\n').some(l => l.includes(p.cover.emphasis))) e.push('cover.emphasis: cover.title 한 줄 안에 그대로 있는 표현이어야 함');
    }
    if (!allowLegacy && typeof p.cover.title === 'string' && p.cover.title.replace(/\s/g, '') === String(p.topic).replace(/\s/g, '')) e.push('cover.title: 주제명을 그대로 쓰지 말고 궁금증·공감이 생기는 문구로');
  }

  if (!Array.isArray(p.cards) || p.cards.length !== 7) e.push(`cards: 정확히 7개여야 함 (현재 ${Array.isArray(p.cards) ? p.cards.length : 0}개)`);
  else p.cards.forEach((c, i) => {
    if (c.keys) e.push(`cards[${i}].keys: 과거 형식 필드. label 을 사용`);
    text(c.label, `cards[${i}].label`, 8);
    text(c.title, `cards[${i}].title`, 12);
    text(c.desc, `cards[${i}].desc`, 18, 2);
    text(c.example, `cards[${i}].example`, 18, 2);
    // 다음 장으로 이어 주는 연결 문장: 1~6번 필수, 7번 선택
    if (i < 6 || c.bridge !== undefined) text(c.bridge, `cards[${i}].bridge`, 20);
  });

  if (!p.outro) e.push('outro 누락');
  else { text(p.outro.title, 'outro.title', 12); text(p.outro.sub, 'outro.sub', 16, 2); }

  text(p.caption, 'caption', 400, 30);
  const ct = hashtags(p.caption);
  if (typeof p.caption === 'string') {
    if (!p.caption.includes(allowLegacy ? '@tip.snack' : BRAND)) e.push(`caption: "${BRAND}" 소개 문구 필요`);
    if (ct.length < 2 || ct.length > 6) e.push(`caption 해시태그: 2~6개 (현재 ${ct.length}개)`);
    if (new Set(ct).size !== ct.length) e.push('caption 해시태그 중복');
  }

  const r = p.reel;
  if (!r || typeof r !== 'object') e.push('reel 누락 (릴스 전용 대본 필요)');
  else {
    text(r.caption, 'reel.caption', 250, 12);
    if (typeof r.caption === 'string') {
      const rt = hashtags(r.caption);
      if (rt.length > 4) e.push(`reel.caption 해시태그: 4개 이하 (현재 ${rt.length}개)`);
      if (r.caption.trim() === String(p.caption).trim()) e.push('reel.caption: 캐러셀 캡션과 같으면 안 됨');
      if ((r.caption.match(/^\s*\d+[.)]/gm) || []).length >= 3) e.push('reel.caption: 캐러셀식 번호 목록 요약 금지');
    }
    if (r.chatName !== undefined) text(r.chatName, 'reel.chatName', 8);
    // reel.photos: 카톡으로 보내는 사진 { 이름: SVG 본문 } (lib/photo.js). 대화 말풍선 item 의 image 로 참조
    const photos = r.photos === undefined ? {} : r.photos;
    if (!photos || typeof photos !== 'object' || Array.isArray(photos)) e.push('reel.photos: { 이름: SVG 본문 } 객체');
    else {
      const names = Object.keys(photos);
      if (names.length > 5) e.push(`reel.photos: 5장 이하 (현재 ${names.length})`);
      for (const k of names) {
        if (!/^[a-z0-9-]{1,20}$/.test(k)) e.push(`reel.photos.${k}: 이름은 영소문자·숫자·- 20자 이내`);
        const ph = photos[k];
        if (ph && typeof ph === 'object') {
          // 실사 생성 프롬프트 (photos.js). 영어 한두 문장, 장면만 묘사
          if (typeof ph.prompt !== 'string' || ph.prompt.trim().length < 20 || ph.prompt.length > 600) e.push(`reel.photos.${k}.prompt: 20~600자 영어 장면 묘사`);
        } else for (const pr of photoProblems(ph)) e.push(`reel.photos.${k}: ${pr}`);
      }
      const used = new Set((Array.isArray(r.scenes) ? r.scenes : []).flatMap(s => (s.items || []).map(it => it.image)).filter(Boolean));
      for (const k of names) if (!used.has(k)) w.push(`reel.photos.${k}: 대화에서 쓰이지 않음`);
      if (!allowLegacy && !names.length) w.push('reel.photos 없음: 상황·과정 사진을 1장 이상 넣는 것이 기본 (ROUTINE.md 사진 절)');
    }
    // 엄마 카톡 형식 (새 게시물 필수): focus 대화 + 엄마/아빠 대화방 + 썸네일(reel.cover) + 끝에 요약 → 다음 질문
    if (!allowLegacy) {
      if (r.mode !== 'focus') e.push('reel.mode: "focus" 여야 함 (엄마 카톡 대화)');
      if (!CHAT_NAMES.includes(r.chatName)) e.push(`reel.chatName: ${CHAT_NAMES.join(' / ')} 중 하나`);
      if (r.cover === undefined) e.push('reel.cover 누락 (릴스 썸네일: 주제가 보이는 큰 제목 + 첫 카톡)');
      const sc = Array.isArray(r.scenes) ? r.scenes : [];
      const end = sc[sc.length - 1], sum = sc[sc.length - 2];
      if (!sum || !sum.summary) e.push('reel.scenes: 끝에서 두 번째 장면은 요약(summary: true)');
      if (!end || end.summary || !Array.isArray(end.items) || end.items.some(it => it.who)) e.push('reel.scenes: 마지막 장면은 말풍선 없는 마무리 질문 (예: 다음엔 엄마한테 / 뭘 물어볼까요?)');
    }
    // reel.cover(선택): 릴스 전용 썸네일 = 큰 궁금증 문구 + 대화 말풍선 캡처. 없으면 캐러셀 표지 디자인을 씀
    if (r.cover !== undefined) {
      const rc = r.cover || {};
      text(rc.title, 'reel.cover.title', 10, 2);
      if (rc.emphasis !== undefined && !String(rc.title).split('\n').some(l => l.includes(rc.emphasis))) e.push('reel.cover.emphasis: reel.cover.title 한 줄 안에 있는 표현이어야 함');
      if (!Array.isArray(rc.chat) || rc.chat.length < 1 || rc.chat.length > 3) e.push('reel.cover.chat: 말풍선 1~3개');
      else rc.chat.forEach((c, j) => {
        if (!['me', 'you'].includes(c.who)) e.push(`reel.cover.chat[${j}].who: "me" 또는 "you"`);
        if (c.dots === true) { if (c.text !== undefined) e.push(`reel.cover.chat[${j}]: dots(입력 중)이면 text 없음`); }
        else text(c.text, `reel.cover.chat[${j}].text`, 16);
      });
    }
    const mode = r.mode === undefined ? 'summary' : r.mode;
    if (!REEL_MODES[mode]) e.push('reel.mode: "summary"(카드 1~7 요약) 또는 "focus"(한 상황 집중)');
    const M = REEL_MODES[mode] || REEL_MODES.summary;
    if (!Array.isArray(r.scenes) || r.scenes.length < M.scenes[0] || r.scenes.length > M.scenes[1]) e.push(`reel.scenes: ${mode} 모드는 ${M.scenes[0]}~${M.scenes[1]}개 (현재 ${Array.isArray(r.scenes) ? r.scenes.length : 0}개)`);
    else {
      let total = 0;
      const covered = new Set();
      r.scenes.forEach((s, i) => {
        const n = `reel.scenes[${i}]`;
        // card: 이 장면이 다루는 캐러셀 카드 번호(1~7). 릴스가 게시물 전체 흐름을 담는지 검사하는 데 쓴다
        if (s.card !== undefined) {
          if (!Number.isInteger(s.card) || s.card < 1 || s.card > 7) e.push(`${n}.card: 1~7 정수`);
          else covered.add(s.card);
        }
        if (s.label !== undefined) text(s.label, `${n}.label`, 18);
        // summary: 끝부분 요약 장면(체크 목록 2~5줄). 뒤에 말풍선 없는 마무리 문장 장면 1개까지 허용
        const maxItems = s.summary ? 5 : 3;
        if (s.summary !== undefined && s.summary !== true) e.push(`${n}.summary: true 만 가능`);
        const last = r.scenes[r.scenes.length - 1];
        const outroAfter = i === r.scenes.length - 2 && !last.summary && Array.isArray(last.items) && !last.items.some(it => it.who);
        if (s.summary && i !== r.scenes.length - 1 && !outroAfter) e.push(`${n}.summary: 요약은 마지막 장면(또는 마무리 문장 장면 바로 앞)에만`);
        if (s.summary && Array.isArray(s.items) && s.items.some(it => it.who)) e.push(`${n}: 요약 장면에는 말풍선(who) 불가`);
        if (!Array.isArray(s.items) || s.items.length < (s.summary ? 2 : 1) || s.items.length > maxItems) return e.push(`${n}.items: ${s.summary ? 2 : 1}~${maxItems}개`);
        s.items.forEach((it, j) => {
          text(it.text, `${n}.items[${j}].text`, 16);
          if (it.typing !== undefined && (it.typing !== true || !it.who)) e.push(`${n}.items[${j}].typing: 말풍선(who) 문장에만 true`);
          if (it.typing && i === 0) e.push(`${n}.items[${j}].typing: 첫 장면은 0초부터 보여야 하므로 사용 불가`);
          if (it.typing && !s.items.every(x => x.who)) e.push(`${n}.items[${j}].typing: 대화방 장면(모든 문장에 who)에서만 사용`);
          if (it.big !== undefined && (it.big !== true || it.who)) e.push(`${n}.items[${j}].big: 가운데 문장(who 없음)에만 true`);
          if (it.who !== undefined && !['me', 'you'].includes(it.who)) e.push(`${n}.items[${j}].who: "me" 또는 "you"`);
          if (it.image !== undefined && (!it.who || !(r.photos && r.photos[it.image]))) e.push(`${n}.items[${j}].image: 말풍선(who) 에서 reel.photos 에 있는 이름만`);
        });
        if (typeof s.dur !== 'number' || !Number.isFinite(s.dur)) return e.push(`${n}.dur: 숫자(초)여야 함`);
        const maxDur = s.summary ? 10 : SCENE_DUR[1]; // 요약은 목록이 길어 10초까지
        if (s.dur < SCENE_DUR[0] || s.dur > maxDur) e.push(`${n}.dur: ${SCENE_DUR[0]}~${maxDur}초 (현재 ${s.dur})`);
        const need = sceneMinDur(s.items);
        const slack = i === r.scenes.length - 1 ? MAX_SLACK_LAST : MAX_SLACK;
        if (!allowLegacy && s.dur > Math.max(SCENE_DUR[0], need) + slack + 1e-9) e.push(`${n}.dur: 필요한 시간(${need.toFixed(1)}초)보다 ${slack}초 넘게 길어 화면이 멈춰 보임 (최대 ${(Math.max(SCENE_DUR[0], need) + slack).toFixed(1)}초)`);
        if (s.dur + 1e-9 < need) e.push(`${n}.dur: 문장을 읽기에 짧음 (최소 ${need.toFixed(1)}초, 현재 ${s.dur})`);
        total += s.dur;
      });
      const miss = [1, 2, 3, 4, 5, 6, 7].filter(k => !covered.has(k));
      // 첫 장면(=커버로도 쓰이는 첫 프레임)은 1번 카드의 후킹 장면: 짧고 빠르게
      const s0 = r.scenes[0];
      if (s0 && s0.card !== 1) e.push('reel.scenes[0].card: 첫 장면은 1번 카드(후킹)여야 함');
      if (s0 && Array.isArray(s0.items)) {
        if (s0.items.length > 2) e.push('reel.scenes[0].items: 첫 장면은 2개 이하');
        s0.items.forEach((it, j) => { if ([...String(it.text)].length > 16) e.push(`reel.scenes[0].items[${j}].text: 첫 장면 문장은 16자 이하`); });
        // 대화 상대가 정해져 있으면(chatName) 첫 메시지는 내가 그 사람을 부르며 시작: "엄마 ~ 어떻게 해?"
        const first = s0.items[0];
        if (r.chatName !== undefined && first && !(first.who === 'me' && String(first.text).startsWith(r.chatName))) e.push(`reel.scenes[0].items[0]: 첫 메시지는 내가 "${r.chatName} ~" 로 부르며 시작 (who: "me")`);
        if (typeof s0.dur === 'number' && s0.dur > 5) e.push('reel.scenes[0].dur: 첫 장면은 5초 이하');
      }
      // summary 만 1~7 전부 요구. focus 는 한 상황에 집중하므로 카드 매핑은 선택(첫 장면 card 1 규칙만 유지)
      if (mode === 'summary' && miss.length) e.push(`릴스가 캐러셀 ${miss.join(', ')}번 카드 내용을 다루지 않음 (scenes[].card 로 1~7 모두 연결, 또는 reel.mode "focus")`);
      if (total < M.total[0] || total > M.total[1]) e.push(`릴스 전체 길이: ${mode} 모드는 ${M.total[0]}~${M.total[1]}초 (현재 ${total.toFixed(1)})`);
      else if (total < M.rec[0] || total > M.rec[1]) w.push(`릴스 전체 길이 ${total.toFixed(1)}초 (${mode} 권장 ${M.rec[0]}~${M.rec[1]}초)`);
    }
  }

  const all = JSON.stringify({ ...p, visualReview: undefined });
  for (const b of BANNED) if (all.includes(b)) e.push(`금칙어 "${b}" 포함 (단정·지어낸 근거·통제형 표현 금지)`);
  return { version: 2, errors: e, warnings: w };
}

// ───────── 이력 비교 (중복 방지)
const norm = s => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '');
// 내용 지문: 상황·요약·표지·카드 제목/예문·릴스 문장. 주제명만 바꾼 재탕을 잡기 위해 본문 문장까지 넣는다
const signature = p => [p.topic, p.situation, p.summary, p.cover && p.cover.title,
  ...(p.cards || []).flatMap(c => [c.title, c.example]),
  ...((p.reel && p.reel.scenes) || []).flatMap(sc => (sc.items || []).map(i => i.text))].filter(Boolean).join(' ');
const grams = s => { const t = norm(s), g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
function similarity(a, b) {
  const A = grams(signature(a)), B = grams(signature(b));
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / ((A.size + B.size - n) || 1);
}
// posts/<슬롯>/post.json 을 읽는다. 폴더를 못 읽으면 예외(=HISTORY_ERROR), 개별 파일 실패는 errors 로
function loadHistory(root, days = HISTORY_DAYS) {
  const dir = path.join(root, 'posts');
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const items = [], errors = [];
  for (const slot of fs.readdirSync(dir).filter(d => /^\d{4}-\d{2}-\d{2}/.test(d) && d.slice(0, 10) >= since).sort()) {
    try { items.push({ slot, post: JSON.parse(fs.readFileSync(path.join(dir, slot, 'post.json'), 'utf8')) }); }
    catch (err) { errors.push(`${slot}: ${err.message}`); }
  }
  return { items, errors };
}
function compareHistory(p, hist) {
  const e = [], w = [], me = contentHash(p);
  const others = hist.filter(h => contentHash(h.post) !== me); // 같은 게시물(재렌더)은 제외
  const v2 = others.filter(h => h.post.version === 2);
  const last = v2[v2.length - 1];
  if (last && last.post.category === p.category) e.push(`category: 직전 게시물(${last.slot})과 같은 카테고리 "${p.category}"`);
  if (last && last.post.format === p.format) w.push(`format: 직전 게시물(${last.slot})과 같은 ${p.format}`);
  const lastEmo = v2.slice(-2).map(h => h.post.emotion);
  if (lastEmo.length === 2 && lastEmo.every(x => x === p.emotion)) e.push(`emotion: 최근 2개와 같은 "${p.emotion}" 3연속`);
  if (['서운함', '화해'].includes(p.emotion) && v2.slice(-1).some(h => ['서운함', '화해'].includes(h.post.emotion))) e.push('emotion: 갈등 계열(서운함·화해) 연속');
  const title = norm(p.cover && p.cover.title);
  const scores = others.map(h => ({ slot: h.slot, topic: h.post.topic, s: similarity(p, h.post) })).sort((a, b) => b.s - a.s);
  for (const x of scores) if (x.s >= SIM_LIMIT) e.push(`내용이 ${x.slot}(${x.topic})와 너무 비슷함 (유사도 ${x.s.toFixed(2)} ≥ ${SIM_LIMIT})`);
  for (const h of others) if (h.post.cover && norm(h.post.cover.title) === title) e.push(`cover.title 이 ${h.slot} 과 같음`);
  return { errors: e, warnings: w, nearest: scores.slice(0, 3) };
}

module.exports = { CATEGORIES, BRAND, CHAT_NAMES, FORMATS, EMOTIONS, COVER_STYLES, SIM_LIMIT, FADE, TYPING, REEL_MODES, REEL_TOTAL, readTime, sceneMinDur, validate, contentHash, hashtags,
  similarity, loadHistory, compareHistory };
