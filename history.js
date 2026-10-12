// 최근 30일 게시 이력 출력 (run.sh prepare 가 호출). posts/<슬롯>/ 만 본다 → 개발 시안은 포함되지 않음.
// 읽기 실패는 '이력 없음'으로 숨기지 않고 그대로 출력하고 exit 1.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'posts');
let slots;
try { slots = fs.readdirSync(dir).filter(d => /^\d{4}-\d{2}-\d{2}/.test(d)).sort(); }
catch (e) { console.log(`HISTORY_ERROR posts 폴더를 읽지 못함: ${e.message}`); process.exit(1); }

const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const recent = slots.filter(d => d.slice(0, 10) >= since);
console.log(`--- 최근 30일 게시 이력 (${since} 이후, ${recent.length}건 / 전체 ${slots.length}건) ---`);
if (!recent.length) console.log('(최근 30일 게시 기록 0건 — posts 폴더는 정상적으로 읽음)');
let failed = 0, last = null;
for (const d of recent) {
  let p, pub = null;
  try { p = JSON.parse(fs.readFileSync(path.join(dir, d, 'post.json'), 'utf8')); }
  catch (e) { failed++; console.log(`${d}\t읽기 실패: ${e.message}`); continue; }
  try { pub = JSON.parse(fs.readFileSync(path.join(dir, d, 'published.json'), 'utf8')); } catch { /* 미게시 또는 진행 중 */ }
  const state = !pub ? '미게시' : pub.error ? `부분 게시(${pub.carousel ? '캐러셀' : ''}${pub.reel ? ' 릴스' : ''} 성공, 오류: ${pub.error})` : '게시됨';
  if (p.version === 2) {
    const first = (p.reel && p.reel.scenes || []).flatMap(s => s.items.map(i => i.text)).slice(0, 2).join(' / ');
    console.log(`${d}\t[${p.category}]\t${p.format}\t${p.topic}\t요약: ${p.summary}\t릴스 첫 문장: ${first}\t${state}`);
    last = p;
  } else {
    console.log(`${d}\t[과거 꿀팁: ${p.cover && p.cover.kicker}]\t${p.topic}\t${state}`);
  }
}
if (last) console.log(`직전 새 형식 게시물: category="${last.category}", format="${last.format}" → 이번에는 다른 카테고리, 가능하면 다른 format`);
else console.log('새 형식(version 2) 게시물은 아직 없음 → 아무 카테고리로 시작 가능');
if (failed) { console.log(`HISTORY_ERROR ${failed}건 읽기 실패 — 이력을 확인했다고 보고하지 말 것`); process.exit(1); }
