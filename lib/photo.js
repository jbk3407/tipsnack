// 릴스 '카톡 사진' 도구. post.json 의 reel.photos.<이름> 에 SVG 본문(900x900 좌표)만 쓰면
// 여기 정의된 필터·그라데이션을 id 로 바로 쓸 수 있고, 폰 사진 느낌(창가 빛·비네팅·노이즈)이 자동으로 덧씌워진다.
// 사용 가능한 id 목록은 PHOTO_IDS (ROUTINE.md 의 사진 절에도 설명).

// 입체 조명: 모양의 알파를 흐려 높이맵으로 쓰고 빛을 비춘다. 둥근 물체에 filter="url(#bM)" 처럼 건다
const bump = (name, blur, scale, spec = 0.55, exp = 22) => `
  <filter id="${name}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${blur}" result="h"/>
    <feDiffuseLighting in="h" surfaceScale="${scale}" diffuseConstant="1.25" lighting-color="#fff" result="d"><feDistantLight azimuth="250" elevation="40"/></feDiffuseLighting>
    <feSpecularLighting in="h" surfaceScale="${scale}" specularConstant="${spec}" specularExponent="${exp}" lighting-color="#fff" result="s"><feDistantLight azimuth="250" elevation="40"/></feSpecularLighting>
    <feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1" result="lit"/>
    <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
    <feComposite in="lit" in2="s2" operator="arithmetic" k2="1" k3="0.75" result="o"/>
    <feComposite in="o" in2="SourceAlpha" operator="in"/></filter>`;
// 면 질감: 흰 사각형에 걸어 겹쳐 쓴다 (예: <rect width="900" height="900" fill="#fff" filter="url(#paper)" opacity="0.8"/>)
const lit = (name, freq, oct, seedN, scale, az = 235, el = 50) => `
  <filter id="${name}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seedN}" result="n"/>
    <feDiffuseLighting in="n" surfaceScale="${scale}" lighting-color="#fff" diffuseConstant="1.1" result="l"><feDistantLight azimuth="${az}" elevation="${el}"/></feDiffuseLighting>
    <feComposite in="l" in2="SourceGraphic" operator="in"/></filter>`;
const tint = (name, freq, oct, seedN, rgb, a, b) => `
  <filter id="${name}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seedN}"/>
    <feColorMatrix type="matrix" values="0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  0 0 0 ${a} ${b}"/></filter>`;

const PHOTO_DEFS = `
  ${bump('bS', 5, 5)}${bump('bM', 10, 7)}${bump('bL', 22, 10, 0.5, 18)}${bump('bX', 40, 12, 0.35, 14)}${bump('bG', 9, 6, 1.1, 40)}
  ${lit('paper', 0.02, 3, 21, 6)}${lit('emboss', 0.09, 2, 22, 2, 235, 55)}${lit('cloth', 0.012, 3, 13, 16, 225, 45)}${lit('wrinkle', '0.0025 0.005', 2, 11, 14, 225, 52)}
  <filter id="fabric" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9 0.06" numOctaves="2" seed="3" result="h"/><feTurbulence type="fractalNoise" baseFrequency="0.06 0.9" numOctaves="2" seed="7" result="v"/>
    <feBlend in="h" in2="v" mode="multiply" result="w"/><feColorMatrix in="w" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 -0.9 0.62" result="wv"/>
    <feComposite in="wv" in2="SourceGraphic" operator="in"/></filter>
  ${tint('wood', '0.003 0.06', 4, 8, [0.42, 0.27, 0.14], 1.2, -0.35)}
  ${tint('stone', 0.02, 4, 4, [0.4, 0.4, 0.42], 0.8, -0.25)}
  ${tint('veins', '0.004 0.35', 2, 4, [0.25, 0.35, 0.15], 1.5, -0.6)}
  ${tint('enamel', 0.6, 1, 12, [0.4, 0.35, 0.25], 0.25, 0)}
  ${tint('fog', 0.006, 3, 17, [1, 1, 1], 1.4, -0.35)}
  ${tint('mold', 0.05, 4, 33, [0.12, 0.13, 0.1], 2.2, -0.9)}
  <filter id="mottle" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="9" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 0 0.04  0 0 0 1.6 -0.55" result="mc"/><feComposite in="mc" in2="SourceGraphic" operator="in"/></filter>
  <filter id="caustic" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.012 0.02" numOctaves="2" seed="31" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.4 -1.1" result="c"/><feComposite in="c" in2="SourceGraphic" operator="in"/></filter>
  <filter id="bleed" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="5" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="28" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="3.2"/></filter>
  <filter id="bleedSoft" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="4" seed="5" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="80" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="9"/></filter>
  <filter id="smudge" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="4" seed="9" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="26" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="1.8"/></filter>
  <filter id="cshadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="8"/><feOffset dx="10" dy="16"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.11  0 0 0 0 0.06  0 0 0 0.45 0"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="1.5"/></filter>
  <filter id="b3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="b8"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="b20"><feGaussianBlur stdDeviation="20"/></filter>
  <filter id="pgrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="2"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.14 0"/></filter>
  <radialGradient id="pvig" cx="0.45" cy="0.42" r="0.85"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.36"/></radialGradient>
  <linearGradient id="pwin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF6E6" stop-opacity="0.38"/><stop offset="0.5" stop-color="#FFF6E6" stop-opacity="0"/><stop offset="1" stop-color="#1C2028" stop-opacity="0.2"/></linearGradient>
  <linearGradient id="blade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F6F8"/><stop offset="0.4" stop-color="#BFC6CC"/><stop offset="0.52" stop-color="#E9ECEE"/><stop offset="1" stop-color="#8C949B"/></linearGradient>
  <radialGradient id="chrome" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#C9CED3"/><stop offset="0.6" stop-color="#8E959C"/><stop offset="0.85" stop-color="#E6E9EC"/><stop offset="1" stop-color="#7C838A"/></radialGradient>
  <radialGradient id="hole" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#0B0C0D"/><stop offset="1" stop-color="#34383C"/></radialGradient>
  <linearGradient id="stream" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#CFE3F2" stop-opacity="0.5"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.6" stop-color="#BFD6E8" stop-opacity="0.7"/><stop offset="1" stop-color="#E9F2F9" stop-opacity="0.5"/></linearGradient>
  <radialGradient id="glass" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.75"/><stop offset="0.7" stop-color="#DDE3E2" stop-opacity="0.45"/><stop offset="1" stop-color="#9AA5A4" stop-opacity="0.7"/></radialGradient>`;

const PHOTO_IDS = ['bS', 'bM', 'bL', 'bX', 'bG', 'paper', 'emboss', 'cloth', 'wrinkle', 'fabric', 'wood', 'stone', 'veins', 'enamel', 'fog', 'mold', 'mottle',
  'caustic', 'bleed', 'bleedSoft', 'smudge', 'cshadow', 'soft', 'b3', 'b8', 'b20', 'blade', 'chrome', 'hole', 'stream', 'glass'];

// 본문 안전 검사: 스크립트·외부 링크·HTML 삽입 금지, 크기 제한
function photoProblems(body) {
  const e = [];
  if (typeof body !== 'string' || !body.trim()) return ['비어 있음'];
  if (body.length > 60000) e.push(`너무 김 (${body.length}자, 60000자 이하)`);
  if (/<\s*(script|foreignObject|iframe|image|img|a|style|svg)\b/i.test(body)) e.push('script/foreignObject/image/a/style/svg 태그 사용 불가 (도형만)');
  if (/\son\w+\s*=/i.test(body)) e.push('이벤트 속성(on...) 사용 불가');
  if (/(href|src)\s*=|url\(\s*['"]?(?!#)/i.test(body)) e.push('외부 참조 불가 (url(#id) 만)');
  if (/<\s*text\b/i.test(body)) e.push('사진 안에 글자(text) 금지');
  return e;
}

// 900x900 사진 한 장 (SVG 문자열)
const photoSvg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900"><defs>${PHOTO_DEFS}</defs>
<clipPath id="pframe"><rect width="900" height="900"/></clipPath><g clip-path="url(#pframe)">${body}
<rect width="900" height="900" fill="url(#pwin)"/><rect width="900" height="900" fill="url(#pvig)"/><rect width="900" height="900" filter="url(#pgrain)"/></g></svg>`;

module.exports = { PHOTO_DEFS, PHOTO_IDS, photoProblems, photoSvg };
