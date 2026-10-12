// 렌더 결과 검수: out/check/report.json + report.md + 최종 MP4 에서 뽑은 프레임(scene-N.png, motion-*.png, reel-sheet.png)
// 기계 검사는 통과/실패, 사람이 봐야 하는 항목은 '미검증'으로 남긴다 (자동 통과 처리하지 않음).
// 필수 기계 검사가 하나라도 실패하면 exit 1 → publish 게이트도 이 보고서를 기준으로 막는다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ffmpeg = process.env.FFMPEG || require('ffmpeg-static');
const { validate, contentHash, sceneMinDur, FADE } = require('./lib/post');

const root = __dirname;
const out = path.join(root, 'out');
const dir = path.join(out, 'check');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const checks = [];
const add = (id, kind, status, detail) => checks.push({ id, kind, status, detail });
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ff = args => spawnSync(ffmpeg, args, { encoding: 'buffer', maxBuffer: 1 << 26 });
// 프레임 하나를 54x96 회색조 원시 픽셀로 (비교용)
const gray = (src, t) => {
  const a = t === undefined ? ['-i', src] : ['-ss', t.toFixed(3), '-i', src];
  const r = ff(['-v', 'error', ...a, '-frames:v', '1', '-vf', 'scale=54:96,format=gray', '-f', 'rawvideo', '-']);
  return r.status === 0 && r.stdout.length === 54 * 96 ? r.stdout : null;
};
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const std = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const png = (t, file) => ff(['-v', 'error', '-y', '-ss', t.toFixed(3), '-i', path.join(out, 'reel.mp4'), '-frames:v', '1', path.join(dir, file)]).status === 0;

let m, post;
try { m = JSON.parse(fs.readFileSync(path.join(out, 'render.json'), 'utf8')); } catch { m = null; }
try { post = JSON.parse(fs.readFileSync(path.join(root, 'post.json'), 'utf8')); } catch { post = null; }

if (!m || !post) add('입력', '기계', '실패', 'out/render.json 또는 post.json 을 읽지 못함');
else {
  // 1. post.json 형식
  const v = validate(post, { allowLegacy: m.version === 1 });
  add('post.json 필수 필드·형식', '기계', v.errors.length ? '실패' : '통과', v.errors.join(' / ') || `version ${v.version}` + (v.warnings.length ? ` (경고: ${v.warnings.join(', ')})` : ''));
  // 2. 렌더에 쓴 입력과 현재 post.json 이 같은가 (문구 수정 후 재렌더 없이 게시 방지)
  add('렌더 입력 = 현재 post.json', '기계', contentHash(post) === m.inputHash ? '통과' : '실패',
    contentHash(post) === m.inputHash ? `renderId ${m.renderId}` : 'post.json 이 렌더 이후 바뀜 → run.sh render 다시 실행');

  // 3. 장면 시간
  const r = m.reel, bad = [];
  r.states.forEach(s => { if (!(s.dur >= FADE + 0.5)) bad.push(`${s.file} ${s.dur}s`); });
  if (m.version === 2) post.reel.scenes.forEach((s, i) => {
    const sc = r.scenes[i];
    if (!sc || Math.abs((sc.end - sc.start) - s.dur) > 0.01) bad.push(`장면 ${i + 1} 시간표 불일치`);
    if (s.dur + 1e-9 < sceneMinDur(s.items)) bad.push(`장면 ${i + 1} 읽기 시간 부족`);
  });
  if (m.version === 2 && r.scenes.length !== post.reel.scenes.length) bad.push('장면 수 불일치');
  add('장면 시간 유효성', '기계', bad.length ? '실패' : '통과', bad.join(', ') || `장면 ${r.scenes.length}개 / 상태 ${r.states.length}개 / 합계 ${r.total}초`);

  // 4. 글자 넘침·잘림 (Chrome 실측)
  const fit = [...m.fit.carousel, ...m.fit.reel];
  const fitBad = fit.filter(f => f.issues.length);
  if (m.version === 2) add('텍스트 넘침·잘림(레이아웃 실측)', '기계', fitBad.length ? '실패' : '통과',
    fitBad.map(f => `${f.file}: ${f.issues.join(', ')}`).join(' / ') || `캐러셀 ${m.fit.carousel.length}장 + 릴스 장면 ${m.fit.reel.length}개 검사`);
  else add('텍스트 넘침·잘림(레이아웃 실측)', '기계', '미검증', '과거 형식은 레이아웃 실측 대상 아님');

  // 5. 출력 파일 존재 + 이번 렌더 이후 생성됐는지
  const t0 = Date.parse(m.createdAt) - 2000;
  const outs = [...m.carousel, ...r.states.map(s => s.file), 'caption.txt', 'reel-caption.txt', 'reel.mp4'];
  const missing = outs.filter(f => !fs.existsSync(path.join(out, f)) || fs.statSync(path.join(out, f)).mtimeMs < t0);
  const expectN = (post.cards || []).length + 2;
  if (m.carousel.length !== expectN) missing.push(`캐러셀 ${m.carousel.length}장(기대 ${expectN})`);
  const capOk = fs.existsSync(path.join(out, 'caption.txt')) && fs.readFileSync(path.join(out, 'caption.txt'), 'utf8') === post.caption
    && fs.existsSync(path.join(out, 'reel-caption.txt')) && fs.readFileSync(path.join(out, 'reel-caption.txt'), 'utf8') === (m.version === 2 ? post.reel.caption : post.caption);
  if (!capOk) missing.push('캡션 파일이 post.json 과 다름');
  add('출력 파일 존재·최신·입력 일치', '기계', missing.length ? '실패' : '통과', missing.join(', ') || `${outs.length}개 파일`);

  // 6. 최종 MP4: 디코딩 / 길이 / 해상도 / 오디오
  const mp4 = path.join(out, 'reel.mp4');
  if (!fs.existsSync(mp4)) add('최종 MP4 디코딩', '기계', '실패', 'reel.mp4 없음');
  else {
    const dec = ff(['-v', 'error', '-i', mp4, '-f', 'null', '-']);
    const decErr = dec.stderr.toString().trim();
    add('최종 MP4 디코딩', '기계', dec.status === 0 && !decErr ? '통과' : '실패', decErr.slice(0, 200) || '전체 프레임 오류 없이 디코딩');
    const info = ff(['-hide_banner', '-i', mp4]).stderr.toString();
    const dm = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const dur = dm ? +dm[1] * 3600 + +dm[2] * 60 + +dm[3] : NaN;
    const okDur = Math.abs(dur - r.total) <= 0.15;
    const vs = /Video: h264.*?1080x1920.*?30 fps/.test(info);
    add('영상 길이 = 장면 시간표', '기계', okDur ? '통과' : '실패', `MP4 ${dur}초 / 시간표 ${r.total}초`);
    add('영상 규격 (H.264, 1080x1920, 30fps)', '기계', vs ? '통과' : '실패', (info.match(/Video: [^\n]*/) || ['스트림 정보 없음'])[0].slice(0, 120));
    const hasAudio = /Audio: aac/.test(info);
    const vol = ff(['-v', 'info', '-i', mp4, '-af', 'volumedetect', '-vn', '-f', 'null', '-']).stderr.toString().match(/max_volume: (-?[\d.]+|-inf) dB/);
    const silent = !vol || vol[1] === '-inf' || parseFloat(vol[1]) <= -80;
    add('오디오', '기계', hasAudio ? '통과' : '실패', hasAudio ? (silent ? '무음 AAC 트랙 (소리 없음, 음성·음악 미사용)' : `소리 있음 (max ${vol[1]} dB)`) : 'AAC 트랙 없음');

    // 7. 장면별 대표 프레임: 최종 MP4 에서 추출 → 입력 PNG 와 비교, 빈 장면·중복 장면 검사
    const sceneIssues = [];
    let prevG = null;
    r.scenes.forEach(sc => {
      const t = Math.max(sc.start, sc.end - 0.25);
      const file = `scene-${sc.index}.png`;
      if (!png(t, file)) return sceneIssues.push(`장면 ${sc.index} 프레임 추출 실패`);
      const g = gray(mp4, t), src = gray(path.join(out, sc.last));
      if (!g || !src) return sceneIssues.push(`장면 ${sc.index} 비교 실패`);
      if (std(g) < 3) sceneIssues.push(`장면 ${sc.index} 빈 화면`);
      if (diff(g, src) > 6) sceneIssues.push(`장면 ${sc.index} 가 입력 이미지와 다름(${diff(g, src).toFixed(1)})`);
      if (prevG && diff(g, prevG) < 0.8) sceneIssues.push(`장면 ${sc.index} 가 직전 장면과 같음`);
      prevG = g;
    });
    add('MP4 장면 구성 = 입력 장면 (누락·빈 장면 없음)', '기계', sceneIssues.length ? '실패' : '통과', sceneIssues.join(', ') || `장면 ${r.scenes.length}개 모두 일치`);

    // 8. 움직임: 첫 번째 '문장 등장' 지점의 전·중·후 프레임이 서로 달라야 함 (점진적 전환)
    const idx = r.states.findIndex((s, i) => i > 0 && s.item > 1);
    const k = idx > 0 ? idx : 1;
    const tb = r.states.slice(0, k).reduce((a, s) => a + s.dur, 0);
    const ts = [tb - 0.15, tb + r.fade / 2, tb + r.fade + 0.15];
    const gs = ts.map(t => gray(mp4, t));
    ['a', 'b', 'c'].forEach((x, i) => png(ts[i], `motion-${x}.png`));
    if (gs.some(g => !g)) add('움직임(문장 등장 애니메이션)', '기계', '실패', '프레임 추출 실패');
    else {
      const ab = diff(gs[0], gs[1]), bc = diff(gs[1], gs[2]), ac = diff(gs[0], gs[2]);
      // 공통: 중간 프레임이 앞·뒤와 모두 달라야 함. 페이드면 중간이 '사이 값'이어야 하므로 전→후 차이가 가장 큼
      const ok = ab > 0.05 && bc > 0.05 && ac > 0.05 && (r.transition !== 'fade' || ac >= Math.max(ab, bc));
      add('움직임(문장 등장 애니메이션)', '기계', ok ? '통과' : '실패',
        `${r.states[k].file} 등장 ${tb.toFixed(2)}초 전후 프레임 차이 전→중 ${ab.toFixed(2)}, 중→후 ${bc.toFixed(2)}, 전→후 ${ac.toFixed(2)} (중간 프레임이 양쪽과 달라야 함)`);
    }

    // 9. 검수용 한눈 이미지 (최종 MP4 프레임으로)
    const n = r.scenes.length;
    const inputs = []; r.scenes.forEach(sc => inputs.push('-i', path.join(dir, `scene-${sc.index}.png`)));
    const tiles = r.scenes.map((_, i) => `[${i}:v]scale=360:640[t${i}]`).join(';') + ';' + r.scenes.map((_, i) => `[t${i}]`).join('') + `hstack=inputs=${n}`;
    const sheet = n > 1 ? ff(['-v', 'error', '-y', ...inputs, '-filter_complex', tiles, path.join(dir, 'reel-sheet.png')]).status === 0 : false;
    add('검수용 이미지 생성 (MP4 프레임)', '기계', sheet ? '통과' : '실패', sheet ? 'out/check/reel-sheet.png' : '생성 실패');
  }
}

// 사람이 직접 봐야 하는 항목: 자동 통과시키지 않는다
add('캐러셀 육안 검수 (01·05·09.png)', '육안', '미검증', '예약 실행이 Read 로 직접 보고 post.json 의 visualReview 에 기록');
add('릴스 육안 검수 (reel-sheet.png, scene-*.png)', '육안', '미검증', '같음. 오디오는 무음이라 음성 검수 대상 없음');

const ok = checks.filter(c => c.kind === '기계').every(c => c.status === '통과' || (c.status === '미검증' && m && m.version === 1));
const outputs = {};
if (m) for (const f of [...m.carousel, 'caption.txt', 'reel-caption.txt', 'reel.mp4']) if (fs.existsSync(path.join(out, f))) outputs[f] = sha(path.join(out, f));
const report = { ok, renderId: m && m.renderId, inputHash: m && m.inputHash, version: m && m.version, checkedAt: new Date().toISOString(), outputs, checks };
fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
const md = [`# 렌더 검수 보고서`, '', `- 결과: **${ok ? '기계 검사 통과' : '실패 — 게시 불가'}**`, `- renderId: \`${report.renderId}\``,
  `- 검수 시각: ${report.checkedAt}`, '', '| 구분 | 항목 | 결과 | 내용 |', '|---|---|---|---|',
  ...checks.map(c => `| ${c.kind} | ${c.id} | ${c.status} | ${String(c.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`), '',
  '육안 항목은 사람이(예약 실행에서는 Claude 가) 이미지를 직접 본 뒤 post.json 의 visualReview 에 renderId 와 함께 기록해야 게시된다.'].join('\n');
fs.writeFileSync(path.join(dir, 'report.md'), md);
console.log(md);
process.exit(ok ? 0 : 1);
