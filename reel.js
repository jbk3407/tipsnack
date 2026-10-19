// out/render.json 의 장면 상태(out/reel/*.png)와 시간표로 out/reel.mp4 를 만든다.
// 상태 사이를 xfade 로 이어 붙이므로, 새 문장은 실제로 페이드인되며 등장한다(정지 화면 반복 아님).
// 오디오: 외부 음원 없이 직접 합성한 짧은 효과음만 쓴다 (메시지 등장 '톡', 후킹 화면 '둥'). pop 이 없으면 무음.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = process.env.FFMPEG || require('ffmpeg-static');

const out = path.join(__dirname, 'out');
const m = JSON.parse(fs.readFileSync(path.join(out, 'render.json'), 'utf8'));
const { states, fade: F, transition, total } = m.reel;
const target = path.join(out, 'reel.mp4');
if (fs.existsSync(target)) fs.unlinkSync(target); // 이전 결과가 남지 않게

// 입력 i 의 길이 = 머무는 시간 + 다음 상태로 넘어가는 전환 시간 (마지막은 전환 없음)
const args = ['-y', '-v', 'error'];
states.forEach((s, i) => args.push('-loop', '1', '-t', String(+(s.dur + (i < states.length - 1 ? F : 0)).toFixed(3)), '-i', path.join(out, s.file)));
// 각 상태가 화면에 나타나는 시각(전환 끝)에 짧은 사인파 소리를 겹친다. me 는 높게, you 는 낮게
const TONE = { me: 1046, you: 784, line: 659, hook: 392 };
let at = 0; const blips = [];
states.forEach((s, i) => { const start = i === 0 ? 0 : at + F * 0.5; if (TONE[s.pop]) blips.push([start, TONE[s.pop], s.pop === 'hook' ? 0.35 : 0.22]); at += s.dur; });
const expr = blips.length
  ? blips.map(([t0, f, a]) => `${a}*sin(2*PI*${f}*(t-${t0.toFixed(3)}))*exp(-${f > 500 ? 30 : 9}*abs(t-${t0.toFixed(3)}))*between(t,${t0.toFixed(3)},${(t0 + 0.4).toFixed(3)})`).join('+')
  : '0';
args.push('-f', 'lavfi', '-t', String(total), '-i', `aevalsrc='${expr}|${expr}':s=48000:d=${total}`); // 따옴표: 식 안의 쉼표 보호

let fc = states.map((_, i) => `[${i}:v]scale=1080:1920,setsar=1,fps=30,format=yuv420p[v${i}]`).join(';');
let prev = 'v0', offset = 0;
for (let i = 1; i < states.length; i++) {
  offset += states[i - 1].dur;
  const o = i === states.length - 1 ? 'vout' : `x${i}`;
  fc += `;[${prev}][v${i}]xfade=transition=${transition}:duration=${F}:offset=${offset.toFixed(3)}[${o}]`;
  prev = o;
}
if (states.length === 1) fc += ';[v0]null[vout]';
args.push('-filter_complex', fc, '-map', '[vout]', '-map', `${states.length}:a`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-t', String(total), '-movflags', '+faststart', target);

execFileSync(ffmpeg, args, { stdio: 'inherit' });
console.log(`reel.mp4: 상태 ${states.length}개, 장면 ${m.reel.scenes.length}개, ${total}초, 효과음 ${blips.length}개`);
