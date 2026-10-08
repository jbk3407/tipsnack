// .env 의 SHORT_TOKEN + APP_SECRET -> 만료 없는 페이지 토큰(IG_TOKEN) + IG_USER_ID 를 .env 에 기록
// 토큰 값은 화면에 출력하지 않음
const fs = require('fs');
const path = require('path');

const APP_ID = '1738906210739896';
const G = 'https://graph.facebook.com/v26.0';
const envPath = path.join(__dirname, '.env');
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const get = async url => {
  const r = await (await fetch(url)).json();
  if (r.error) throw new Error(r.error.message);
  return r;
};

(async () => {
  if (!env.SHORT_TOKEN || !env.APP_SECRET) throw new Error('.env 에 SHORT_TOKEN, APP_SECRET 을 넣어주세요');
  const long = await get(`${G}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}`
    + `&client_secret=${env.APP_SECRET}&fb_exchange_token=${env.SHORT_TOKEN}`);
  const pages = await get(`${G}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&access_token=${long.access_token}`);
  const page = pages.data.find(p => p.instagram_business_account);
  if (!page) throw new Error('Instagram 이 연결된 페이지가 없습니다');

  const ig = page.instagram_business_account;
  const out = { APP_SECRET: env.APP_SECRET, IG_USER_ID: ig.id, IG_TOKEN: page.access_token };
  fs.writeFileSync(envPath, Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');

  const dbg = await get(`${G}/debug_token?input_token=${page.access_token}&access_token=${APP_ID}|${env.APP_SECRET}`);
  const exp = dbg.data.expires_at ? new Date(dbg.data.expires_at * 1000).toISOString() : '만료 없음';
  console.log(`OK: 페이지 "${page.name}" / @${ig.username} (${ig.id}) / 토큰 만료: ${exp}`);
  console.log('SHORT_TOKEN 은 .env 에서 제거됨');
})().catch(e => { console.error('실패:', e.message); process.exit(1); });
