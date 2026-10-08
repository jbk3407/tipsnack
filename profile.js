// 프로필 사진 후보 3종 -> brand/profile-a.png .. (1080x1080, 원형으로 잘려도 안전한 배치)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dir = path.join(__dirname, 'brand');
fs.mkdirSync(dir, { recursive: true });

const base = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@900&display=block');
*{margin:0}body{width:1080px;height:1080px;overflow:hidden;font-family:'Noto Sans KR',sans-serif;display:grid;place-items:center;position:relative}`;
// 한 입 베어문 쿠키: 원 + 오른쪽 위를 배경색 원 3개로 파냄
const bite = (bg, x, y) => [[0, 0, 150], [-120, 70, 110], [90, -120, 110]]
  .map(([dx, dy, r]) => `<div style="position:absolute;left:${x + dx - r}px;top:${y + dy - r}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${bg}"></div>`).join('');

const variants = {
  // A: 주황 배경 + 베어문 크림 쿠키 (글자 없음, 최종 채택)
  a: `<body style="background:#FF6B2C">
      <div style="position:absolute;width:720px;height:720px;border-radius:50%;background:#FFF4E4;left:180px;top:180px"></div>
      ${bite('#FF6B2C', 840, 270)}
      ${[[340, 360, 70], [560, 470, 84], [700, 660, 62], [400, 650, 76], [560, 760, 50], [300, 520, 44]].map(([l, t, s]) => `<div style="position:absolute;left:${l}px;top:${t}px;width:${s}px;height:${s}px;border-radius:50%;background:#7A4A2B"></div>`).join('')}</body>`,
  // B: 크림 배경 + 주황 쿠키 + 흰 "팁"
  b: `<body style="background:#FFF4E4">
      <div style="position:absolute;width:720px;height:720px;border-radius:50%;background:#FF6B2C;left:180px;top:180px"></div>
      ${bite('#FFF4E4', 840, 270)}
      <div style="position:relative;font-size:330px;font-weight:900;color:#fff;letter-spacing:-10px;margin-top:-20px">팁</div></body>`,
  // C: 주황 배경 + 두 줄 워드마크
  c: `<body style="background:#FF6B2C">
      <div style="text-align:center;color:#FFF4E4;line-height:1.02">
        <div style="font-size:260px;font-weight:900;letter-spacing:-8px">팁</div>
        <div style="font-size:150px;font-weight:900;letter-spacing:-4px;color:#231B14">스낵<span style="font-size:110px"> 🍪</span></div>
      </div></body>`,
};

for (const [k, body] of Object.entries(variants)) {
  const html = path.join(dir, `_${k}.html`);
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${base}</style>${body}`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1080,1080', '--virtual-time-budget=5000', `--screenshot=${path.join(dir, `profile-${k}.png`)}`,
    'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
  fs.unlinkSync(html);
}
console.log('brand/profile-a.png, -b, -c');
