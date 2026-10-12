// node publish.js --gate          : out/ 이 게시 가능한 상태인지 검사만 (run.sh publish 가 복사 전에 호출)
// node publish.js posts/<슬롯>     : 해당 폴더의 01.png.. 를 캐러셀로, reel.mp4 를 릴스로 게시
// 캐러셀은 caption.txt, 릴스는 reel-caption.txt 를 쓴다.
// 게시할 때마다 published.json 에 바로 기록 → 캐러셀만 성공하고 릴스가 실패해도 다음 실행이 캐러셀을 다시 올리지 않는다.
// IG_DRY_RUN=1 이면 실제 API 호출 없이 무엇을 어떤 캡션으로 올릴지만 출력 (테스트용, 토큰 불필요).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { contentHash } = require('./lib/post');

const G = 'https://graph.facebook.com/v26.0';
const BASE = process.env.PUBLIC_BASE || 'https://jbk3407.github.io/tipsnack';
const DRY = process.env.IG_DRY_RUN === '1';
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const fail = msg => { console.error('실패:', msg); process.exit(1); };

// 검수 보고서·해시·육안 검수 기록이 모두 이번 렌더와 일치해야 게시 가능
function gate(dir) {
  const rp = path.join(dir, fs.existsSync(path.join(dir, 'check')) ? 'check/report.json' : 'report.json');
  if (!fs.existsSync(rp)) return 'report.json 없음 → run.sh render 먼저';
  const rep = JSON.parse(fs.readFileSync(rp, 'utf8'));
  if (!rep.ok) return '검수 보고서가 실패 상태';
  if (rep.version !== 2) return '새 형식(version 2)만 게시 가능';
  if (rep.legacy) return '호환 렌더(TIPSNACK_ALLOW_LEGACY) 결과는 게시 불가';
  const post = JSON.parse(fs.readFileSync(path.join(dir, dir === OUT ? '../post.json' : 'post.json'), 'utf8'));
  if (contentHash(post) !== rep.inputHash) return 'post.json 이 검수한 렌더 이후 바뀜 → 다시 render';
  for (const [f, h] of Object.entries(rep.outputs)) {
    if (!fs.existsSync(path.join(dir, f))) return `${f} 없음`;
    if (sha(path.join(dir, f)) !== h) return `${f} 가 검수한 파일과 다름`;
  }
  const vr = post.visualReview;
  if (!vr || vr.renderId !== rep.renderId) return `육안 검수 기록 없음: post.json 의 visualReview.renderId 를 "${rep.renderId}" 로`;
  if (vr.carousel !== '통과' || vr.reel !== '통과') return 'visualReview 의 carousel/reel 이 "통과" 가 아님';
  return null;
}
const OUT = path.join(__dirname, 'out');

if (process.argv[2] === '--gate') {
  const err = gate(OUT);
  if (err) fail(err);
  console.log('게시 가능: 검수 통과 + 육안 검수 기록 확인');
  process.exit(0);
}

const dir = process.argv[2];
if (!dir) fail('사용법: node publish.js --gate | posts/YYYY-MM-DD-am');
{ const err = gate(dir); if (err) fail(`${dir}: ${err}`); }

const env = { ...process.env };
const envFile = path.join(__dirname, '.env');
if (!DRY && fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i > 0 && !env[l.slice(0, i)]) env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const { IG_TOKEN, IG_USER_ID } = env;
if (!DRY && (!IG_TOKEN || !IG_USER_ID)) fail('IG_TOKEN / IG_USER_ID 없음');

const url = f => `${BASE}/${dir.replace(/\\/g, '/')}/${f}`;
const caption = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8');
const reelCaption = fs.readFileSync(path.join(dir, 'reel-caption.txt'), 'utf8');
const recFile = path.join(dir, 'published.json');
const rec = fs.existsSync(recFile) ? JSON.parse(fs.readFileSync(recFile, 'utf8')) : {};
const save = () => fs.writeFileSync(recFile, JSON.stringify({ ...rec, at: new Date().toISOString() }, null, 2));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const api = async (method, p, params = {}) => {
  const body = new URLSearchParams({ ...params, access_token: IG_TOKEN });
  const r = await fetch(method === 'GET' ? `${G}/${p}?${body}` : `${G}/${p}`, method === 'GET' ? {} : { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`${p}: ${j.error.message}`);
  return j;
};
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
  if (DRY) {
    if (!rec.carousel) { rec.carousel = 'DRY-RUN'; console.log(`[DRY] CAROUSEL ${imgs.length}장, caption.txt:\n${caption}\n`); save(); }
    if (!rec.reel) { rec.reel = 'DRY-RUN'; console.log(`[DRY] REELS reel.mp4, cover=${fs.existsSync(path.join(dir, 'reel-cover.png')) ? 'reel-cover.png' : '첫 프레임'}, reel-caption.txt:\n${reelCaption}`); save(); }
    return;
  }
  // 방금 push 한 경우 GitHub Pages 배포를 기다림 (최대 10분)
  const hasCover = fs.existsSync(path.join(dir, 'reel-cover.png'));
  const files = [...imgs, 'reel.mp4', ...(hasCover ? ['reel-cover.png'] : [])];
  for (let i = 0; ; i++) {
    const codes = await Promise.all(files.map(f => fetch(url(f), { method: 'HEAD' }).then(r => r.status)));
    if (codes.every(c => c === 200)) break;
    if (i >= 60) throw new Error('공개 URL 이 열리지 않음: ' + url(files[0]));
    await sleep(10000);
  }
  if (!rec.carousel) {
    const children = [];
    for (const f of imgs) children.push((await api('POST', `${IG_USER_ID}/media`, { image_url: url(f), is_carousel_item: 'true' })).id);
    for (const c of children) await ready(c);
    const carousel = await api('POST', `${IG_USER_ID}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
    rec.carousel = await publish(carousel.id);
    save();
    console.log('캐러셀 게시:', rec.carousel);
  }
  if (!rec.reel) {
    const params = { media_type: 'REELS', video_url: url('reel.mp4'), caption: reelCaption, share_to_feed: 'true' };
    let reel;
    // 커버 이미지 지정(cover_url). 거부되면 커버 없이(=첫 프레임) 다시 만든다. 첫 프레임도 후킹 장면이라 차선책
    if (hasCover) {
      try { reel = await api('POST', `${IG_USER_ID}/media`, { ...params, cover_url: url('reel-cover.png') }); rec.reelCover = 'cover_url'; }
      catch (err) { console.log('cover_url 거부, 첫 프레임 커버로 진행:', err.message); rec.reelCover = `첫 프레임 (cover_url 거부: ${err.message})`; }
    }
    if (!reel) reel = await api('POST', `${IG_USER_ID}/media`, params);
    rec.reel = await publish(reel.id);
    save();
    console.log('릴스 게시:', rec.reel);
  }
})().catch(e => {
  // 부분 성공 기록은 남긴다 (자동으로 둘 다 다시 올리지 않음)
  rec.error = e.message;
  if (rec.carousel || rec.reel) save();
  fail(e.message);
});
