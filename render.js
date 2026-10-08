// post.json -> out/01.png ... (1080x1350, Instagram 4:5) via headless Chrome
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CHROME = process.env.CHROME || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'chromium');
const HANDLE = '@tip.snack';
const post = JSON.parse(fs.readFileSync(path.join(__dirname, 'post.json'), 'utf8'));
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
const css = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;900&display=block');
*{margin:0;box-sizing:border-box}
body{width:1080px;height:1350px;overflow:hidden;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;background:#FFF4E4;color:#231B14;position:relative}
.blob{position:absolute;border-radius:50%;background:#FFD9B0}
.foot{position:absolute;left:90px;right:90px;bottom:70px;display:flex;justify-content:space-between;font-size:30px;font-weight:700;color:#B2876A}
.kicker{display:inline-block;background:#FF6B2C;color:#fff;font-weight:700;font-size:36px;padding:12px 30px;border-radius:999px}
.key{display:inline-block;background:#fff;border:4px solid #231B14;border-bottom-width:12px;border-radius:24px;padding:18px 38px;font-size:72px;font-weight:900;margin-right:18px}
.plus{font-size:60px;font-weight:900;color:#FF6B2C;margin-right:18px}
`;
const total = post.cards.length + 2;
const foot = i => `<div class="foot"><span>${HANDLE}</span><span>${i} / ${total}</span></div>`;

const slides = [
  `<div class="blob" style="width:760px;height:760px;right:-260px;top:-200px"></div>
   <div class="blob" style="width:420px;height:420px;left:-160px;bottom:-120px;background:#FFE7CC"></div>
   <div style="position:absolute;left:90px;right:90px;top:300px">
     <span class="kicker">${esc(post.cover.kicker)}</span>
     <h1 style="font-size:132px;line-height:1.18;font-weight:900;margin-top:50px;letter-spacing:-4px">${esc(post.cover.title)}</h1>
     <p style="font-size:44px;font-weight:500;margin-top:50px;color:#6B5545">${esc(post.cover.sub)}</p>
   </div>${foot(1)}`,
  ...post.cards.map((c, i) => `
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
     <h2 style="font-size:104px;font-weight:900;letter-spacing:-3px">${esc(post.outro.title)}</h2>
     <p style="font-size:40px;line-height:1.6;margin-top:40px;color:#6B5545">${esc(post.outro.sub)}</p>
     <div style="display:flex;justify-content:center;gap:30px;margin-top:90px">
       ${['📌 저장', '↗ 공유', '+ 팔로우'].map(t => `<span class="kicker" style="font-size:40px;padding:20px 40px">${t}</span>`).join('')}
     </div>
     <p style="font-size:40px;font-weight:700;margin-top:60px;color:#231B14">매일 한 입 꿀팁 ${HANDLE}</p>
   </div>${foot(total)}`,
];

// 피드용 4:5 (out/NN.png) + 릴스용 9:16 (out/reel/NN.png, 같은 카드를 가운데 배치)
const shot = (file, h, body) => {
  const html = file.replace(/\.png$/, '.html');
  const wrap = h === 1350 ? body : `<div style="position:absolute;left:0;top:${(h - 1350) / 2}px;width:1080px;height:1350px">${body}</div>`;
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${css}body{height:${h}px}</style>${wrap}`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=1080,${h}`, '--virtual-time-budget=5000', `--screenshot=${file}`,
    '--no-sandbox', 'file:///' + html.replace(/\\/g, '/').replace(/^\//, '')], { stdio: 'ignore' });
  fs.unlinkSync(html);
};
fs.mkdirSync(path.join(out, 'reel'), { recursive: true });
slides.forEach((body, i) => {
  const name = String(i + 1).padStart(2, '0') + '.png';
  shot(path.join(out, name), 1350, body);
  shot(path.join(out, 'reel', name), 1920, body);
});
fs.writeFileSync(path.join(out, 'caption.txt'), post.caption);
console.log(`rendered ${slides.length} slides -> ${out}`);
