// 半斤九两动效系统: the shared effect library (style frames v1, 2026-11-22).
// Everything is a pure function of time. 2D vector pieces (ink, line art, labels) are drawn on canvases and uploaded;
// compositing, glows and windows are GPU passes on the core Stage.
import { THREE, W, H, BRAND_BLUE, card, canvasTexture, makeCanvas, roundRect, textTex, clamp, ramp, smooth, easeOut, easeIn, easeInOut, easeOutBack, mix, hash, noise1 } from './core.js';
import { drawCard, drawPane, pillTex } from './kit.js';

export const NOTO = '"Noto Sans SC"', HAND = '"Long Cang"', BRUSH = '"Zhi Mang Xing"', MONO = 'Menlo, "Noto Sans SC"';
export const BLUE = '#0091ff', INK = '#16191e', RED = '#d23c2a';
export const SUB_Y = 1505;

// ---------- shaders ----------

export const DARK_FRAG = `
uniform vec3 top, bot, haze;
void main(){
  vec2 p = vec2(vUv.x, 1.-vUv.y);
  vec3 c = mix(top, bot, smoothstep(0., 1., p.y));
  float h = fbm(p*vec2(1.6, 2.4)+vec2(3.1, 7.7));
  c += haze*h*h*(1.15-p.y);
  vec2 g = fract(gl_FragCoord.xy/42.)-.5;
  c += vec3(.010, .020, .045)*smoothstep(.07, .0, length(g))*(1.-.7*p.y);
  outColor = vec4(c, 1.);
}`;

// The logo's pane as a window onto another world (sampled from 'world'), with a lit rim and a blue spill.
export const PANE_FRAG = `
uniform sampler2D world; uniform vec3 pane; uniform float zoom, open; uniform vec2 look;
void main(){
  vec2 p = vec2(vUv.x*W, (1.-vUv.y)*H);
  float h = pane.z, w = h*.445, sk = h*.22;
  vec2 q = p-pane.xy;
  float d = max(abs(q.x)-w, (abs(q.y+sk*q.x/w)-h)*.97);
  vec3 blue = vec3(0., .283, 1.);
  if (d < 0.) {
    vec2 s = q/zoom+look;
    vec3 c = texture(world, vec2(s.x/W, 1.-s.y/H)).rgb;
    c += blue*(exp(d/5.)*2.2+exp(d/40.)*.35)*open;
    outColor = vec4(c, 1.);
  } else {
    vec3 g = blue*(exp(-d/7.)*2.4+exp(-d/70.)*.55+exp(-d/260.)*.18) + vec3(.6,.8,1.)*exp(-d/2.5)*.8;
    outColor = vec4(g*open, 0.);
  }
}`;

// Things that stand behind a coloured real object: hidden where the plate matches (magenta here), below yMin.
export const OCC_FRAG = `
uniform sampler2D fx, plate; uniform float yMin;
void main(){
  vec4 f = texture(fx, vUv);
  vec3 b = texture(plate, vec2(vUv.x, 1.-vUv.y)).rgb;
  float m = smoothstep(.05, .15, min(b.r, b.b)-b.g) * step(yMin, (1.-vUv.y)*H);
  outColor = f*(1.-m);
}`;

// ---------- frame sequences ----------

// Numbered JPEG frames (NNNNNN.jpg) served from base, one texture, reloaded on demand.
export class SeqTex {
  constructor(base, { start = 0, last = Infinity } = {}) {
    this.base = base; this.start = start; this.last = last; this.cur = -1;
    const t = this.tex = new THREE.Texture(); t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
    this.w = 0; this.h = 0;
  }
  async load(n) {
    n = Math.max(this.start, Math.min(this.last, n));
    if (n === this.cur) return;
    const url = `${this.base}/${String(n).padStart(6, '0')}.jpg`, r = await fetch(url);
    if (!r.ok) throw new Error(`missing frame ${url}`);
    const b = await r.blob();
    const img = await createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    this.tex.image?.close?.(); this.tex.image = img; this.tex.needsUpdate = true; this.w = img.width; this.h = img.height; this.cur = n;
  }
}

// Film time <-> source time over a list of kept source ranges.
export class Cuts {
  constructor(segs) {
    this.segs = segs; let f = 0;
    this.map = segs.map(([a, b]) => { const m = { a, b, f0: f }; f += b - a; return m; });
    this.duration = f;
  }
  toSrc(ft) { for (const m of this.map) if (ft < m.f0 + (m.b - m.a)) return { t: m.a + Math.max(0, ft - m.f0), seg: this.map.indexOf(m) }; const m = this.map[this.map.length - 1]; return { t: m.b, seg: this.map.length - 1 }; }
  toFilm(st) { for (const m of this.map) if (st <= m.b) return m.f0 + Math.max(0, st - m.a); return this.duration; }
}

// ---------- helpers ----------

export function cardPoint(cx, cy, w, h, o, u, v) {
  const { rz = 0, rx = 0, ry = 0, scale = 1, persp = 1600 } = o;
  const a = rz * Math.PI / 180, b = rx * Math.PI / 180, c = ry * Math.PI / 180;
  let x = (u * 2 - 1) * w / 2 * scale, y = (v * 2 - 1) * h / 2 * scale;
  const z1 = -x * Math.sin(c); x = x * Math.cos(c);
  const y1 = y * Math.cos(b) - z1 * Math.sin(b), z = y * Math.sin(b) + z1 * Math.cos(b);
  const px = x * Math.cos(a) - y1 * Math.sin(a), py = x * Math.sin(a) + y1 * Math.cos(a);
  const k = persp / (persp + z);
  return [cx + px * k, cy + py * k];
}
export const uvr = (iw, ih, x, y, w, h) => [x / iw, y / ih, w / iw, h / ih];
// 0 -> 1 between a and a+d, held, then 1 -> 0 between b-d and b.
export const inout = (t, a, b, d = .3) => smooth(t, a, a + d) * (1 - smooth(t, b - d, b));

// ---------- ink (hand-drawn strokes), all with a draw-on fraction p ----------

export function ink(x, pts, w, color, seed = 1, p = 1) {
  if (p <= 0) return;
  x.save(); x.strokeStyle = color; x.lineCap = 'round'; x.lineJoin = 'round';
  const n = pts.length - 1, upto = p * n;
  for (let i = 0; i < n && i < upto; i++) {
    const u = (i + .5) / n, k = Math.pow(Math.sin(Math.PI * u), .45), f = Math.min(1, upto - i);
    x.lineWidth = w * (.25 + .75 * k) * (0.9 + .2 * hash(seed + i * .37));
    x.beginPath(); x.moveTo(pts[i][0], pts[i][1]); x.lineTo(mix(pts[i][0], pts[i + 1][0], f), mix(pts[i][1], pts[i + 1][1], f)); x.stroke();
  }
  x.restore();
}
export const wobble = (pts, amp, seed) => pts.map(([px, py], i) => [px + (noise1(i * .35 + seed) - .5) * amp, py + (noise1(i * .35 + seed + 40) - .5) * amp]);
export const lineN = (a, b, n = 24) => Array.from({ length: n + 1 }, (_, i) => [mix(a[0], b[0], i / n), mix(a[1], b[1], i / n)]);
export function ellipseScribble(cx, cy, rx, ry, turns, seed, rot = 0) {
  const n = Math.round(60 * turns), out = [];
  for (let i = 0; i <= n; i++) {
    const a = -2.2 + i / n * turns * 6.283, r = 1 + (noise1(i * .21 + seed) - .5) * .16 + i / n * .06;
    const ex = Math.cos(a) * rx * r, ey = Math.sin(a) * ry * r;
    out.push([cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
  }
  return out;
}
export function arrow(x, from, to, bend, w, color, seed, p = 1) {
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const u = i / 28, nx = -(to[1] - from[1]), ny = to[0] - from[0], l = Math.hypot(nx, ny), b = Math.sin(Math.PI * u) * bend;
    pts.push([mix(from[0], to[0], u) + nx / l * b, mix(from[1], to[1], u) + ny / l * b]);
  }
  ink(x, wobble(pts, 3, seed), w, color, seed, Math.min(1, p / .8));
  if (p > .8) {
    const q = (p - .8) / .2, [ax, ay] = pts[pts.length - 1], [bx, by] = pts[pts.length - 4], ang = Math.atan2(ay - by, ax - bx);
    for (const s of [-1, 1]) ink(x, lineN([ax, ay], [ax - Math.cos(ang + s * .5) * 34, ay - Math.sin(ang + s * .5) * 34], 6), w * .9, color, seed + s, q);
  }
}
// A handwritten word revealed left to right (p), centred at px, py.
export function handWord(x, str, px, py, size, rot, font, color, p = 1, align = 'center') {
  if (p <= 0) return;
  x.save(); x.translate(px, py); x.rotate(rot); x.font = `${size}px ${font}`; x.textBaseline = 'middle'; x.textAlign = align;
  const w = x.measureText(str).width, x0 = align === 'center' ? -w / 2 : 0;
  x.beginPath(); x.rect(x0 - 20, -size, (w + 40) * p, size * 2); x.clip();
  x.fillStyle = color; x.fillText(str, 0, 0); x.restore();
}
export function strike(x, x0, x1, y, p, seed = 3, color = RED) { ink(x, wobble(lineN([x0, y + 4], [x1, y - 6], 20), 4, seed), 8, color, seed, p); }

// A canvas layer redrawn every frame (doodles, line art), uploaded as one texture.
export class Layer {
  constructor(w = W, h = H) { [this.c, this.x] = makeCanvas(w, h); this.tex = canvasTexture(this.c); this.tex.generateMipmaps = false; this.tex.minFilter = THREE.LinearFilter; }
  begin() { this.x.setTransform(1, 0, 0, 1, 0, 0); this.x.clearRect(0, 0, this.c.width, this.c.height); return this.x; }
  end() { this.tex.needsUpdate = true; return this.tex; }
}

// ---------- textures ----------

export function glowTex() {
  const [c, x] = makeCanvas(256, 256);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return canvasTexture(c);
}
export function rectGlowTex() {
  const [c, x] = makeCanvas(512, 512);
  x.filter = 'blur(40px)'; x.fillStyle = '#fff'; x.fillRect(90, 90, 332, 332);
  return canvasTexture(c);
}
export function boxOutlineTex(w, h, color = BLUE, lw = 6) {
  const [c, x] = makeCanvas(w, h);
  x.strokeStyle = color; x.lineWidth = lw; roundRect(x, lw / 2 + 1, lw / 2 + 1, w - lw - 2, h - lw - 2, 12); x.stroke();
  return canvasTexture(c);
}
export function lensTex(img, cx, cy, r, size) {
  const [c, x] = makeCanvas(size, size);
  x.save(); x.beginPath(); x.arc(size / 2, size / 2, size / 2 - 6, 0, 7); x.clip();
  x.drawImage(img, cx - r, cy - r, r * 2, r * 2, 0, 0, size, size);
  const g = x.createRadialGradient(size / 2, size / 2, size * .3, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,30,80,.35)'); x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.restore();
  x.strokeStyle = BLUE; x.lineWidth = 9; x.beginPath(); x.arc(size / 2, size / 2, size / 2 - 7, 0, 7); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2; x.beginPath(); x.arc(size / 2, size / 2, size / 2 - 13, 0, 7); x.stroke();
  return canvasTexture(c);
}
export function numberRowTex(big, unit, label, note = '') {
  const w = 900, h = 250, [c, x] = makeCanvas(w, h);
  x.fillStyle = 'rgba(170,188,210,.85)'; x.font = `600 30px ${NOTO}`; x.textBaseline = 'alphabetic'; x.fillText(label, 0, 40);
  x.fillStyle = '#ffffff'; x.font = `900 140px ${NOTO}`; x.fillText(big, -6, 180);
  const bw = x.measureText(big).width;
  x.fillStyle = '#3aa4ff'; x.font = `800 52px ${NOTO}`; x.fillText(unit, bw + 14, 176);
  if (note) { x.fillStyle = 'rgba(150,168,190,.85)'; x.font = `500 26px ${NOTO}`; x.fillText(note, 0, 228); }
  x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(0, 246, w, 2);
  return { tex: canvasTexture(c), w, h };
}
export function heatTex(grid) {
  const [c, x] = makeCanvas(W, 560);
  const a = 34, b = 17, ox = 438, oy = 120, lv = (v) => (v < 28 ? -1 : v < 50 ? 0 : v < 95 ? 1 : v < 150 ? 2 : v < 210 ? 3 : 4);
  const cols = ['#18263c', '#0f3f86', '#0a62cf', '#0a84f5', '#46b0ff'];
  const cells = [];
  grid.forEach((row, j) => row.forEach((v, i) => { const L = lv(v); if (L >= 0) cells.push({ i, j, L }); }));
  cells.sort((p, q) => (p.i + p.j) - (q.i + q.j));
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, (n >> 16) * k) | 0},${Math.min(255, ((n >> 8) & 255) * k) | 0},${Math.min(255, (n & 255) * k) | 0})`; };
  return { canvas: c, ctx: x, draw(rise = 1) {
    x.clearRect(0, 0, W, 560);
    for (const { i, j, L } of cells) {
      const cx = ox + (i - j) * a, cy = oy + (i + j) * b, k = clamp(rise * 1.6 - (i + j) / 20 * .6, 0, 1), hgt = (L === 0 ? 4 : L * 34) * easeOut(k), g = .86, col = cols[L];
      const T = [[cx, cy - hgt], [cx + a * g, cy + b * g - hgt], [cx, cy + 2 * b * g - hgt], [cx - a * g, cy + b * g - hgt]];
      const face = (pts, fill) => { x.fillStyle = fill; x.beginPath(); x.moveTo(...pts[0]); pts.slice(1).forEach((p) => x.lineTo(...p)); x.closePath(); x.fill(); };
      x.globalAlpha = clamp(k * 3, 0, 1);
      face([T[3], T[2], [T[2][0], T[2][1] + hgt], [T[3][0], T[3][1] + hgt]], shade(col, .62));
      face([T[2], T[1], [T[1][0], T[1][1] + hgt], [T[2][0], T[2][1] + hgt]], shade(col, .42));
      face(T, shade(col, L >= 3 ? 1.25 : 1.1));
    }
    x.globalAlpha = 1;
  } };
}
export function terminalTex(lines, hi, title) {
  const w = 980, lh = 60, h = 120 + lines.length * lh + 30, [c, x] = makeCanvas(w, h);
  x.fillStyle = '#0d1117'; roundRect(x, 0, 0, w, h, 24); x.fill();
  x.fillStyle = '#161b22'; roundRect(x, 0, 0, w, 74, [24, 24, 0, 0]); x.fill();
  [['#ff5f57', 36], ['#febc2e', 66], ['#28c840', 96]].forEach(([col, px]) => { x.fillStyle = col; x.beginPath(); x.arc(px, 37, 9, 0, 7); x.fill(); });
  x.fillStyle = 'rgba(200,210,222,.7)'; x.font = `500 24px ${NOTO}`; x.textBaseline = 'middle'; x.fillText(title, 130, 38);
  lines.forEach((ln, i) => {
    const y = 120 + i * lh, on = Array.isArray(hi) ? hi.includes(i) : i === hi;
    if (on) { x.fillStyle = 'rgba(0,145,255,.22)'; x.fillRect(0, y - lh / 2, w, lh); x.fillStyle = BLUE; x.fillRect(0, y - lh / 2, 7, lh); }
    x.fillStyle = 'rgba(140,150,165,.75)'; x.font = `400 26px ${MONO}`; x.textAlign = 'right'; x.fillText(String(i + 1), 62, y);
    x.textAlign = 'left'; x.font = `400 29px ${MONO}`;
    x.fillStyle = ln.trim().startsWith('↑') ? '#4aa8ff' : on ? '#ffffff' : '#d4dbe4'; x.fillText(ln, 92, y);
  });
  return { tex: canvasTexture(c), w, h, lh };
}
export function popLineTex(str, size = 38) {
  const [, m] = makeCanvas(4, 4); m.font = `700 ${size}px ${MONO}`;
  const w = Math.ceil(m.measureText(str).width) + 80, h = Math.round(size * 3.1), [c, x] = makeCanvas(w, h);
  x.fillStyle = '#ffffff'; roundRect(x, 0, 0, w, h, 20); x.fill();
  x.fillStyle = BLUE; roundRect(x, 0, 0, 10, h, [20, 0, 0, 20]); x.fill();
  x.fillStyle = '#0d1117'; x.font = `700 ${size}px ${MONO}`; x.textBaseline = 'middle'; x.fillText(str, 44, h / 2 + 2);
  return { tex: canvasTexture(c), w, h };
}
export function gridPaperTex() {
  const [c, x] = makeCanvas(W, H);
  x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(30,80,160,.075)'; x.lineWidth = 1.5;
  for (let i = 0; i <= W; i += 54) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let j = 0; j <= H; j += 54) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }
  return canvasTexture(c);
}
export function tapeTex() {
  const [c, x] = makeCanvas(160, 50);
  x.fillStyle = 'rgba(236,222,190,.82)'; x.fillRect(0, 0, 160, 50);
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 10; i++) { x.beginPath(); x.arc(0, i * 5, 2.4, 0, 7); x.arc(160, i * 5 + 2, 2.4, 0, 7); x.fill(); }
  return canvasTexture(c);
}
export function chipTex(str, { size = 40, dark = true, h = 86 } = {}) {   // section chip: dark pill with the pane mark
  const [, m] = makeCanvas(4, 4); m.font = `800 ${size}px ${NOTO}`;
  const w = Math.ceil(m.measureText(str).width) + 84, [c, x] = makeCanvas(w, h);
  x.fillStyle = dark ? 'rgba(10,14,20,.82)' : 'rgba(255,255,255,.95)'; roundRect(x, 0, 0, w, h, h / 2); x.fill();
  x.fillStyle = BLUE; x.beginPath(); x.moveTo(26, h * .36); x.lineTo(42, h * .27); x.lineTo(42, h * .66); x.lineTo(26, h * .75); x.fill();
  x.fillStyle = dark ? '#fff' : '#12171d'; x.font = `800 ${size}px ${NOTO}`; x.textBaseline = 'middle'; x.fillText(str, 56, h / 2 + 1);
  return { tex: canvasTexture(c), w, h };
}

// ---------- line art: sources -> gateway -> partners ----------
// state: { src: [{name, sub, x, a}], gate: a, laptops: [{x, y, a}], keys: k (0..1), flow: time, label: a }
export function drawLineWorld(x, st) {
  const glow = (on) => { x.shadowColor = on ? 'rgba(40,140,255,.95)' : 'transparent'; x.shadowBlur = on ? 16 : 0; };
  const G = st.gatePos;
  for (const s of st.src) {
    if (s.a <= 0) continue;
    // line to the gateway draws on after the box lands
    const p = clamp((s.a - .4) / .6, 0, 1);
    if (p > 0) {
      x.save(); x.globalAlpha = .8; x.lineWidth = 2.5; x.strokeStyle = 'rgb(235,242,250)'; glow(true);
      const N = 30; x.beginPath();
      for (let i = 0; i <= N * p; i++) {
        const t = i / N, it = 1 - t;
        const px = it ** 3 * s.x + 3 * it * it * t * s.x + 3 * it * t * t * G[0] + t ** 3 * G[0];
        const py = it ** 3 * 400 + 3 * it * it * t * 540 + 3 * it * t * t * 520 + t ** 3 * (G[1] - 95);
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke(); x.restore();
      if (st.flow != null && p >= 1) for (const off of [0, .5]) {
        const t = (st.flow * .55 + off + hash(s.x) ) % 1, it = 1 - t;
        const px = it ** 3 * s.x + 3 * it * it * t * s.x + 3 * it * t * t * G[0] + t ** 3 * G[0];
        const py = it ** 3 * 400 + 3 * it * it * t * 540 + 3 * it * t * t * 520 + t ** 3 * (G[1] - 95);
        glow(true); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill();
      }
    }
  }
  st.laptops.forEach((L, i) => {
    if (L.a <= 0) return;
    x.save(); x.globalAlpha = smooth(L.a, 0, .5) * .9; x.setLineDash([10, 12]); x.lineWidth = 2; x.strokeStyle = 'rgba(200,220,245,.45)'; glow(false);
    const p = clamp(L.a, 0, 1); x.beginPath(); x.moveTo(G[0], G[1] + 95); x.lineTo(mix(G[0], L.x, p), mix(G[1] + 95, L.y - 58, p)); x.stroke(); x.restore();
    if (st.flow != null && L.a >= 1) for (const ph of [hash(i) , hash(i + 9) + .5]) {
      const u = (st.flow * .45 + ph) % 1; glow(true); x.fillStyle = '#e8f4ff'; x.beginPath(); x.arc(mix(G[0], L.x, u), mix(G[1] + 95, L.y - 58, u), 4.2, 0, 7); x.fill();
    }
  });
  for (const s of st.src) {
    if (s.a <= 0) continue;
    const k = easeOutBack(clamp(s.a / .4, 0, 1), 1.2), sc = mix(.6, 1, k), bw = 240 * sc, bh = 120 * sc;
    x.save(); x.globalAlpha = clamp(s.a / .25, 0, 1);
    glow(true); x.fillStyle = '#080b10'; roundRect(x, s.x - bw / 2, 340 - bh / 2, bw, bh, 18); x.fill();
    x.lineWidth = 2.5; x.strokeStyle = 'rgba(240,246,252,.9)'; roundRect(x, s.x - bw / 2, 340 - bh / 2, bw, bh, 18); x.stroke(); glow(false);
    x.fillStyle = '#fff'; x.font = `800 ${Math.round(38 * sc)}px ${NOTO}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s.name, s.x, 322);
    x.fillStyle = s.subBlue ? '#5ab4ff' : 'rgba(190,205,222,.9)'; x.font = `600 ${Math.round(25 * sc)}px ${NOTO}`; x.fillText(s.sub, s.x, 366);
    x.restore();
  }
  st.laptops.forEach((L) => {
    if (L.a <= 0) return;
    const k = easeOutBack(clamp(L.a / .5, 0, 1), 1.1), sc = mix(.7, 1, k), lx = L.x, ly = L.y;
    x.save(); x.globalAlpha = clamp(L.a / .3, 0, 1); x.translate(lx, ly); x.scale(sc, sc); x.translate(-lx, -ly);
    glow(true); x.fillStyle = '#070a0f'; roundRect(x, lx - 88, ly - 58, 176, 108, 8); x.fill();
    x.lineWidth = 2.4; x.strokeStyle = 'rgba(236,243,250,.92)'; roundRect(x, lx - 88, ly - 58, 176, 108, 8); x.stroke(); glow(false);
    const lit = L.key ?? 0, g = x.createLinearGradient(0, ly - 48, 0, ly + 40);
    g.addColorStop(0, `rgba(0,120,255,${.08 + .25 * lit})`); g.addColorStop(1, `rgba(0,120,255,${.03 + .05 * lit})`);
    x.fillStyle = g; roundRect(x, lx - 78, ly - 48, 156, 88, 4); x.fill();
    x.lineWidth = 2.4; x.strokeStyle = 'rgba(236,243,250,.92)';
    x.beginPath(); x.moveTo(lx - 104, ly + 66); x.lineTo(lx + 104, ly + 66); x.lineTo(lx + 92, ly + 52); x.lineTo(lx - 92, ly + 52); x.closePath(); x.stroke();
    if (lit > 0) {
      x.globalAlpha *= clamp(lit * 2, 0, 1); glow(true); x.strokeStyle = '#5ab4ff'; x.lineWidth = 3.2;
      x.beginPath(); x.arc(lx - 22, ly - 4, 11, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(lx - 11, ly - 4); x.lineTo(lx - 11 + 41 * clamp(lit * 1.5, 0, 1), ly - 4); x.moveTo(lx + 20, ly - 4); x.lineTo(lx + 20, ly + 7); x.moveTo(lx + 29, ly - 4); x.lineTo(lx + 29, ly + 5); x.stroke(); glow(false);
    }
    x.restore();
  });
  if (st.label > 0) {
    x.save(); x.globalAlpha = st.label; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillStyle = '#fff'; x.font = `800 46px ${NOTO}`; x.fillText(st.gateName || '公司网关', G[0] + 92, G[1] - 20);
    x.fillStyle = 'rgba(190,205,222,.9)'; x.font = `500 28px ${NOTO}`; x.fillText(st.gateSub || '', G[0] + 92, G[1] + 28);
    x.restore();
  }
}

// ---------- composite pieces ----------

export function drawSubtitle(s, target, str, a = 1) {
  if (!str || a <= 0) return;
  const tx = textTex(str, { size: 50, weight: 700, color: '#ffffff', spacing: 1, pad: 6 });
  const sc = Math.min(1, 960 / tx.w);
  const back = pillTex(' ', { size: 10, h: Math.round(tx.h * sc + 26), padX: Math.round(tx.w * sc / 2 + 22), bg: 'rgba(12,16,22,.58)' });
  s.quad(target, back.tex, card(540, SUB_Y, back.w, back.h), { opacity: a });
  s.quad(target, tx.tex, card(540, SUB_Y, tx.w * sc, tx.h * sc), { opacity: a });
}

// Square picture-in-picture of the speaker: blue frame, pane tab, name, live level bars.
export function drawPip(s, target, shadow, tex, uv, px, py, sz, { a = 1, level = 0, t = 0, name = '汤九两' } = {}) {
  if (a <= 0) return;
  const k = easeOutBack(clamp(a, 0, 1), 1.2), sc = mix(.82, 1, k), z = sz * sc;
  s.quad(target, shadow, card(px + 14, py + 26, z * 1.7, z * 1.7), { opacity: .7 * a });
  s.quad(target, null, card(px, py, z + 14, z + 14), { solid: true, tint: BRAND_BLUE, gain: 1.1, opacity: a });
  s.quad(target, tex, card(px, py, z, z), { uvRect: uv, opacity: a });
  drawPane(s, target, px - z / 2 + 6, py - z / 2 - 30, 22 * sc, { gain: 1.2, opacity: a });
  const nm = pillTex(name, { size: 30, weight: 800, h: 56, bg: 'rgba(10,14,20,.72)', color: '#fff', padX: 22 });
  s.quad(target, nm.tex, card(px - z / 2 + 24 + nm.w / 2, py + z / 2 - 42, nm.w, nm.h), { opacity: a });
  for (let i = 0; i < 22; i++) {
    const shape = .35 + .65 * Math.pow(noise1(i * .55 + t * 3.1), 1.3);
    const hgt = 6 + 46 * clamp(level, 0, 1) * shape;
    s.quad(target, null, card(px - z / 2 + 9 + i * (z - 18) / 21, py + z / 2 + 44 - hgt / 2, 9, hgt), { solid: true, tint: BRAND_BLUE, gain: 1.3, opacity: .9 * a });
  }
}

// A real screen lifted off the page: glow, shadow, faint floor reflection.
export function drawScreen(s, target, { shadow, rglow }, tex, uv, cx, cy, w, h, o = {}, { a = 1, gain = 1.15, reflect = true } = {}) {
  if (a <= 0) return;
  s.quad(target, rglow, card(cx, cy, w * 1.25, h * 1.35, o), { tint: [.03, .2, .75], add: true, opacity: .6 * a });
  if (reflect) s.quad(target, tex, card(cx, cy + h + 14, w, h, { ...o, rx: -(o.rx || 0) }), { uvRect: [uv[0], uv[1] + uv[3], uv[2], -uv[3]], opacity: .08 * a });
  s.quad(target, shadow, card(cx + 20, cy + 40, w * 1.6, h * 1.6, o), { opacity: .8 * a });
  s.quad(target, tex, card(cx, cy, w, h, o), { uvRect: uv, gain, opacity: a });
}

export { drawCard, drawPane, pillTex };

// ---------- rounded shots (PIP, evidence windows): soft shadow, thin edge, faint blue glow ----------

export const ROUND_FRAG = `
uniform sampler2D map; uniform vec4 uvRect, box, shadow; uniform float radius, opacity, isHDR, gain, edge, glow;
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
void main(){
  vec2 p = vec2(vUv.x*W, (1.-vUv.y)*H), hb = box.zw*.5;
  float d = sdBox(p-box.xy, hb, radius);
  float ds = sdBox(p-box.xy-shadow.xy, hb, radius);
  float sh = shadow.w*exp(-max(ds, 0.)/shadow.z);
  float inside = 1.-smoothstep(-.8, .8, d);
  vec2 lp = clamp((p-(box.xy-hb))/box.zw, 0., 1.);
  vec4 c = texture(map, uvRect.xy+lp*uvRect.zw);
  vec3 col = (isHDR > .5 ? c.rgb : toLinear(c.rgb))*gain;
  col = mix(col, vec3(.85, .92, 1.), edge*(1.-smoothstep(1., 2.6, -d))*inside);     // thin light edge
  vec3 g = vec3(0., .283, 1.)*glow*exp(-max(d, 0.)/18.)*(1.-inside);              // faint blue halo
  float a = inside*opacity;
  outColor = vec4(col*a + g*opacity, a + sh*opacity*(1.-inside)*(1.-a));
}`;

export function makeRoundMat(fullMaterial, THREE) {
  const u = (v) => ({ value: v });
  return fullMaterial(ROUND_FRAG, { map: u(null), uvRect: u(new THREE.Vector4(0, 0, 1, 1)), box: u(new THREE.Vector4()), shadow: u(new THREE.Vector4(10, 26, 38, .55)),
    radius: u(30), opacity: u(1), isHDR: u(0), gain: u(1), edge: u(.6), glow: u(.5) }, 'over');
}

// box: [cx, cy, w, h] in pixels; uv: [x, y, w, h] normalised, top-left origin.
export function drawRound(s, target, mat, tex, uv, box, { radius = 30, opacity = 1, hdr = false, gain = 1, edge = .6, glow = .5, shadow = [10, 26, 38, .55] } = {}) {
  if (opacity <= 0) return;
  const un = mat.uniforms;
  un.map.value = tex; un.uvRect.value.set(...uv); un.box.value.set(...box); un.radius.value = radius; un.opacity.value = opacity;
  un.isHDR.value = hdr ? 1 : 0; un.gain.value = gain; un.edge.value = edge; un.glow.value = glow; un.shadow.value.set(...shadow);
  s.pass(mat, target);
}

// The speaker in a rounded portrait window, with live level bars under it.
export function drawPipRound(s, target, mat, tex, uv, cx, cy, w, h, { a = 1, level = 0, t = 0, name = '汤九两' } = {}) {
  if (a <= 0) return;
  const k = easeOutBack(clamp(a, 0, 1), 1.2), sc = mix(.85, 1, k);
  drawRound(s, target, mat, tex, uv, [cx, cy, w * sc, h * sc], { radius: 34 * sc, opacity: a, glow: .5, edge: .7 });
  const nm = pillTex(name, { size: 28, weight: 800, h: 52, bg: 'rgba(10,14,20,.66)', color: '#fff', padX: 20 });
  s.quad(target, nm.tex, card(cx - w * sc / 2 + 20 + nm.w / 2, cy + h * sc / 2 - 38, nm.w, nm.h), { opacity: a });
  for (let i = 0; i < 18; i++) {
    const shape = .35 + .65 * Math.pow(noise1(i * .55 + t * 3.1), 1.3), hgt = 5 + 30 * clamp(level, 0, 1) * shape;
    s.quad(target, null, card(cx - w * sc / 2 + 30 + i * (w * sc - 60) / 17, cy + h * sc / 2 + 34 - hgt / 2, 7, hgt), { solid: true, tint: BRAND_BLUE, gain: 1.3, opacity: .85 * a });
  }
}

// A real recording as proof: rounded window with a small "真实录屏" tag above it.
export function drawEvidence(s, target, mat, tex, uv, cx, cy, w, h, { a = 1, label = '真实后台录屏 · 2026-11-19', gain = 1.15 } = {}) {
  if (a <= 0) return;
  const k = easeOutBack(clamp(a, 0, 1), 1.1), sc = mix(.9, 1, k);
  drawRound(s, target, mat, tex, uv, [cx, cy, w * sc, h * sc], { radius: 22, opacity: a, gain, glow: .45, edge: .45 });
  const tg = chipTex(label, { size: 24, h: 50 });
  s.quad(target, tg.tex, card(cx - w * sc / 2 + tg.w / 2, cy - h * sc / 2 - 36, tg.w, tg.h), { opacity: a });
}
