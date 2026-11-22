// Shared drawing pieces: cards with real shadows, the blue pane, big type, pills.
import { BRAND_BLUE, card, canvasTexture, makeCanvas, roundRect, textTex, ramp, smooth, easeOut, easeOutBack, mix } from './core.js';

export function softShadowTex() {
  const [c, x] = makeCanvas(256, 256);
  x.filter = 'blur(26px)'; x.fillStyle = '#000'; x.fillRect(52, 52, 152, 152);
  return canvasTexture(c);
}

// A thing landing on a surface: large and faint, then tight and sharp.
export function landing(t, at, dur = .34, from = 1.28) {
  const u = ramp(t, at, at + dur);
  const k = easeOutBack(u, 1.1);
  return { u, k, scale: mix(from, 1, k), op: smooth(u, 0, .35) };
}

export function drawCard(s, target, shadowTex, tex, cx, cy, w, h, { rz = 0, rx = 0, ry = 0, scale = 1, opacity = 1, gain = 1, k = 1, shadow = .34, tint = [1, 1, 1], persp = 1600 } = {}) {
  if (opacity <= 0) return;
  if (shadow > 0) {
    const sh = mix(44, 11, k);
    s.quad(target, shadowTex, card(cx + sh * .3, cy + sh * .7, w * 1.75, h * 1.72, { rz, rx, ry, scale, persp }), { opacity: opacity * mix(.12, 1, k) * shadow * gain });
  }
  s.quad(target, tex, card(cx, cy, w, h, { rz, rx, ry, scale, persp }), { opacity, gain, tint });
}

// The logo's pane shape: the signature element.
export function drawPane(s, target, x, y, h, { gain = 1, opacity = 1, tint = BRAND_BLUE } = {}) {
  const w = h * .445, sk = h * .22;
  s.quad(target, null, [[x - w, y - h + sk], [x + w, y - h - sk], [x - w, y + h + sk], [x + w, y + h - sk]], { solid: true, tint, gain, opacity });
}

// Left-aligned or centred single line. Returns its width.
export function drawText(s, target, str, x, y, { size = 60, weight = 800, color = '#101418', align = 'left', opacity = 1, gain = 1, scale = 1, spacing = 0, rz = 0 } = {}) {
  const t = textTex(str, { size, weight, color, spacing, pad: 2 });
  const cx = align === 'center' ? x : align === 'right' ? x - t.w * scale / 2 : x + t.w * scale / 2;
  s.quad(target, t.tex, card(cx, y, t.w, t.h, { scale, rz }), { opacity, gain });
  return t.w * scale;
}

const pillCache = new Map();
export function pillTex(str, { size = 40, weight = 600, bg = 'rgba(244,246,249,.96)', color = '#141a20', border = null, padX = 34, h = 84 } = {}) {
  const key = JSON.stringify([str, size, weight, bg, color, border, padX, h]);
  if (pillCache.has(key)) return pillCache.get(key);
  const [, m] = makeCanvas(4, 4); m.font = `${weight} ${size}px "Noto Sans SC"`;
  const w = Math.ceil(m.measureText(str).width) + padX * 2;
  const [c, x] = makeCanvas(w + 6, h + 6);
  x.fillStyle = bg; roundRect(x, 3, 3, w, h, h / 2); x.fill();
  if (border) { x.strokeStyle = border; x.lineWidth = 2; roundRect(x, 3, 3, w, h, h / 2); x.stroke(); }
  x.fillStyle = color; x.font = `${weight} ${size}px "Noto Sans SC"`; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(str, 3 + w / 2, 3 + h / 2 + size * .04);
  const out = { tex: canvasTexture(c), w: w + 6, h: h + 6 };
  pillCache.set(key, out);
  return out;
}

export function fileTile(label, sub, { w = 300, h = 200, tone = 'dark', big = false } = {}) {
  const [c, x] = makeCanvas(w, h);
  const dark = tone === 'dark';
  const g = x.createLinearGradient(0, 0, 0, h);
  if (dark) { g.addColorStop(0, '#26303c'); g.addColorStop(1, '#141a22'); } else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#f1f3f6'); }
  x.fillStyle = g; roundRect(x, 1, 1, w - 2, h - 2, 18); x.fill();
  x.strokeStyle = dark ? 'rgba(205,225,245,.28)' : 'rgba(20,30,40,.12)'; x.lineWidth = 2; roundRect(x, 1, 1, w - 2, h - 2, 18); x.stroke();
  if (!big) { x.fillStyle = dark ? 'rgba(200,220,240,.13)' : 'rgba(20,40,70,.08)'; roundRect(x, 20, 20, w - 40, h * .42, 10); x.fill(); }
  x.fillStyle = dark ? '#ffffff' : '#141a20'; x.font = `800 ${Math.round(h * (big ? .23 : .155))}px "Noto Sans SC"`; x.textBaseline = 'middle'; x.fillText(label, 22, h * (big ? .4 : .68));
  if (sub) { x.fillStyle = dark ? 'rgba(205,220,235,.9)' : 'rgba(60,75,90,.8)'; x.font = `500 ${Math.round(h * (big ? .14 : .105))}px "Noto Sans SC"`; x.fillText(sub, 22, h * (big ? .72 : .86)); }
  return canvasTexture(c);
}

export function phoneFrameTex(w = 340, h = 660) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = '#0b0d10'; roundRect(x, 2, 2, w - 4, h - 4, 46); x.fill();
  x.globalCompositeOperation = 'destination-out'; roundRect(x, 12, 12, w - 24, h - 24, 36); x.fill(); x.globalCompositeOperation = 'source-over';
  return canvasTexture(c);
}

// Marks stand-in or mocked screens as illustration.
export function markerTex() {
  const [c, x] = makeCanvas(170, 50);
  x.fillStyle = 'rgba(8,10,14,.5)'; roundRect(x, 0, 0, 170, 50, 25); x.fill();
  x.fillStyle = 'rgba(235,240,246,.86)'; x.font = '500 24px "Noto Sans SC"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('画面为示意', 85, 27);
  return canvasTexture(c);
}
