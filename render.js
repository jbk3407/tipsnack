// post.json -> out/01..09.png (캐러셀 4:5) + out/reel/*.png (릴스 장면 상태 9:16) + out/render.json (매니페스트)
// v2: 사랑 콘텐츠 + 릴스 전용 대본(reel.scenes). v1(과거 꿀팁) 은 TIPSNACK_ALLOW_LEGACY=1 일 때만 렌더.
// 글자 넘침은 Chrome 에서 실제 레이아웃을 재서(data-fit) 매니페스트에 기록하고, check.js 가 판정한다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { validate, contentHash, FADE, TYPING, loadHistory, compareHistory } = require('./lib/post');

const CHROME = process.env.CHROME || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'chromium');
const HANDLE = '@tip.snack';
const BRAND = '매일 한 입, 다정한 사랑 @tip.snack';
const root = __dirname;
const out = path.join(root, 'out');
const post = JSON.parse(fs.readFileSync(path.join(root, 'post.json'), 'utf8'));

const LEGACY = process.env.TIPSNACK_ALLOW_LEGACY === '1';
const v = validate(post, { allowLegacy: LEGACY });
v.warnings.forEach(x => console.log('경고:', x));
if (v.errors.length) {
  console.error('post.json 검증 실패 (렌더하지 않음):\n- ' + v.errors.join('\n- '));
  process.exit(1);
}
// 이력 비교: 직전과 같은 카테고리, 감정 3연속, 같은 표지 제목, 내용 유사도 초과는 렌더하지 않는다
let historyInfo = null;
if (v.version === 2 && !LEGACY) {
  let hist;
  try { hist = loadHistory(root); } catch (err) { console.error(`HISTORY_ERROR posts 폴더를 읽지 못함: ${err.message}`); process.exit(1); }
  if (hist.errors.length) { console.error(`HISTORY_ERROR 읽기 실패: ${hist.errors.join(', ')}`); process.exit(1); }
  const cmp = compareHistory(post, hist.items);
  cmp.warnings.forEach(x => console.log('경고:', x));
  if (cmp.errors.length) {
    console.error('기존 게시물과 겹침/이력 규칙 위반 (렌더하지 않음):\n- ' + cmp.errors.join('\n- '));
    process.exit(1);
  }
  historyInfo = { compared: hist.items.length, nearest: cmp.nearest };
  console.log(`이력 비교: ${hist.items.length}건, 가장 비슷한 게시물 ${cmp.nearest.map(x => `${x.slot} ${x.s.toFixed(2)}`).join(', ') || '없음'}`);
}
fs.mkdirSync(path.join(out, 'reel'), { recursive: true });

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
const FIT_SCRIPT = `<pre id="fit" style="display:none">PENDING</pre><script>
document.fonts.ready.then(()=>{const S=JSON.parse(document.body.dataset.safe),bad=[];
for(const el of document.querySelectorAll('[data-fit]')){const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
let lh=parseFloat(cs.lineHeight);if(!lh)lh=parseFloat(cs.fontSize)*1.2;
const h=el.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom),lines=Math.round(h/lh),t=el.textContent.trim().slice(0,24);
if(el.scrollWidth>el.clientWidth+1)bad.push('가로 넘침: '+t);
if(lines>+el.dataset.fit)bad.push('줄 수 초과('+lines+'>'+el.dataset.fit+'): '+t);
if(r.left<S[0]-1||r.top<S[1]-1||r.right>S[2]+1||r.bottom>S[3]+1)bad.push('안전 영역 밖: '+t);}
const els=[...document.querySelectorAll('[data-fit]')].filter(e=>getComputedStyle(e).visibility!=='hidden');
for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect();
const w=Math.min(a.right,b.right)-Math.max(a.left,b.left),h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
if(w>2&&h>2)bad.push('겹침: '+els[i].textContent.trim().slice(0,12)+' / '+els[j].textContent.trim().slice(0,12));}
document.getElementById('fit').textContent=JSON.stringify(bad);});</script>`;

// 한 페이지를 PNG 로 찍는다. fit=true 면 같은 페이지의 레이아웃 검사 결과도 돌려준다.
let n = 0;
function page(file, w, h, css, body, safe, fit) {
  const html = path.join(out, `_page${n++}.html`);
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${css}body{width:${w}px;height:${h}px}</style>`
    + `<body data-safe='${JSON.stringify(safe)}'>${body}${FIT_SCRIPT}</body>`);
  const url = 'file:///' + html.replace(/\\/g, '/').replace(/^\//, '');
  const base = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-sandbox',
    `--window-size=${w},${h}`, '--virtual-time-budget=6000'];
  execFileSync(CHROME, [...base, `--screenshot=${file}`, url], { stdio: 'ignore' });
  let issues = null;
  if (fit) {
    const dom = execFileSync(CHROME, [...base, '--dump-dom', url], { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = dom.match(/<pre id="fit"[^>]*>([\s\S]*?)<\/pre>/);
    try { issues = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); }
    catch { issues = ['레이아웃 검사 결과를 읽지 못함 (미검증)']; }
  }
  fs.unlinkSync(html);
  if (!fs.existsSync(file)) throw new Error('스크린샷 생성 실패: ' + file);
  return issues;
}

const manifest = {
  renderId: crypto.randomBytes(6).toString('hex'),
  createdAt: new Date().toISOString(),
  version: v.version,
  inputHash: contentHash(post),
  legacy: LEGACY, history: historyInfo,
  carousel: [], fit: { carousel: [], reel: [] }, reel: null,
};

// ───────── v2 캐러셀 (크림·갈색, 주제 라벨 배지, '익숙해져도, 다정하게' 마무리)
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Gowun+Batang:wght@400;700&display=block');`;
const CSS2 = `${FONTS}
*{margin:0;box-sizing:border-box}
body{overflow:hidden;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;background:#FBF5EC;color:#3E2C22;position:relative;word-break:keep-all}
.serif{font-family:'Gowun Batang','Noto Serif KR',serif}
.foot{position:absolute;left:90px;right:90px;bottom:70px;display:flex;justify-content:space-between;font-size:30px;font-weight:700;color:#A88B76}
.pill{display:inline-block;border:3px solid #C2714F;color:#C2714F;font-weight:700;font-size:36px;line-height:52px;padding:6px 30px;border-radius:999px}
.label{display:inline-block;background:#F1E3D3;color:#5C4334;font-weight:700;font-size:38px;line-height:54px;padding:8px 32px;border-radius:999px}
.dot{position:absolute;border-radius:50%;background:#F1E3D3}`;
const SAFE_C = [80, 80, 1000, 1240];

// ───────── 표지 (캐러셀 1장 + 릴스 커버 공용). 제목이 가장 먼저 보이도록 크게, 라벨·부제는 작게.
// style: bold(크림 바탕) / dark(진한 갈색 바탕, 고대비) / bubble(제목을 노란 말풍선으로). emphasis 는 강조색+형광펜
const COVER = {
  bold:   { bg: '#FBF5EC', ink: '#2B1D15', em: '#C2582F', mark: '#F7D7B5', kicker: '#A88B76', sub: '#6E5646', dot: '#F1E3D3' },
  dark:   { bg: '#35251C', ink: '#FFF4E6', em: '#FFC56E', mark: 'transparent', kicker: '#CDAE95', sub: '#E6D3C1', dot: '#4A3529' },
  bubble: { bg: '#FBF5EC', ink: '#1E1E1E', em: '#B4441F', mark: 'transparent', kicker: '#A88B76', sub: '#6E5646', dot: '#F1E3D3' },
};
// 제목 한 줄의 대략적인 폭(em): 한글 1, 공백 0.32, 영문·숫자·문장부호 0.55
const emw = l => [...l].reduce((s, ch) => s + (ch === ' ' ? 0.32 : /[\x21-\x7e“”‘’…·]/.test(ch) ? 0.55 : 1), 0);
function coverBody(p, H, footHtml) {
  const c = p.cover, st = c.style || 'bold', k = COVER[st] || COVER.bold;
  const tall = H > 1400;
  const lines = c.title.split('\n');
  const maxW = st === 'bubble' ? 800 : 900;
  // 짧은 제목일수록 크게 (최대 168/180px). 실제 넘침은 data-fit 이 다시 잰다
  const size = Math.min(tall ? 180 : 168, Math.floor(maxW / (Math.max(...lines.map(emw)) * 0.97)));
  const mark = s => (c.emphasis && s.includes(c.emphasis))
    ? esc(s).replace(esc(c.emphasis), `<span style="color:${k.em};background:linear-gradient(transparent 60%, ${k.mark} 60%)">${esc(c.emphasis)}</span>`) : esc(s);
  const title = `<h1 data-fit="${lines.length}" style="font-size:${size}px;line-height:${Math.round(size * 1.16)}px;font-weight:900;letter-spacing:-0.03em;color:${k.ink}">${lines.map(mark).join('<br>')}</h1>`;
  const head = st === 'bubble'
    ? `<div style="display:flex;align-items:center;gap:18px;margin-bottom:26px"><div style="width:76px;height:76px;border-radius:30px;background:#F1E3D3;color:#C2714F;font-size:34px;font-weight:900;display:flex;align-items:center;justify-content:center">${esc([...(p.reel && p.reel.chatName || '너')][0])}</div>
        <span style="font-size:32px;color:${k.kicker};font-weight:700">${esc(c.kicker)}</span></div>
       <div style="align-self:flex-start;background:#FEE500;border-radius:56px;border-top-left-radius:12px;padding:44px 56px;box-shadow:0 10px 0 rgba(0,0,0,.06)">${title}</div>`
    : `<div data-fit="1" style="font-size:32px;line-height:44px;font-weight:700;letter-spacing:0.08em;color:${k.kicker};margin-bottom:34px">— ${esc(c.kicker)}</div>${title}`;
  const top = tall ? 360 : 110, bottom = tall ? 420 : 250;
  return `<div style="position:absolute;inset:0;background:${k.bg}"></div>
    <div class="dot" style="width:560px;height:560px;right:-230px;top:-200px;background:${k.dot}"></div>
    <div style="position:absolute;left:90px;right:90px;top:${top}px;bottom:${bottom}px;display:flex;flex-direction:column;justify-content:center">
      ${head}
      <p data-fit="1" style="font-size:${tall ? 44 : 40}px;line-height:${tall ? 62 : 56}px;font-weight:500;margin-top:44px;color:${k.sub}">${esc(c.sub)}</p>
    </div>${footHtml(k)}`;
}

function carouselV2(p) {
  const total = p.cards.length + 2;
  const foot = i => `<div class="foot"><span>${HANDLE}</span><span>${i} / ${total}</span></div>`;
  return [
    coverBody(p, 1350, k => `<div style="position:absolute;right:90px;top:1110px;font-size:38px;line-height:56px;font-weight:700;color:${k.em}">옆으로 넘겨 보세요 →</div>
      <div class="foot" style="color:${k.kicker}"><span>${HANDLE}</span><span>1 / ${total}</span></div>`),
    // 카드: 위쪽 진행 막대(흐름 위치) + 아래쪽 연결 문장(bridge → 다음 장)으로 한 이야기처럼 이어지게
    ...p.cards.map((c, i) => `
     <div class="dot" style="width:420px;height:420px;right:-170px;top:-150px"></div>
     <div style="position:absolute;left:90px;right:90px;top:150px;display:flex;gap:12px">
       ${p.cards.map((_, j) => `<div style="flex:1;height:10px;border-radius:5px;background:${j <= i ? '#C2714F' : '#EADBC9'}"></div>`).join('')}
     </div>
     <div style="position:absolute;left:90px;right:90px;top:290px">
       <span class="label" data-fit="1">${esc(c.label)}</span>
       <h2 data-fit="1" style="font-size:86px;line-height:110px;font-weight:900;margin-top:52px;letter-spacing:-2px">${esc(c.title)}</h2>
       <p data-fit="2" style="font-size:46px;line-height:72px;font-weight:500;margin-top:30px;color:#5C4334">${esc(c.desc)}</p>
       <div class="serif" data-fit="2" style="margin-top:56px;background:#FFFDF9;border-left:10px solid #C2714F;border-radius:20px;padding:30px 40px;font-size:42px;line-height:62px;font-weight:700;color:#3E2C22">${esc(c.example)}</div>
     </div>
     ${c.bridge ? `<div data-fit="1" style="position:absolute;left:90px;right:90px;top:1110px;font-size:40px;line-height:58px;font-weight:700;color:#C2714F">${esc(c.bridge)} →</div>` : ''}${foot(i + 2)}`),
    `<div class="dot" style="width:820px;height:820px;left:130px;top:170px"></div>
     <div style="position:absolute;left:90px;right:90px;top:420px;text-align:center">
       <h2 class="serif" data-fit="1" style="font-size:82px;line-height:110px;font-weight:700">${esc(p.outro.title)}</h2>
       <p data-fit="2" style="font-size:46px;line-height:72px;margin-top:56px;color:#5C4334">${esc(p.outro.sub)}</p>
       <p data-fit="1" style="font-size:34px;line-height:48px;font-weight:700;margin-top:110px;color:#C2714F">${esc(BRAND)}</p>
     </div>${foot(total)}`,
  ];
}

// ───────── 과거(v1) 캐러셀: 기존 디자인 그대로 (호환 렌더 전용)
const CSS1 = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;900&display=block');
*{margin:0;box-sizing:border-box}
body{overflow:hidden;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;background:#FFF4E4;color:#231B14;position:relative}
.blob{position:absolute;border-radius:50%;background:#FFD9B0}
.foot{position:absolute;left:90px;right:90px;bottom:70px;display:flex;justify-content:space-between;font-size:30px;font-weight:700;color:#B2876A}
.kicker{display:inline-block;background:#FF6B2C;color:#fff;font-weight:700;font-size:36px;padding:12px 30px;border-radius:999px}
.key{display:inline-block;background:#fff;border:4px solid #231B14;border-bottom-width:12px;border-radius:24px;padding:18px 38px;font-size:72px;font-weight:900;margin-right:18px}
.plus{font-size:60px;font-weight:900;color:#FF6B2C;margin-right:18px}`;
function carouselV1(p) {
  const total = p.cards.length + 2;
  const foot = i => `<div class="foot"><span>${HANDLE}</span><span>${i} / ${total}</span></div>`;
  return [
    `<div class="blob" style="width:760px;height:760px;right:-260px;top:-200px"></div>
     <div class="blob" style="width:420px;height:420px;left:-160px;bottom:-120px;background:#FFE7CC"></div>
     <div style="position:absolute;left:90px;right:90px;top:300px">
       <span class="kicker">${esc(p.cover.kicker)}</span>
       <h1 style="font-size:132px;line-height:1.18;font-weight:900;margin-top:50px;letter-spacing:-4px">${esc(p.cover.title)}</h1>
       <p style="font-size:44px;font-weight:500;margin-top:50px;color:#6B5545">${esc(p.cover.sub)}</p>
     </div>${foot(1)}`,
    ...p.cards.map((c, i) => `
     <div class="blob" style="width:520px;height:520px;right:-200px;top:-180px"></div>
     <div style="position:absolute;left:90px;top:120px;font-size:150px;font-weight:900;color:#FF6B2C;letter-spacing:-6px">${String(i + 1).padStart(2, '0')}</div>
     <div style="position:absolute;left:90px;right:90px;top:400px">
       <div>${c.keys.map(k => `<span class="key">${esc(k)}</span>`).join('<span class="plus">+</span>')}</div>
       <h2 style="font-size:96px;font-weight:900;margin-top:70px;letter-spacing:-3px">${esc(c.title)}</h2>
       <p style="font-size:46px;line-height:1.55;font-weight:500;margin-top:30px;color:#4A3A2E">${esc(c.desc)}</p>
       <div style="margin-top:60px;background:#fff;border-radius:28px;padding:34px 44px;font-size:38px;font-weight:700;color:#FF6B2C">💡 ${esc(c.example)}</div>
     </div>${foot(i + 2)}`),
    `<div class="blob" style="width:900px;height:900px;left:90px;top:120px;background:#FFE2C2"></div>
     <div style="position:absolute;left:90px;right:90px;top:360px;text-align:center">
       <h2 style="font-size:104px;font-weight:900;letter-spacing:-3px">${esc(p.outro.title)}</h2>
       <p style="font-size:40px;line-height:1.6;margin-top:40px;color:#6B5545">${esc(p.outro.sub)}</p>
       <div style="display:flex;justify-content:center;gap:30px;margin-top:90px">
         ${['📌 저장', '↗ 공유', '+ 팔로우'].map(t => `<span class="kicker" style="font-size:40px;padding:20px 40px">${t}</span>`).join('')}
       </div>
       <p style="font-size:40px;font-weight:700;margin-top:60px;color:#231B14">매일 한 입 꿀팁 ${HANDLE}</p>
     </div>${foot(total)}`,
  ];
}

// ───────── 캐러셀 렌더
const isV2 = v.version === 2;
const slides = isV2 ? carouselV2(post) : carouselV1(post);
slides.forEach((body, i) => {
  const name = String(i + 1).padStart(2, '0') + '.png';
  const issues = page(path.join(out, name), 1080, 1350, isV2 ? CSS2 : CSS1, body, SAFE_C, isV2);
  manifest.carousel.push(name);
  if (issues) manifest.fit.carousel.push({ file: name, issues });
});
fs.writeFileSync(path.join(out, 'caption.txt'), post.caption);

// ───────── 릴스 장면 상태
// 릴스 UI(하단 캡션·우측 버튼)에 가리지 않는 안전 영역: 좌 90 / 우 150 / 위 260 / 아래 440 px
const SAFE_R = [90, 260, 930, 1480];
const CSS_R = `${CSS2}
.box{position:absolute;left:90px;top:260px;width:840px;height:1220px;display:flex;flex-direction:column;justify-content:center;gap:34px}
.slabel{font-size:36px;line-height:52px;font-weight:700;color:#A88B76;margin-bottom:10px}
.brand{font-size:32px;line-height:46px;font-weight:700;color:#C2714F;margin-bottom:20px}
.line{font-family:'Gowun Batang',serif;font-size:62px;line-height:92px;font-weight:700;color:#3E2C22;text-align:center}
.b{max-width:700px;font-size:48px;line-height:68px;font-weight:500;padding:26px 40px;border-radius:44px}
.me{align-self:flex-end;background:#C2714F;color:#fff;border-bottom-right-radius:12px}
.you{align-self:flex-start;background:#FFFDF9;color:#3E2C22;border:3px solid #EADBC9;border-bottom-left-radius:12px}
.hide{visibility:hidden}
.line.hook{font-family:'Noto Sans KR',sans-serif;font-size:88px;line-height:120px;font-weight:900;letter-spacing:-0.03em;color:#2B1D15}
.chat{position:absolute;inset:0;background:#BACEE0}
.chead{position:absolute;left:0;right:0;top:150px;height:100px;display:flex;align-items:center;gap:26px;padding:0 60px;font-size:40px;font-weight:700;color:#1E1E1E}
.chead .back{font-size:60px;font-weight:400;line-height:60px}
.cbody{position:absolute;left:60px;right:150px;top:280px;bottom:540px;display:flex;flex-direction:column;justify-content:flex-end;gap:18px;overflow:hidden}
.cinput{position:absolute;left:60px;right:150px;top:1396px;height:84px;background:#fff;border-radius:42px;display:flex;align-items:center;padding:0 38px;font-size:32px;color:#A9A9A9}
.sys{align-self:center;background:rgba(0,0,0,.16);color:#fff;font-size:30px;line-height:44px;padding:6px 28px;border-radius:999px;margin:8px 0;white-space:nowrap}
.row{display:flex;align-items:flex-end;gap:12px}
.row.cme{justify-content:flex-end}
.av{width:92px;height:92px;border-radius:36px;background:#F1E3D3;flex:none;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;color:#C2714F;align-self:flex-start}
.avsp{width:92px;flex:none}
.col{display:flex;flex-direction:column;gap:8px}
.nm{font-size:30px;line-height:40px;color:#3A3A3A}
.kb{max-width:600px;font-size:44px;line-height:62px;font-weight:500;padding:20px 30px;border-radius:30px;color:#1E1E1E}
.cme .kb{background:#FEE500;border-top-right-radius:8px}
.cyou .kb{background:#fff;border-top-left-radius:8px}
.tm{font-size:26px;line-height:34px;color:#4E5968;white-space:nowrap}
.dots{display:inline-flex;gap:12px;align-items:center;height:62px}.dots i{width:16px;height:16px;border-radius:50%;background:#9AA5B1;display:block}.dots i:nth-child(2){opacity:.7}.dots i:nth-child(3){opacity:.45}
.line.big{font-family:'Noto Sans KR',sans-serif;font-size:84px;line-height:114px;font-weight:900;letter-spacing:-0.03em;color:#C2582F}`;

// 메신저 대화방 화면 (말풍선만 있는 장면). history = 바로 앞의 연속된 대화 장면들 → 위에 남고 새 메시지가 아래에 쌓임
// typingAt: 이 장면의 typingAt 번째 메시지 자리에 '입력 중…' 말풍선을 대신 보여 줌 (답장 직전 긴장감)
function chatBody(history, s, si, shown, last, name, typingAt = -1) {
  const msgs = [];
  const pushScene = (sc, idx, visibleN, current) => {
    if (sc.label) msgs.push({ sys: sc.label, current });
    sc.items.forEach((it, j) => msgs.push({ ...it, time: `오후 9:${String(12 + idx).padStart(2, '0')}`, hide: j >= visibleN && !(current && j === typingAt), dots: current && j === typingAt, current }));
  };
  history.forEach(h => pushScene(h.s, h.si, h.s.items.length, false));
  if (last) msgs.push({ sys: BRAND, current: true });
  pushScene(s, si, shown, true);
  const html = msgs.map((m, i) => {
    const fit = m.current ? ' data-fit="1"' : '';
    if (m.sys) return `<div class="sys"${fit}>${esc(m.sys)}</div>`;
    const prev = msgs[i - 1], next = msgs[i + 1];
    const first = !prev || prev.sys || prev.who !== m.who;          // 같은 사람 연속 메시지의 첫 번째
    const tail = !next || next.sys || next.who !== m.who;           // 마지막에만 시간 표시
    const bf = m.current && !m.dots ? ' data-fit="2"' : '';
    const body = m.dots ? '<span class="dots"><i></i><i></i><i></i></span>' : esc(m.text);
    const tm = tail && !m.dots ? `<span class="tm">${m.time}</span>` : '';
    const cls = m.hide ? ' hide' : '';
    if (m.who === 'me') return `<div class="row cme${cls}">${tm}<div class="kb"${bf}>${body}</div></div>`;
    return `<div class="row cyou${cls}">${first ? `<div class="av">${esc([...name][0])}</div>` : '<div class="avsp"></div>'}
      <div class="col">${first ? `<div class="nm">${esc(name)}</div>` : ''}<div class="row"><div class="kb"${bf}>${body}</div>${tm}</div></div></div>`;
  }).join('');
  return `<div class="chat"><div class="chead"><span class="back">‹</span><span>${esc(name)}</span></div>
    <div class="cbody">${html}</div><div class="cinput">메시지 입력</div></div>`;
}

// 첫 장면에서도 표지 강조어(cover.emphasis)를 같은 강조색으로
const hookMark = t => { const em = post.cover && post.cover.emphasis; return em && t.includes(em) ? esc(t).replace(esc(em), `<span style="color:#C2582F">${esc(em)}</span>`) : esc(t); };
// hook=true: 첫 장면(1번 카드). 영상 첫 프레임이자 기본 커버가 되므로 크고 굵게
function sceneBody(s, shown, last, hook) {
  // 아직 등장하지 않은 문장도 자리는 차지(visibility:hidden) → 새 문장이 나올 때 기존 문장이 움직이지 않음
  const items = s.items.map((it, j) => {
    const cls = j < shown ? '' : ' hide';
    return it.who
      ? `<div class="b ${it.who}${cls}" data-fit="2">${esc(it.text)}</div>`
      : `<div class="line${hook ? ' hook' : it.big ? ' big' : ''}${cls}" data-fit="2">${hook ? hookMark(it.text) : esc(it.text)}</div>`;
  }).join('');
  return `<div class="dot" style="width:520px;height:520px;right:-200px;top:-160px"></div>
    <div class="box">${last ? `<div class="brand" data-fit="1">${esc(BRAND)}</div>` : ''}
    ${s.label ? `<div class="slabel" data-fit="1">${esc(s.label)}</div>` : ''}${items}</div>`;
}

const readT = require('./lib/post').readTime;
if (isV2) {
  const states = [], scenes = [];
  const chatName = post.reel.chatName || '너';
  const isChat = s => s.items.every(it => it.who);
  let t = 0, history = [];
  post.reel.scenes.forEach((s, si) => {
    const last = si === post.reel.scenes.length - 1;
    const start = t;
    const chat = isChat(s);
    if (!chat) history = [];
    const body = (k, typingAt) => chat ? chatBody(history, s, si, k, last, chatName, typingAt) : sceneBody(s, k, last, si === 0);
    // 문장 k 는 (등장 + 읽기) 시간만큼 머문다. 남는 시간은 마지막 문장에 붙여 여운으로 쓴다.
    const base = s.items.map((it, k) => (si === 0 && k === 0 ? 0 : FADE) + readT(it.text));
    const extra = s.dur - base.reduce((a, b) => a + b, 0) - (chat ? s.items.filter(it => it.typing).length * TYPING : 0);
    // 첫 장면(후킹): 첫 문장은 0초에 이미 완성 상태(페이드 없음 → 읽기 시간만 머묾), 둘째 문장(답장·반전)은 곧바로 이어 등장.
    // 커버는 reel-cover.png(cover_url)가 맡으므로 첫 프레임을 '완성 장면'으로 고정할 필요 없이 초반 리듬을 우선한다
    s.items.forEach((it, k) => {
      // typing: 답장 직전 '입력 중…' 상태를 TYPING 초 먼저 보여 준다
      if (it.typing && chat) {
        const tf = `reel/s${si + 1}-${k + 1}t.png`;
        page(path.join(out, tf), 1080, 1920, CSS_R, body(k, k), SAFE_R, false);
        states.push({ file: tf, dur: TYPING, scene: si + 1, item: k + 1, style: 'chat', typing: true });
        t += TYPING;
      }
      const file = `reel/s${si + 1}-${k + 1}.png`;
      const full = k === s.items.length - 1;
      const issues = page(path.join(out, file), 1080, 1920, CSS_R, body(k + 1), SAFE_R, full);
      if (issues) manifest.fit.reel.push({ file, issues });
      const dur = base[k] + (full ? extra : 0);
      states.push({ file, dur: +dur.toFixed(3), scene: si + 1, item: k + 1, style: chat ? 'chat' : 'card', ...(si === 0 ? { hook: true } : {}) });
      t += dur;
    });
    if (chat) history.push({ s, si });
    scenes.push({ index: si + 1, start: +start.toFixed(3), end: +t.toFixed(3), last: states[states.length - 1].file });
  });
  manifest.reel = { mode: 'scenes', transition: 'fade', fade: FADE, states, scenes, total: +t.toFixed(3) };
  // 릴스 커버 이미지 (publish 가 cover_url 로 지정). 프로필 그리드는 가운데 4:5 로 잘리므로 제목은 가운데 영역에
  const coverIssues = page(path.join(out, 'reel-cover.png'), 1080, 1920, CSS2, coverBody(post, 1920,
    k => `<div style="position:absolute;left:0;right:0;top:1560px;text-align:center;font-size:32px;font-weight:700;color:${k.kicker}">${esc(BRAND)}</div>`),
    [90, 300, 990, 1560], true);
  manifest.reelCover = 'reel-cover.png';
  manifest.fit.reel.push({ file: 'reel-cover.png', issues: coverIssues });
  fs.writeFileSync(path.join(out, 'reel-caption.txt'), post.reel.caption);
} else {
  // 과거 형식: 캐러셀 카드를 세로 화면에 배치해 장당 3초 (기존 방식)
  const states = [];
  slides.forEach((body, i) => {
    const file = `reel/${String(i + 1).padStart(2, '0')}.png`;
    page(path.join(out, file), 1080, 1920, CSS1 + 'body{height:1920px}',
      `<div style="position:absolute;left:0;top:285px;width:1080px;height:1350px">${body}</div>`, [0, 0, 1080, 1920], false);
    states.push({ file, dur: i === slides.length - 1 ? 3 : 2.6, scene: i + 1, item: 1 });
  });
  let t = 0;
  const scenes = states.map(s => { const sc = { index: s.scene, start: t, end: +(t + s.dur).toFixed(3), last: s.file }; t += s.dur; return sc; });
  manifest.reel = { mode: 'legacy-slides', transition: 'slideleft', fade: FADE, states, scenes, total: +t.toFixed(3) };
  fs.writeFileSync(path.join(out, 'reel-caption.txt'), post.caption);
}

fs.writeFileSync(path.join(out, 'render.json'), JSON.stringify(manifest, null, 2));
const fitBad = [...manifest.fit.carousel, ...manifest.fit.reel].filter(f => f.issues.length);
console.log(`렌더 완료 v${v.version} renderId=${manifest.renderId}: 캐러셀 ${manifest.carousel.length}장, 릴스 상태 ${manifest.reel.states.length}개, ${manifest.reel.total}초`);
if (fitBad.length) console.log('레이아웃 문제:\n' + fitBad.map(f => `- ${f.file}: ${f.issues.join(', ')}`).join('\n'));
