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
const recent2 = [];
for (const d of recent) {
  let p, pub = null;
  try { p = JSON.parse(fs.readFileSync(path.join(dir, d, 'post.json'), 'utf8')); }
  catch (e) { failed++; console.log(`${d}\t읽기 실패: ${e.message}`); continue; }
  try { pub = JSON.parse(fs.readFileSync(path.join(dir, d, 'published.json'), 'utf8')); } catch { /* 미게시 또는 진행 중 */ }
  const state = !pub ? '미게시' : pub.error ? `부분 게시(${pub.carousel ? '캐러셀' : ''}${pub.reel ? ' 릴스' : ''} 성공, 오류: ${pub.error})` : '게시됨';
  if (p.version === 2) {
    // 중복 판단용: 상황·핵심 대사·전개·감정·결론이 보이도록 여러 줄로
    const lines = (p.reel && p.reel.scenes || []).flatMap(s => s.items.map(i => (i.who ? `[${i.who}] ` : '') + i.text));
    const one = s => String(s || '').replace(/\n/g, ' ');
    console.log(`${d} [${p.category}] ${p.format} 감정:${p.emotion || '(기록 없음)'} — ${p.topic} (${state})`);
    console.log(`    표지: "${one(p.cover && p.cover.title)}" | 상황: ${p.situation || '(기록 없음)'}`);
    console.log(`    요약: ${p.summary}`);
    console.log(`    릴스 흐름: ${lines.slice(0, 3).join(' → ')} … ${lines.slice(-1)[0] || ''}`);
    recent2.push(p);
    last = p;
  } else {
    console.log(`${d} [과거 꿀팁: ${p.cover && p.cover.kicker}] ${p.topic} (${state})`);
  }
}
if (recent2.length) {
  const count = k => Object.entries(recent2.slice(-10).reduce((a, p) => (a[p[k] || '(없음)'] = (a[p[k] || '(없음)'] || 0) + 1, a), {})).map(([x, n]) => `${x} ${n}`).join(', ');
  console.log(`최근 새 형식 10건 분포 — 카테고리: ${count('category')} / 감정: ${count('emotion')} / format: ${count('format')}`);
}
if (last) console.log(`직전 새 형식 게시물: category="${last.category}", format="${last.format}", emotion="${last.emotion || '(없음)'}" → 다른 카테고리 필수(render 가 거부), 가능하면 다른 format·emotion`);
else console.log('새 형식(version 2) 게시물은 아직 없음 → 아무 카테고리로 시작 가능');
if (failed) { console.log(`HISTORY_ERROR ${failed}건 읽기 실패 — 이력을 확인했다고 보고하지 말 것`); process.exit(1); }
