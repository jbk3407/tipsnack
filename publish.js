// node publish.js posts/2026-10-08
// 해당 폴더의 01.png.. 를 캐러셀로, reel.mp4 를 릴스로 게시 (공개 URL = PUBLIC_BASE/<폴더>/<파일>)
const fs = require('fs');
const path = require('path');

const G = 'https://graph.facebook.com/v26.0';
const BASE = process.env.PUBLIC_BASE || 'https://jbk3407.github.io/tipsnack';
const env = { ...process.env };
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i > 0 && !env[l.slice(0, i)]) env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const { IG_TOKEN, IG_USER_ID } = env;
if (!IG_TOKEN || !IG_USER_ID) throw new Error('IG_TOKEN / IG_USER_ID 없음');

const dir = process.argv[2];
if (!dir) throw new Error('사용법: node publish.js posts/YYYY-MM-DD');
const url = f => `${BASE}/${dir.replace(/\\/g, '/')}/${f}`;
const caption = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const api = async (method, p, params = {}) => {
  const body = new URLSearchParams({ ...params, access_token: IG_TOKEN });
  const r = await fetch(method === 'GET' ? `${G}/${p}?${body}` : `${G}/${p}`, method === 'GET' ? {} : { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`${p}: ${j.error.message}`);
  return j;
};
// 컨테이너가 처리 완료될 때까지 대기 (영상은 수십 초 걸림)
const ready = async id => {
  for (let i = 0; i < 60; i++) {
    const { status_code, status } = await api('GET', id, { fields: 'status_code,status' });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`컨테이너 ${id}: ${status}`);
    await sleep(5000);
  }
  throw new Error(`컨테이너 ${id}: 시간 초과`);
};
const publish = async id => {
  await ready(id);
  const { id: mediaId } = await api('POST', `${IG_USER_ID}/media_publish`, { creation_id: id });
  const { permalink } = await api('GET', mediaId, { fields: 'permalink' });
  return permalink;
};

(async () => {
  const imgs = fs.readdirSync(dir).filter(f => /^\d+\.png$/.test(f)).sort();
  const children = [];
  for (const f of imgs) children.push((await api('POST', `${IG_USER_ID}/media`, { image_url: url(f), is_carousel_item: 'true' })).id);
  for (const c of children) await ready(c);
  const carousel = await api('POST', `${IG_USER_ID}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
  const result = { carousel: await publish(carousel.id) };
  console.log('캐러셀 게시:', result.carousel);

  if (fs.existsSync(path.join(dir, 'reel.mp4'))) {
    const reel = await api('POST', `${IG_USER_ID}/media`, { media_type: 'REELS', video_url: url('reel.mp4'), caption, share_to_feed: 'true' });
    result.reel = await publish(reel.id);
    console.log('릴스 게시:', result.reel);
  }
  fs.writeFileSync(path.join(dir, 'published.json'), JSON.stringify({ ...result, at: new Date().toISOString() }, null, 2));
})().catch(e => { console.error('실패:', e.message); process.exit(1); });
