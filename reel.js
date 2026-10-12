// out/render.json 의 장면 상태(out/reel/*.png)와 시간표로 out/reel.mp4 를 만든다.
// 상태 사이를 xfade 로 이어 붙이므로, 새 문장은 실제로 페이드인되며 등장한다(정지 화면 반복 아님).
// 오디오: 사용할 수 있는 음원이 없어 무음 AAC 트랙만 넣는다 (Instagram 업로드 호환용).
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
args.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=48000:cl=stereo');

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
console.log(`reel.mp4: 상태 ${states.length}개, 장면 ${m.reel.scenes.length}개, ${total}초, 무음`);
