// post.json 형식 검증 + 공용 상수. render/check/publish 가 모두 이 파일을 쓴다.
const crypto = require('crypto');

const CATEGORIES = [
  '다정하게 말하기',
  '고마움과 애정 표현',
  '취향과 작은 이야기를 기억하는 배려',
  '평범한 하루의 설렘',
  '서로의 시간과 경계 존중',
  '서운함을 솔직하고 부드럽게 전하기',
  '다툰 뒤 다시 대화하기',
];
const FORMATS = ['practical', 'story']; // practical = 다정한 대화형, story = 일상 이야기형
// 지어낸 근거·단정·통제형 연애기술로 흐르지 않게 막는 최소 금칙어
const BANNED = ['MBTI', '애착유형', '애착 유형', '밀당', '질투 유발', '질투나게', '연구에 따르면', '연구 결과', '통계적으로', '전문가에 따르면', '전문가들은'];
const FADE = 0.4;                 // 릴스 문장 등장(페이드) 시간, 초
const REEL_TOTAL = [20, 45];      // 허용 범위 (권장 25~40). 릴스가 캐러셀 7장 내용을 모두 다루므로
const SCENE_DUR = [2.5, 8];
// 완성된 문장을 읽는 데 필요한 시간(초): 기본 0.9초 + 글자(공백 제외)당 0.11초
const readTime = t => 0.9 + [...String(t).replace(/\s/g, '')].length * 0.11;
// 장면에 필요한 최소 시간: 문장마다 (등장 애니메이션 + 읽기 시간)
const sceneMinDur = items => items.reduce((s, it) => s + FADE + readTime(it.text), 0);

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
  if (!CATEGORIES.includes(p.category)) e.push(`category: 다음 중 하나여야 함 → ${CATEGORIES.join(' / ')}`);
  if (!FORMATS.includes(p.format)) e.push('format: "practical"(대화형) 또는 "story"(이야기형)');
  text(p.summary, 'summary', 60);

  if (!p.cover) e.push('cover 누락');
  else { text(p.cover.kicker, 'cover.kicker', 10); text(p.cover.title, 'cover.title', 9, 2); text(p.cover.sub, 'cover.sub', 22); }

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
    if (!p.caption.includes('@tip.snack')) e.push('caption: "매일 한 입, 다정한 사랑 @tip.snack" 소개 문구 필요');
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
    if (!Array.isArray(r.scenes) || r.scenes.length < 5 || r.scenes.length > 10) e.push(`reel.scenes: 5~10개 (현재 ${Array.isArray(r.scenes) ? r.scenes.length : 0}개)`);
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
        if (!Array.isArray(s.items) || s.items.length < 1 || s.items.length > 3) return e.push(`${n}.items: 1~3개`);
        s.items.forEach((it, j) => {
          text(it.text, `${n}.items[${j}].text`, 16);
          if (it.who !== undefined && !['me', 'you'].includes(it.who)) e.push(`${n}.items[${j}].who: "me" 또는 "you"`);
        });
        if (typeof s.dur !== 'number' || !Number.isFinite(s.dur)) return e.push(`${n}.dur: 숫자(초)여야 함`);
        if (s.dur < SCENE_DUR[0] || s.dur > SCENE_DUR[1]) e.push(`${n}.dur: ${SCENE_DUR[0]}~${SCENE_DUR[1]}초 (현재 ${s.dur})`);
        const need = sceneMinDur(s.items);
        if (s.dur + 1e-9 < need) e.push(`${n}.dur: 문장을 읽기에 짧음 (최소 ${need.toFixed(1)}초, 현재 ${s.dur})`);
        total += s.dur;
      });
      const miss = [1, 2, 3, 4, 5, 6, 7].filter(k => !covered.has(k));
      if (miss.length) e.push(`릴스가 캐러셀 ${miss.join(', ')}번 카드 내용을 다루지 않음 (scenes[].card 로 1~7 모두 연결)`);
      if (total < REEL_TOTAL[0] || total > REEL_TOTAL[1]) e.push(`릴스 전체 길이: ${REEL_TOTAL[0]}~${REEL_TOTAL[1]}초 (현재 ${total.toFixed(1)})`);
      else if (total < 25 || total > 40) w.push(`릴스 전체 길이 ${total.toFixed(1)}초 (권장 25~40초)`);
    }
  }

  const all = JSON.stringify({ ...p, visualReview: undefined });
  for (const b of BANNED) if (all.includes(b)) e.push(`금칙어 "${b}" 포함 (단정·지어낸 근거·통제형 표현 금지)`);
  return { version: 2, errors: e, warnings: w };
}

module.exports = { CATEGORIES, FORMATS, FADE, REEL_TOTAL, readTime, sceneMinDur, validate, contentHash, hashtags };
