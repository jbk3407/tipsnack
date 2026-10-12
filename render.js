// post.json -> out/01..09.png (캐러셀 4:5) + out/reel/*.png (릴스 장면 상태 9:16) + out/render.json (매니페스트)
// v2: 사랑 콘텐츠 + 릴스 전용 대본(reel.scenes). v1(과거 꿀팁) 은 TIPSNACK_ALLOW_LEGACY=1 일 때만 렌더.
// 글자 넘침은 Chrome 에서 실제 레이아웃을 재서(data-fit) 매니페스트에 기록하고, check.js 가 판정한다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { validate, contentHash, FADE } = require('./lib/post');

const CHROME = process.env.CHROME || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'chromium');
const HANDLE = '@tip.snack';
const BRAND = '매일 한 입, 다정한 사랑 @tip.snack';
const root = __dirname;
const out = path.join(root, 'out');
const post = JSON.parse(fs.readFileSync(path.join(root, 'post.json'), 'utf8'));

const v = validate(post, { allowLegacy: process.env.TIPSNACK_ALLOW_LEGACY === '1' });
v.warnings.forEach(x => console.log('경고:', x));
if (v.errors.length) {
  console.error('post.json 검증 실패 (렌더하지 않음):\n- ' + v.errors.join('\n- '));
  process.exit(1);
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

function carouselV2(p) {
  const total = p.cards.length + 2;
  const foot = i => `<div class="foot"><span>${HANDLE}</span><span>${i} / ${total}</span></div>`;
  return [
    `<div class="dot" style="width:620px;height:620px;right:-220px;top:-180px"></div>
     <div style="position:absolute;left:90px;right:90px;top:330px">
       <span class="pill" data-fit="1">${esc(p.cover.kicker)}</span>
       <h1 data-fit="2" style="font-size:118px;line-height:150px;font-weight:900;margin-top:56px;letter-spacing:-3px">${esc(p.cover.title)}</h1>
       <p data-fit="1" style="font-size:44px;line-height:64px;font-weight:500;margin-top:48px;color:#7A6252">${esc(p.cover.sub)}</p>
     </div>${foot(1)}`,
    ...p.cards.map((c, i) => `
     <div class="dot" style="width:420px;height:420px;right:-170px;top:-150px"></div>
     <div style="position:absolute;left:90px;top:130px;font-size:110px;line-height:120px;font-weight:900;color:#C2714F;letter-spacing:-4px">${String(i + 1).padStart(2, '0')}</div>
     <div style="position:absolute;left:90px;right:90px;top:380px">
       <span class="label" data-fit="1">${esc(c.label)}</span>
       <h2 data-fit="1" style="font-size:86px;line-height:110px;font-weight:900;margin-top:52px;letter-spacing:-2px">${esc(c.title)}</h2>
       <p data-fit="2" style="font-size:46px;line-height:72px;font-weight:500;margin-top:30px;color:#5C4334">${esc(c.desc)}</p>
       <div class="serif" data-fit="2" style="margin-top:56px;background:#FFFDF9;border-left:10px solid #C2714F;border-radius:20px;padding:30px 40px;font-size:42px;line-height:62px;font-weight:700;color:#3E2C22">${esc(c.example)}</div>
     </div>${foot(i + 2)}`),
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
.hide{visibility:hidden}`;

function sceneBody(s, shown, last) {
  // 아직 등장하지 않은 문장도 자리는 차지(visibility:hidden) → 새 문장이 나올 때 기존 문장이 움직이지 않음
  const items = s.items.map((it, j) => {
    const cls = j < shown ? '' : ' hide';
    return it.who
      ? `<div class="b ${it.who}${cls}" data-fit="2">${esc(it.text)}</div>`
      : `<div class="line${cls}" data-fit="2">${esc(it.text)}</div>`;
  }).join('');
  return `<div class="dot" style="width:520px;height:520px;right:-200px;top:-160px"></div>
    <div class="box">${last ? `<div class="brand" data-fit="1">${esc(BRAND)}</div>` : ''}
    ${s.label ? `<div class="slabel" data-fit="1">${esc(s.label)}</div>` : ''}${items}</div>`;
}

const readT = require('./lib/post').readTime;
if (isV2) {
  const states = [], scenes = [];
  let t = 0;
  post.reel.scenes.forEach((s, si) => {
    const last = si === post.reel.scenes.length - 1;
    const start = t;
    // 문장 k 는 (등장 + 읽기) 시간만큼 머문다. 남는 시간은 마지막 문장에 붙여 여운으로 쓴다.
    const base = s.items.map(it => FADE + readT(it.text));
    const extra = s.dur - base.reduce((a, b) => a + b, 0);
    s.items.forEach((_, k) => {
      const file = `reel/s${si + 1}-${k + 1}.png`;
      const full = k === s.items.length - 1;
      const issues = page(path.join(out, file), 1080, 1920, CSS_R, sceneBody(s, k + 1, last), SAFE_R, full);
      if (issues) manifest.fit.reel.push({ file, issues });
      const dur = base[k] + (full ? extra : 0);
      states.push({ file, dur: +dur.toFixed(3), scene: si + 1, item: k + 1 });
      t += dur;
    });
    scenes.push({ index: si + 1, start: +start.toFixed(3), end: +t.toFixed(3), last: states[states.length - 1].file });
  });
  manifest.reel = { mode: 'scenes', transition: 'fade', fade: FADE, states, scenes, total: +t.toFixed(3) };
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
