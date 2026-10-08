// out/reel/*.png (1080x1920) -> out/reel.mp4 (장당 3초, 슬라이드 전환, 무음 AAC 트랙)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = process.env.FFMPEG || require('ffmpeg-static');

const out = path.join(__dirname, 'out');
const src = path.join(out, 'reel');
const imgs = fs.readdirSync(src).filter(f => /^\d+\.png$/.test(f)).sort();
const D = 3, F = 0.4; // 장당 노출 시간, 전환 시간
const total = imgs.length * D - (imgs.length - 1) * F;

const args = ['-y'];
imgs.forEach(f => args.push('-loop', '1', '-t', String(D), '-i', path.join(src, f)));
args.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=48000:cl=stereo');

let fc = imgs.map((_, i) => `[${i}:v]setsar=1,fps=30,format=yuv420p[v${i}]`).join(';');
let prev = 'v0';
for (let i = 1; i < imgs.length; i++) {
  const o = i === imgs.length - 1 ? 'vout' : `x${i}`;
  fc += `;[${prev}][v${i}]xfade=transition=slideleft:duration=${F}:offset=${(i * (D - F)).toFixed(2)}[${o}]`;
  prev = o;
}
args.push('-filter_complex', fc, '-map', '[vout]', '-map', `${imgs.length}:a`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', path.join(out, 'reel.mp4'));

execFileSync(ffmpeg, args, { stdio: 'ignore' });
console.log(`reel.mp4: ${imgs.length}장, ${total.toFixed(1)}초`);
