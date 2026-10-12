// 개발용 테스트: node test.js [--drafts]
// 코드만 임시 폴더에 복사해서 돌린다 → 이 저장소의 post.json / posts / out 은 건드리지 않음.
// 게시는 IG_DRY_RUN=1 로 모의 처리 (토큰·.env 불필요, 실제 API 호출 없음).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC = __dirname;
const FFMPEG = process.env.FFMPEG || require('ffmpeg-static');
const CODE = ['lib', 'render.js', 'reel.js', 'check.js', 'publish.js', 'history.js', 'run.sh'];
const example = name => JSON.parse(fs.readFileSync(path.join(SRC, 'examples', name), 'utf8'));
const results = [];

function ws(post, { posts = false } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tipsnack-test-'));
  for (const f of CODE) fs.cpSync(path.join(SRC, f), path.join(d, f), { recursive: true });
  if (posts) fs.cpSync(path.join(SRC, 'posts'), path.join(d, 'posts'), { recursive: true });
  if (post) fs.writeFileSync(path.join(d, 'post.json'), JSON.stringify(post, null, 2));
  return d;
}
const run = (d, cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: d, encoding: 'utf8', env: { ...process.env, FFMPEG, ...env }, maxBuffer: 1 << 26 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const pipeline = (d, env) => {
  for (const s of ['render.js', 'reel.js', 'check.js']) {
    const r = run(d, 'node', [s], env);
    if (r.code !== 0) return { ...r, step: s };
  }
  return { code: 0, out: '', step: 'done' };
};
const report = d => JSON.parse(fs.readFileSync(path.join(d, 'out/check/report.json'), 'utf8'));
const setPost = (d, f) => { const p = JSON.parse(fs.readFileSync(path.join(d, 'post.json'), 'utf8')); f(p); fs.writeFileSync(path.join(d, 'post.json'), JSON.stringify(p, null, 2)); };
const review = d => setPost(d, p => { p.visualReview = { renderId: report(d).renderId, carousel: '통과', reel: '통과', notes: 'test' }; });
function t(name, fn) {
  try { const msg = fn(); results.push([name, '통과', msg || '']); }
  catch (e) { results.push([name, '실패', e.message.slice(0, 300)]); }
}
const expect = (c, m) => { if (!c) throw new Error(m); };

// 1·2. 새 형식 두 시안: 렌더 + 최종 MP4 검수 + 모의 게시 캡션 분리
const drafts = {};
for (const [key, file] of [['practical', 'practical.post.json'], ['story', 'story.post.json']]) {
  t(`새 형식 렌더·검수 (${key})`, () => {
    const d = ws(example(file));
    const r = pipeline(d);
    expect(r.code === 0, `${r.step} 실패: ${r.out}`);
    const rep = report(d);
    expect(rep.ok, '보고서 ok=false');
    drafts[key] = d;
    return `renderId ${rep.renderId}, ${rep.checks.find(c => c.id === '영상 길이 = 장면 시간표').detail}`;
  });
  t(`캡션 분리 + 모의 게시 (${key})`, () => {
    const d = drafts[key]; expect(d, '렌더 실패로 생략');
    review(d);
    expect(run(d, 'node', ['publish.js', '--gate']).code === 0, '게이트 실패');
    const slot = path.join(d, 'posts', 'test-slot'); fs.mkdirSync(slot, { recursive: true });
    for (const f of [...fs.readdirSync(path.join(d, 'out')).filter(f => /^\d+\.png$/.test(f)), 'reel.mp4', 'caption.txt', 'reel-caption.txt'])
      fs.copyFileSync(path.join(d, 'out', f), path.join(slot, f));
    for (const f of ['report.json', 'report.md']) fs.copyFileSync(path.join(d, 'out/check', f), path.join(slot, f));
    fs.copyFileSync(path.join(d, 'post.json'), path.join(slot, 'post.json'));
    const r = run(d, 'node', ['publish.js', 'posts/test-slot'], { IG_DRY_RUN: '1' });
    expect(r.code === 0, r.out);
    const p = example(file);
    const [car, reel] = r.out.split('[DRY] REELS');
    expect(car.includes(p.caption) && !car.includes(p.reel.caption), '캐러셀에 캐러셀 캡션이 안 감');
    expect(reel.includes(p.reel.caption) && !reel.includes(p.caption), '릴스에 릴스 캡션이 안 감');
    return '캐러셀=caption, 릴스=reel.caption';
  });
}

// 3. 과거 형식 호환 렌더 (예약 게시 경로에서는 거부)
t('과거 형식 호환 렌더', () => {
  const old = JSON.parse(fs.readFileSync(path.join(SRC, 'posts/2026-10-12-am/post.json'), 'utf8'));
  const d = ws(old);
  const r = pipeline(d, { TIPSNACK_ALLOW_LEGACY: '1' });
  expect(r.code === 0, `${r.step}: ${r.out}`);
  const r2 = run(ws(old), 'node', ['render.js']);
  expect(r2.code !== 0 && /version 이 2 가 아님/.test(r2.out), '예약 경로(레거시 비허용)에서 과거 형식이 렌더됨');
  // 과거 형식은 게시 게이트도 통과 못 함
  expect(run(d, 'node', ['publish.js', '--gate']).code !== 0, '과거 형식이 게이트 통과');
  return '호환 렌더 OK, 예약 경로·게시 게이트에서는 거부';
});

// 4. 필수 데이터 누락
t('필수 데이터 누락 시 중단', () => {
  const p = example('practical.post.json'); delete p.reel;
  const r = run(ws(p), 'node', ['render.js']);
  expect(r.code !== 0 && /reel 누락/.test(r.out), r.out);
  const p2 = example('practical.post.json'); p2.cards.pop();
  const r2 = run(ws(p2), 'node', ['render.js']);
  expect(r2.code !== 0 && /정확히 7개/.test(r2.out), r2.out);
  return 'reel 누락, cards 6개 → 렌더 거부';
});

// 5. 비정상 장면 시간
t('비정상 장면 시간 입력 시 중단', () => {
  const cases = [[1.0, /2.5~8초|짧음/], ['3', /숫자/], [20, /2.5~8초/], [2.6, /읽기에 짧음/]];
  for (const [dur, re] of cases) {
    const p = example('practical.post.json'); p.reel.scenes[1].dur = dur;
    const r = run(ws(p), 'node', ['render.js']);
    expect(r.code !== 0 && re.test(r.out), `dur=${dur}: ${r.out}`);
  }
  return 'dur 1.0 / "3" / 20 / 읽기 부족 2.6 → 모두 거부';
});

// 6. 긴 문장 넘침 탐지 (글자 수 제한은 통과하지만 실제로 넘치는 경우)
t('긴 문장 넘침 탐지', () => {
  const p = example('practical.post.json'); p.cards[2].title = 'WWWWWWWWWWWW';
  const d = ws(p);
  const r = pipeline(d);
  expect(r.code !== 0 && r.step === 'check.js', '넘침이 통과됨');
  const c = report(d).checks.find(x => x.id.startsWith('텍스트 넘침'));
  expect(c.status === '실패' && /04\.png/.test(c.detail), c.detail); // cards[2] = 표지 다음 세 번째 카드 = 04.png
  return c.detail;
});

// 7. 렌더 후 문구 수정 → 이전 검수로 게시 불가
t('수정 전 검수로 수정 후 데이터 게시 방지', () => {
  const d = drafts.practical; expect(d, '렌더 실패로 생략');
  review(d); // 검수 통과 + 육안 기록까지 된 상태에서
  setPost(d, p => { p.caption = p.caption + '\n수정'; }); // 렌더 없이 문구만 수정
  const g = run(d, 'node', ['publish.js', '--gate']);
  expect(g.code !== 0 && /바뀜/.test(g.out), '게이트: ' + g.out);
  expect(run(d, 'node', ['check.js']).code !== 0, 'check 가 통과');
  return g.out.trim();
});

// 8. 육안 검수 기록 없음 / renderId 불일치
t('육안 검수 기록 없으면 게시 불가', () => {
  const d = drafts.story; expect(d, '렌더 실패로 생략');
  setPost(d, p => { delete p.visualReview; });
  expect(run(d, 'node', ['publish.js', '--gate']).code !== 0, '기록 없이 통과');
  setPost(d, p => { p.visualReview = { renderId: 'deadbeef', carousel: '통과', reel: '통과' }; });
  expect(run(d, 'node', ['publish.js', '--gate']).code !== 0, '다른 renderId 로 통과');
  review(d);
  expect(run(d, 'node', ['publish.js', '--gate']).code === 0, '정상 기록인데 실패');
  return '기록 없음·불일치 거부, 정상 기록 통과';
});

// 9. 오래된 출력 섞임 방지: run.sh render 가 out/ 을 비우는지
t('오래된 출력 파일 제거', () => {
  const d = ws(example('story.post.json'));
  fs.mkdirSync(path.join(d, 'out/reel'), { recursive: true });
  fs.writeFileSync(path.join(d, 'out/10.png'), 'stale'); fs.writeFileSync(path.join(d, 'out/reel/old.png'), 'stale');
  const r = run(d, 'bash', ['run.sh', 'render']);
  expect(r.code === 0, r.out);
  expect(!fs.existsSync(path.join(d, 'out/10.png')) && !fs.existsSync(path.join(d, 'out/reel/old.png')), '오래된 파일이 남음');
  return 'run.sh render 전에 out/ 초기화 확인';
});

// 10. 슬롯 완료(DONE)·렌더 3회 제한·부분 게시 재시도 방지
t('게시 완료 슬롯 DONE + 렌더 3회 제한', () => {
  const D = new Date(); const pad = n => String(n).padStart(2, '0');
  const slot = `${D.getFullYear()}-${pad(D.getMonth() + 1)}-${pad(D.getDate())}-${D.getHours() < 12 ? 'am' : 'pm'}`;
  const d = ws(example('story.post.json'));
  fs.mkdirSync(path.join(d, 'posts', slot), { recursive: true });
  fs.writeFileSync(path.join(d, 'posts', slot, 'published.json'), '{}');
  const a = run(d, 'bash', ['run.sh', 'render']), b = run(d, 'bash', ['run.sh', 'publish']);
  expect(/DONE/.test(a.out) && /이미 게시됨/.test(b.out) && !fs.existsSync(path.join(d, 'out')), a.out + b.out);
  const d2 = ws(example('story.post.json'));
  fs.mkdirSync(path.join(d2, '.state')); fs.writeFileSync(path.join(d2, '.state', `render-${slot}`), '3');
  const c = run(d2, 'bash', ['run.sh', 'render']);
  expect(c.code !== 0 && /3회 초과/.test(c.out), c.out);
  return `슬롯 ${slot}: DONE 종료, 4번째 렌더 거부`;
});
t('부분 게시 후 재실행 시 성공분 재게시 안 함', () => {
  const d = drafts.story; expect(d, '렌더 실패로 생략');
  const slot = path.join(d, 'posts', 'test-slot');
  fs.writeFileSync(path.join(slot, 'published.json'), JSON.stringify({ carousel: 'https://example/p/1', error: 'reel 실패' }));
  fs.copyFileSync(path.join(d, 'post.json'), path.join(slot, 'post.json'));
  const r = run(d, 'node', ['publish.js', 'posts/test-slot'], { IG_DRY_RUN: '1' });
  expect(r.code === 0 && !/CAROUSEL/.test(r.out) && /REELS/.test(r.out), r.out);
  return '캐러셀 기록 있으면 릴스만 시도';
});

// 11. 이력: 정상 출력 / 읽기 실패를 '이력 없음'으로 숨기지 않음
t('최근 30일 이력 + 읽기 실패 표시', () => {
  const d = ws(null, { posts: true });
  const ok = run(d, 'node', ['history.js']);
  expect(ok.code === 0 && /최근 30일/.test(ok.out), ok.out);
  fs.writeFileSync(path.join(d, 'posts/2026-10-12-am/post.json'), '{broken');
  const bad = run(d, 'node', ['history.js']);
  expect(bad.code !== 0 && /HISTORY_ERROR/.test(bad.out), bad.out);
  fs.rmSync(path.join(d, 'posts'), { recursive: true });
  const none = run(d, 'node', ['history.js']);
  expect(none.code !== 0 && /HISTORY_ERROR/.test(none.out), none.out);
  return `${ok.out.split('\n')[0]} / 깨진 파일·폴더 없음 → HISTORY_ERROR`;
});

// 시안 보관 (개발 출력 경로)
if (process.argv.includes('--drafts')) for (const [k, d] of Object.entries(drafts)) {
  const dst = path.join(SRC, 'drafts', k);
  fs.rmSync(dst, { recursive: true, force: true });
  // 테스트 7·8 에서 post.json 을 건드렸으므로 원본 예시로 다시 렌더한 결과를 저장
  const fresh = ws(example(`${k}.post.json`));
  const r = pipeline(fresh);
  fs.cpSync(path.join(fresh, 'out'), dst, { recursive: true });
  fs.copyFileSync(path.join(fresh, 'post.json'), path.join(dst, 'post.json'));
  console.log(`시안 ${k}: ${dst} (check ${r.code === 0 ? '통과' : '실패'})`);
}

console.log('\n| 테스트 | 결과 | 내용 |\n|---|---|---|');
for (const [n, s, m] of results) console.log(`| ${n} | ${s} | ${String(m).replace(/\|/g, '/').replace(/\n/g, ' ')} |`);
process.exit(results.every(r => r[1] === '통과') ? 0 : 1);
