// 개발용 테스트: node test.js [--drafts]
// 코드만 임시 폴더에 복사해서 돌린다 → 이 저장소의 post.json / posts / out 은 건드리지 않음.
// 게시는 IG_DRY_RUN=1 로 모의 처리 (토큰·.env 불필요, 실제 API 호출 없음).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC = __dirname;
const FFMPEG = process.env.FFMPEG || require('ffmpeg-static');
const CODE = ['lib', 'photos.js', 'render.js', 'reel.js', 'check.js', 'publish.js', 'history.js', 'run.sh'];
const example = name => JSON.parse(fs.readFileSync(path.join(SRC, 'examples', name), 'utf8'));
const results = [];

function ws(post, { posts = false } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tipsnack-test-'));
  for (const f of CODE) fs.cpSync(path.join(SRC, f), path.join(d, f), { recursive: true });
  // 이력은 필수(없으면 HISTORY_ERROR). posts=true 면 실제 게시 기록 복사, 아니면 빈 폴더
  if (posts) fs.cpSync(path.join(SRC, 'posts'), path.join(d, 'posts'), { recursive: true });
  else fs.mkdirSync(path.join(d, 'posts'));
  if (post) fs.writeFileSync(path.join(d, 'post.json'), JSON.stringify(post, null, 2));
  return d;
}
const run = (d, cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: d, encoding: 'utf8', env: { ...process.env, FFMPEG, ...env }, maxBuffer: 1 << 26 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const pipeline = (d, env) => {
  for (const s of ['photos.js', 'render.js', 'reel.js', 'check.js']) {
    const r = run(d, 'node', [s], { PHOTO_MOCK: '1', ...env });
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
for (const [key, file] of [['coffee', 'coffee.post.json'], ['kimchi', 'kimchi.post.json']]) {
  t(`새 형식 렌더·검수 (${key})`, () => {
    const d = ws(example(file), { posts: true }); // 실제 이력과 비교
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
    for (const f of [...fs.readdirSync(path.join(d, 'out')).filter(f => /^\d+\.png$/.test(f)), 'reel.mp4', 'reel-cover.png', 'caption.txt', 'reel-caption.txt'])
      fs.copyFileSync(path.join(d, 'out', f), path.join(slot, f));
    for (const f of ['report.json', 'report.md']) fs.copyFileSync(path.join(d, 'out/check', f), path.join(slot, f));
    fs.copyFileSync(path.join(d, 'post.json'), path.join(slot, 'post.json'));
    const r = run(d, 'node', ['publish.js', 'posts/test-slot'], { IG_DRY_RUN: '1' });
    expect(r.code === 0, r.out);
    const p = example(file);
    const [car, reel] = r.out.split('[DRY] REELS');
    expect(car.includes(p.caption) && !car.includes(p.reel.caption), '캐러셀에 캐러셀 캡션이 안 감');
    expect(reel.includes(p.reel.caption) && !reel.includes(p.caption), '릴스에 릴스 캡션이 안 감');
    expect(/cover=reel-cover\.png/.test(reel), '릴스 커버 이미지가 지정되지 않음');
    return '캐러셀=caption, 릴스=reel.caption, 릴스 커버=reel-cover.png';
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
  const p = example('coffee.post.json'); delete p.reel;
  const r = run(ws(p), 'node', ['render.js']);
  expect(r.code !== 0 && /reel 누락/.test(r.out), r.out);
  const p2 = example('coffee.post.json'); p2.cards.pop();
  const r2 = run(ws(p2), 'node', ['render.js']);
  expect(r2.code !== 0 && /정확히 7개/.test(r2.out), r2.out);
  const p3 = example('coffee.post.json'); delete p3.cards[1].bridge;
  const r3 = run(ws(p3), 'node', ['render.js']);
  expect(r3.code !== 0 && /cards\[1\]\.bridge/.test(r3.out), r3.out);
  const p4 = example('coffee.post.json'); p4.reel.scenes = p4.reel.scenes.filter(s => !s.summary);
  const r4 = run(ws(p4), 'node', ['render.js']);
  expect(r4.code !== 0 && /요약\(summary: true\)/.test(r4.out), r4.out);
  return 'reel 누락, cards 6개, 연결 문장 누락, 릴스 요약 장면 누락 → 렌더 거부';
});

// 5. 비정상 장면 시간
t('비정상 장면 시간 입력 시 중단', () => {
  const cases = [[1.0, /2.5~8초|짧음/], ['3', /숫자/], [20, /2.5~8초/], [2.6, /읽기에 짧음/]];
  for (const [dur, re] of cases) {
    const p = example('coffee.post.json'); p.reel.scenes[3].dur = dur; // 말풍선 2개 장면 (읽기 최소 4.9초)
    const r = run(ws(p), 'node', ['render.js']);
    expect(r.code !== 0 && re.test(r.out), `dur=${dur}: ${r.out}`);
  }
  return 'dur 1.0 / "3" / 20 / 읽기 부족 2.6 → 모두 거부';
});

// 6. 긴 문장 넘침 탐지 (글자 수 제한은 통과하지만 실제로 넘치는 경우)
t('긴 문장 넘침 탐지', () => {
  const p = example('coffee.post.json'); p.cards[2].title = 'WWWWWWWWWWWW';
  const d = ws(p);
  const r = pipeline(d);
  expect(r.code !== 0 && r.step === 'check.js', '넘침이 통과됨');
  const c = report(d).checks.find(x => x.id.startsWith('텍스트 넘침'));
  expect(c.status === '실패' && /04\.png/.test(c.detail), c.detail); // cards[2] = 표지 다음 세 번째 카드 = 04.png
  return c.detail;
});

// 7. 렌더 후 문구 수정 → 이전 검수로 게시 불가
t('수정 전 검수로 수정 후 데이터 게시 방지', () => {
  const d = drafts.coffee; expect(d, '렌더 실패로 생략');
  review(d); // 검수 통과 + 육안 기록까지 된 상태에서
  setPost(d, p => { p.caption = p.caption + '\n수정'; }); // 렌더 없이 문구만 수정
  const g = run(d, 'node', ['publish.js', '--gate']);
  expect(g.code !== 0 && /바뀜/.test(g.out), '게이트: ' + g.out);
  expect(run(d, 'node', ['check.js']).code !== 0, 'check 가 통과');
  return g.out.trim();
});

// 8. 육안 검수 기록 없음 / renderId 불일치
t('육안 검수 기록 없으면 게시 불가', () => {
  const d = drafts.kimchi; expect(d, '렌더 실패로 생략');
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
  const d = ws(example('kimchi.post.json'));
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
  const d = ws(example('kimchi.post.json'));
  fs.mkdirSync(path.join(d, 'posts', slot), { recursive: true });
  fs.writeFileSync(path.join(d, 'posts', slot, 'published.json'), '{}');
  const a = run(d, 'bash', ['run.sh', 'render']), b = run(d, 'bash', ['run.sh', 'publish']);
  expect(/DONE/.test(a.out) && /이미 게시됨/.test(b.out) && !fs.existsSync(path.join(d, 'out')), a.out + b.out);
  const d2 = ws(example('kimchi.post.json'));
  fs.mkdirSync(path.join(d2, '.state')); fs.writeFileSync(path.join(d2, '.state', `render-${slot}`), '3');
  const c = run(d2, 'bash', ['run.sh', 'render']);
  expect(c.code !== 0 && /3회 초과/.test(c.out), c.out);
  return `슬롯 ${slot}: DONE 종료, 4번째 렌더 거부`;
});
t('부분 게시 후 재실행 시 성공분 재게시 안 함', () => {
  const d = drafts.kimchi; expect(d, '렌더 실패로 생략');
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

// 12. 중복 방지: 이미 게시된 이야기(김치찌개)를 소재만 바꾼 변형(된장찌개)은 거부
const posted = slot => JSON.parse(fs.readFileSync(path.join(SRC, 'posts', slot, 'post.json'), 'utf8'));
const HSLOT = '2099-12-31-am'; // 이력 맨 끝에 엄마 카톡 게시물 하나를 끼워 넣는다
const withHist = (p, h) => { const d = ws(p, { posts: true }); fs.mkdirSync(path.join(d, 'posts', HSLOT)); fs.writeFileSync(path.join(d, 'posts', HSLOT, 'post.json'), JSON.stringify(h)); return d; };
t('중복 변형(김치찌개→된장찌개) 거부', () => {
  const p = JSON.parse(JSON.stringify(example('kimchi.post.json')).replace(/김치찌개/g, '된장찌개'));
  Object.assign(p, { category: '식재료', topic: '엄마표 된장찌개' });
  Object.assign(p.cover, { title: '엄마 된장찌개\n뭐 넣어?', emphasis: '된장찌개' });
  const r = run(withHist(p, example('kimchi.post.json')), 'node', ['render.js']);
  expect(r.code !== 0 && new RegExp(HSLOT + '.*너무 비슷함').test(r.out), r.out);
  return r.out.split('\n').find(l => /너무 비슷함/.test(l)).trim();
});
t('서로 다른 주제는 통과 (유사도 실측)', () => {
  const lib = require(path.join(SRC, 'lib/post'));
  const h = lib.loadHistory(SRC).items;
  const a = example('coffee.post.json'), s = example('kimchi.post.json');
  const top = p => lib.compareHistory(p, h).nearest[0];
  const x = top(a), y = top(s), ab = lib.similarity(a, s);
  expect(x.s < lib.SIM_LIMIT && y.s < lib.SIM_LIMIT && ab < lib.SIM_LIMIT, '비중복이 상한을 넘음');
  return `대화형 최대 ${x.s.toFixed(2)}(${x.slot}), 이야기형 최대 ${y.s.toFixed(2)}(${y.slot}), 두 예시끼리 ${ab.toFixed(2)} < ${lib.SIM_LIMIT}`;
});
t('이력 규칙: 직전 카테고리·같은 표지 제목·감정 3연속', () => {
  const p1 = example('coffee.post.json'); p1.category = '요리';          // 직전(김치찌개)과 같은 카테고리
  const r1 = run(withHist(p1, example('kimchi.post.json')), 'node', ['render.js']);
  expect(r1.code !== 0 && /직전 게시물.*같은 카테고리/.test(r1.out), r1.out);
  const p2 = example('coffee.post.json'); p2.cover.title = '고마워 뒤에\n한마디 더'; p2.cover.emphasis = '한마디'; // 이미 쓴 표지 제목
  const r2 = run(ws(p2, { posts: true }), 'node', ['render.js']);
  expect(r2.code !== 0 && /cover\.title 이 2026-10-12-extra/.test(r2.out), r2.out);
  const lib = require(path.join(SRC, 'lib/post'));
  const fake = e => ({ slot: '2099-01-0' + e.length, post: { ...example('kimchi.post.json'), topic: e, category: '청소', emotion: '장난·웃음', summary: e, situation: e, cards: [], reel: { scenes: [] }, cover: { title: e } } });
  const c = lib.compareHistory(example('kimchi.post.json'), [fake('가'), fake('나나')]);
  expect(c.errors.some(x => /3연속/.test(x)), JSON.stringify(c.errors));
  return '세 가지 모두 거부';
});
t('이력 읽기 실패 시 렌더 중단', () => {
  const d = ws(example('kimchi.post.json'), { posts: true });
  fs.writeFileSync(path.join(d, 'posts/2026-10-12-extra/post.json'), '{broken');
  const r = run(d, 'node', ['render.js']);
  expect(r.code !== 0 && /HISTORY_ERROR/.test(r.out), r.out);
  const d2 = ws(example('kimchi.post.json')); fs.rmSync(path.join(d2, 'posts'), { recursive: true });
  const r2 = run(d2, 'node', ['render.js']);
  expect(r2.code !== 0 && /HISTORY_ERROR/.test(r2.out), r2.out);
  return '깨진 기록·posts 없음 → HISTORY_ERROR';
});
t('후킹 규칙: 첫 장면·표지', () => {
  const cases = [
    [p => { p.reel.scenes[0].card = 2; }, /첫 장면은 1번 카드/],
    [p => { p.reel.scenes[0].items[0].text = '엄마 주말 아침에 먼저 일어났는데'; }, /16자 이하/],
    [p => { p.cover.emphasis = '없는말'; }, /cover\.emphasis/],
    [p => { p.cover.title = p.topic.slice(0, 9); p.topic = p.cover.title; delete p.cover.emphasis; }, /주제명을 그대로/],
    [p => { p.cover.style = 'neon'; }, /cover\.style/],
    [p => { delete p.situation; }, /situation/],
  ];
  for (const [f, re] of cases) { const p = example('kimchi.post.json'); f(p); const r = run(ws(p), 'node', ['render.js']); expect(r.code !== 0 && re.test(r.out), `${re}: ${r.out}`); }
  return `${cases.length}가지 위반 모두 거부`;
});
t('첫 장면: 0초에 첫 문장 완성, 둘째 문장 2.5초 안에 등장', () => {
  const out = [];
  for (const k of ['coffee', 'kimchi']) {
    const d = drafts[k]; expect(d, `${k} 렌더 실패로 생략`);
    const c = report(d).checks.find(x => x.id === '첫 프레임 (시작 상태)');
    const m = JSON.parse(fs.readFileSync(path.join(d, 'out/render.json'), 'utf8'));
    const s0 = m.reel.states[0];
    expect(c.status === '통과' && s0.hook && s0.item === 1, c.detail);
    expect(m.reel.states[1].scene === 1 && s0.dur <= 2.5, `둘째 문장 ${s0.dur}초 뒤`);
    out.push(`${k}: 둘째 문장 ${s0.dur}초`);
  }
  return out.join(', ');
});
t('엄마 카톡 형식: focus·엄마/아빠·썸네일·요약→마무리 질문', () => {
  const lib = require(path.join(SRC, 'lib/post'));
  expect(lib.validate(example('kimchi.post.json')).errors.length === 0, '예시 실패');
  const cases = [
    [p => { p.reel.mode = 'summary'; }, /focus" 여야/],
    [p => { delete p.reel.mode; }, /focus" 여야/],
    [p => { p.reel.chatName = '너'; }, /엄마 \/ 아빠/],
    [p => { p.reel.scenes[0].items[0].text = '김치찌개 어떻게 끓여?'; }, /첫 메시지는 내가 "엄마 ~"/],
    [p => { delete p.reel.cover; }, /reel\.cover 누락/],
    [p => { p.reel.scenes.pop(); }, /마무리 질문/],
    [p => { p.reel.scenes.splice(-2, 1); }, /요약\(summary: true\)/],
    [p => { p.caption = p.caption.replace('엄마한테 물어본 꿀팁 ', ''); }, /소개 문구/],
    [p => { p.category = '다정하게 말하기'; }, /category/],
    [p => { delete p.insight; }, /insight 누락/],
  ];
  for (const [f, re] of cases) { const p = example('kimchi.post.json'); f(p); const e = lib.validate(p).errors; expect(e.some(x => re.test(x)), `${re}: ${e.join(' / ')}`); }
  return `${cases.length}가지 위반 거부`;
});
t('typing·big·정지 상한 규칙', () => {
  const lib = require(path.join(SRC, 'lib/post'));
  const cases = [
    [p => { p.reel.scenes[p.reel.scenes.length - 2].items[0].typing = true; }, /typing: 말풍선/],
    [p => { p.reel.scenes[1].items[0].big = true; }, /big: 가운데 문장/],
    [p => { p.reel.scenes[0].items[1].typing = true; }, /첫 장면은 0초부터/],
    [p => { p.reel.scenes[4].dur += 2; }, /화면이 멈춰 보임/],
    [p => { p.reel.scenes[1].dur -= 0.6; }, /읽기에 짧음/], // typing 0.8초도 필요 시간에 포함
  ];
  for (const [f, re] of cases) { const p = example('kimchi.post.json'); f(p); const e = lib.validate(p).errors; expect(e.some(x => re.test(x)), `${re}: ${e.join(' / ')}`); }
  return `${cases.length}가지 위반 거부`;
});
t('입력 중… 상태와 전개 속도 검사', () => {
  const d = drafts.kimchi; expect(d, '렌더 실패로 생략');
  const m = JSON.parse(fs.readFileSync(path.join(d, 'out/render.json'), 'utf8'));
  const typing = m.reel.states.filter(s => s.typing);
  expect(typing.length === 3 && typing.every(s => s.dur === 0.8), `typing 상태 ${typing.length}개`);
  const c = report(d).checks.find(x => x.id === '전개 속도 (정지 구간)');
  expect(c && c.status === '통과', c && c.detail);
  expect(fs.existsSync(path.join(d, 'out/check/timeline.png')), 'timeline.png 없음');
  return `typing 상태 ${typing.length}개, ${c.detail.split('.')[0]}`;
});
t('기존 v2(새 필드 없음) 호환 렌더 + 게시 거부', () => {
  const d = ws(posted('2026-10-12-extra2'));
  const r = pipeline(d, { TIPSNACK_ALLOW_LEGACY: '1' });
  expect(r.code === 0, `${r.step}: ${r.out}`);
  expect(report(d).legacy === true, 'legacy 표시 없음');
  review(d);
  const g = run(d, 'node', ['publish.js', '--gate']);
  expect(g.code !== 0 && /호환 렌더/.test(g.out), g.out);
  expect(run(ws(posted('2026-10-12-extra2')), 'node', ['render.js']).code !== 0, '예약 경로에서 새 필드 없는 v2 가 렌더됨');
  return '호환 렌더 OK, 게이트·예약 경로 거부';
});

t('카톡 사진: 직접 그림(SVG)·실사 생성(prompt) 렌더, 위험 입력 거부', () => {
  const p = example('coffee.post.json');
  p.reel.photos = { stain: "<rect width='900' height='900' fill='#eee'/><circle cx='450' cy='450' r='120' fill='#8B5A3C' filter='url(#bleed)'/>",
    towel: { prompt: 'a damp white bath towel crumpled on a bathroom tile floor, close-up' } };
  p.reel.scenes[0].items[1] = { who: 'me', text: '사진', image: 'stain' };
  p.reel.scenes[1].items[0] = { who: 'me', text: '사진', image: 'towel' };
  const lib = require(path.join(SRC, 'lib/post'));
  p.reel.scenes.forEach(s => { s.dur = Math.max(2.5, Math.ceil((lib.sceneMinDur(s.items) + 0.05) * 10) / 10); });
  expect(lib.validate(p).errors.length === 0, lib.validate(p).errors.join(' / '));
  const d = ws(p); const r = pipeline(d);
  expect(r.code === 0, `${r.step}: ${r.out}`);
  expect(fs.existsSync(path.join(d, 'out/photo-stain.png')) && fs.existsSync(path.join(d, 'out/photo-towel.jpg')), '사진 파일 없음');
  const bad = [["<script>x</script>", /script/], ["<rect fill='url(http://x)'/>", /외부 참조/], ["<text>a</text>", /글자/], [{ prompt: 'short' }, /prompt/]];
  for (const [b, re] of bad) { const q = example('coffee.post.json'); q.reel.photos = { x: b }; q.reel.scenes[1].items.unshift({ who: 'me', text: '사진', image: 'x' }); expect(lib.validate(q).errors.some(e => re.test(e)), `${re}`); }
  const q = example('coffee.post.json'); q.reel.scenes[0].items.push({ who: 'me', text: '사진', image: 'nope' });
  expect(lib.validate(q).errors.some(e => /image/.test(e)), '없는 사진 참조 통과');
  const d2 = ws(p); const r2 = run(d2, 'node', ['photos.js'], { CF_ACCOUNT_ID: '', CF_API_TOKEN: '' });
  expect(r2.code !== 0 && /PHOTO_ERROR/.test(r2.out), '키 없을 때 PHOTO_ERROR 아님: ' + r2.out);
  return 'SVG·실사 사진 렌더 OK, 위험 입력 4종·없는 참조 거부, 키 없으면 PHOTO_ERROR';
});

// 시안 보관 (개발 출력 경로)
if (process.argv.includes('--drafts')) for (const [k, d] of Object.entries(drafts)) {
  const dst = path.join(SRC, 'drafts', k);
  fs.rmSync(dst, { recursive: true, force: true });
  // 테스트 7·8 에서 post.json 을 건드렸으므로 원본 예시로 다시 렌더한 결과를 저장
  const fresh = ws(example(`${k}.post.json`), { posts: true });
  const r = pipeline(fresh);
  fs.cpSync(path.join(fresh, 'out'), dst, { recursive: true });
  fs.copyFileSync(path.join(fresh, 'post.json'), path.join(dst, 'post.json'));
  console.log(`시안 ${k}: ${dst} (check ${r.code === 0 ? '통과' : '실패'})`);
}

console.log('\n| 테스트 | 결과 | 내용 |\n|---|---|---|');
for (const [n, s, m] of results) console.log(`| ${n} | ${s} | ${String(m).replace(/\|/g, '/').replace(/\n/g, ' ')} |`);
process.exit(results.every(r => r[1] === '통과') ? 0 : 1);
