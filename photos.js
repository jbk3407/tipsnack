// 릴스 '카톡 사진' 실사 생성: reel.photos.<이름> 이 { "prompt": "..." } 이면 Cloudflare Workers AI(FLUX.1 schnell, 무료 한도)로
// out/photo-<이름>.jpg 를 만든다. 문자열(SVG 본문)인 사진은 render.js 가 직접 그린다.
// 키: .env 의 CF_ACCOUNT_ID / CF_API_TOKEN (값은 출력하지 않는다). PHOTO_MOCK=1 이면 회색 자리표시 이미지(테스트용).
const fs = require('fs');
const path = require('path');

const root = __dirname, out = path.join(root, 'out');
const post = JSON.parse(fs.readFileSync(path.join(root, 'post.json'), 'utf8'));
const jobs = Object.entries((post.reel && post.reel.photos) || {}).filter(([, v]) => v && typeof v === 'object');
if (!jobs.length) process.exit(0);
fs.mkdirSync(out, { recursive: true });

const env = { ...process.env };
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i > 0 && !env[l.slice(0, i)]) env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const fail = m => { console.error(`PHOTO_ERROR: ${m}\n→ 이 사진(들)을 reel.photos 와 대화에서 빼고 다시 render 하면 사진 없이 게시할 수 있다.`); process.exit(1); };

// 폰으로 찍은 생활 사진 느낌 + 글자·사람 얼굴·상표 없음 (모든 프롬프트 뒤에 붙임)
const STYLE = 'casual smartphone photo taken at home in Korea, natural indoor light, realistic, slightly imperfect framing, '
  + 'no text, no letters, no logos, no brand names, no watermark, no people, no faces';
const GRAY_JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

(async () => {
  for (const [k, v] of jobs) {
    const file = path.join(out, `photo-${k}.jpg`);
    if (env.PHOTO_MOCK === '1') { fs.writeFileSync(file, GRAY_JPG); console.log(`사진 ${k}: 자리표시(PHOTO_MOCK)`); continue; }
    if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) fail('.env 에 CF_ACCOUNT_ID / CF_API_TOKEN 없음');
    const body = { prompt: `${v.prompt}. ${STYLE}`, steps: 8 };
    let res, json;
    try {
      res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000),
      });
      json = await res.json();
    } catch (e) { fail(`${k}: 요청 실패 (${e.message})`); }
    const img = json && json.result && json.result.image;
    if (!res.ok || !img) fail(`${k}: HTTP ${res.status} ${JSON.stringify((json && json.errors) || '').slice(0, 300)} (무료 한도 초과면 다음 날 00:00 UTC 에 초기화)`);
    fs.writeFileSync(file, Buffer.from(img, 'base64'));
    console.log(`사진 ${k}: 생성 (${Math.round(fs.statSync(file).size / 1024)}KB)`);
  }
})();
