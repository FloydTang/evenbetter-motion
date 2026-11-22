// Shared base for the type-led 科普 films: typed lines with the blue pane as cursor, the blue pen ring, the rolling year,
// sheet slides with motion blur, and the end card (pane flies into the 半斤九两 logo, slogan typed under it).
// Each episode subclasses TypeFilm and draws its own worlds; the look of each world stays per film.
import {
  THREE, W, H, BRAND_BLUE, Stage, fullMaterial, COPY_FRAG, BLUR_FRAG, RAYS_FRAG, FINAL_FRAG,
  clamp, ramp, smooth, easeOut, easeInOut, mix, card, canvasTexture, makeCanvas, rgb,
} from './core.js';
import { drawPane } from './kit.js';

export const NOTO = '"Noto Sans SC"', SONG = '"Songti SC"', SERIF = 'Baskerville', TIMES = '"Times New Roman"';
export const DARK = '#0b0c0e', INK = '#17191c', MUTED_D = '#8d9299', MUTED_L = '#6f6b62';
export const SLOGAN = '把重复交给 AI，把时间还给真实世界。';
export const LOGO = { w: 860, h: 860, cy: 905, pane: [344, 860, 19], lineY: 1050 };
export const rect = (x, y, w, h) => [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
export const FLIP = [0, 1, 1, -1];
const u = (v) => ({ value: v });

const PAPER_FRAG = `
uniform vec3 lo, hi; uniform float grain;
void main(){
  vec2 p = vec2(vUv.x*W,(1.-vUv.y)*H);
  float f = fbm(p*.006)*.6 + fbm(p*vec2(.02,.09))*.2 + fbm(p*vec2(.09,.02))*.2;
  vec3 c = mix(lo,hi,f) + (h21(p*.7)-.5)*grain;
  c *= 1.-.1*smoothstep(.34,.72,abs(vUv.x-.5))-.05*smoothstep(.36,.66,abs(vUv.y-.5));
  outColor = vec4(toLinear(c),1.);
}`;
const GLOW_FRAG = `
uniform vec2 pos, radius; uniform vec3 col;
void main(){ vec2 q=(vec2(vUv.x*W,(1.-vUv.y)*H)-pos)/radius; float k=exp(-dot(q,q)); outColor=vec4(col*k,0.); }`;

const textCache = new Map();
export function tx(str, { size = 48, weight = 700, color = '#fff', font = NOTO, spacing = 0 } = {}) {
  const key = JSON.stringify([str, size, weight, color, font, spacing]);
  if (textCache.has(key)) return textCache.get(key);
  const f = `${weight} ${size}px ${font}`, [, m] = makeCanvas(4, 4);
  m.font = f; m.letterSpacing = `${spacing}px`;
  const w = Math.ceil(m.measureText(str || ' ').width) + 8, h = Math.ceil(size * 1.6), [c, x] = makeCanvas(w, h);
  x.font = f; x.letterSpacing = `${spacing}px`; x.fillStyle = color; x.textBaseline = 'middle';
  x.fillText(str, 4, h / 2 + size * .04);
  const out = { tex: canvasTexture(c), w, h };
  textCache.set(key, out);
  return out;
}

const ringCache = new Map();
function ringTex(w, h, step, color) {
  const key = `${w}|${h}|${step}|${color}`;
  if (ringCache.has(key)) return ringCache.get(key);
  const pad = 14, [c, x] = makeCanvas(w + pad * 2, h + pad * 2), cx = w / 2 + pad, cy = h / 2 + pad;
  x.strokeStyle = color; x.lineCap = 'round'; x.lineJoin = 'round';
  const total = Math.PI * 2 * 1.08, end = total * step / 24;
  let last = null;
  for (let a = 0; a <= end; a += .05) {
    const th = -2.45 + a, g = a / total;
    const rx = w / 2 * (1 + .025 * Math.sin(a * 2.3) - .03 * g), ry = h / 2 * (1 + .05 * Math.sin(a * 1.7 + 1) - .05 * g);
    const p = [cx + rx * Math.cos(th), cy + ry * Math.sin(th) + 2 * g];
    if (last) { x.lineWidth = 3 + 2.6 * Math.sin(Math.PI * clamp(g + .08)); x.beginPath(); x.moveTo(...last); x.lineTo(...p); x.stroke(); }
    last = p;
  }
  const out = { tex: canvasTexture(c), w: w + pad * 2, h: h + pad * 2 };
  ringCache.set(key, out);
  return out;
}

export class TypeFilm {
  constructor(job) { this.job = job; this.fps = job.fps; }

  // base: the episode's URL folder; end: { fly, land, logo, type, out, end, from: [x, y, h] } in film seconds.
  async setup(base, end) {
    const s = this.stage = new Stage();
    this.base = base; this.endT = end;
    this.comp = s.rt(); this.accum = s.rt(); this.final = s.rt(); this.holdA = s.rt(); this.holdB = s.rt();
    this.mask = s.rt(W / 2, H / 2); this.raysRT = s.rt(W / 4, H / 4); this.raysA = s.rt(W / 4, H / 4); this.raysB = s.rt(W / 4, H / 4);
    this.mGlow = fullMaterial(GLOW_FRAG, { pos: u(new THREE.Vector2(540, 700)), radius: u(new THREE.Vector2(600, 400)), col: u(new THREE.Vector3()) }, 'add');
    this.mCopy = fullMaterial(COPY_FRAG, { src: u(null), gain: u(1) });
    this.mAdd = fullMaterial(COPY_FRAG, { src: u(null), gain: u(1) }, 'add');
    this.mBlur = fullMaterial(BLUR_FRAG, { src: u(null), dir: u(new THREE.Vector2()) });
    this.mRays = fullMaterial(RAYS_FRAG, { mask: u(null), center: u(new THREE.Vector2(.5, 1.3)), density: u(.82), decay: u(.975), gain: u(2.6), time: u(0) });
    this.mFinal = fullMaterial(FINAL_FRAG, { src: u(this.final.texture), grain: u(.016), frameNo: u(0), vignette: u(.08), aberr: u(0), fade: u(1), lift: u(0) });
    this.logo = await this.image('logo_bj.png');
  }

  async image(name) {
    const b = await createImageBitmap(await (await fetch(`${this.base}/assets/${name}`)).blob());
    const [c, x] = makeCanvas(b.width, b.height); x.drawImage(b, 0, 0);
    return canvasTexture(c);
  }

  paper(lo, hi, grain = 0) {
    const v3 = (hex) => new THREE.Vector3(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
    return fullMaterial(PAPER_FRAG, { lo: u(v3(lo)), hi: u(v3(hi)), grain: u(grain) });
  }

  solid(target, hex, opacity = 1) { this.stage.quad(target, null, card(540, 960, 1120, 1960), { solid: true, tint: rgb(hex), opacity }); }

  glow(target, x, y, rx, ry, col) {
    const G = this.mGlow.uniforms; G.pos.value.set(x, y); G.radius.value.set(rx, ry); G.col.value.set(...col);
    this.stage.pass(this.mGlow, target);
  }

  put(target, str, x, y, { align = 'center', opacity = 1, scale = 1, ...o } = {}) {
    if (opacity <= 0 || !str) return 0;
    const t = tx(str, o), left = align === 'center' ? x - t.w * scale / 2 : align === 'right' ? x - t.w * scale : x;
    this.stage.quad(target, t.tex, rect(left, y - t.h * scale / 2, t.w * scale, t.h * scale), { opacity });
    return t.w * scale;
  }

  ring(target, t, at, cx, cy, w, h, op = 1, color = '#0091ff') {
    const step = Math.floor(clamp((t - at) / .36) * 24);
    if (step <= 0 || op <= 0) return;
    const r = ringTex(Math.round(w), Math.round(h), step, color);
    this.stage.quad(target, r.tex, rect(cx - r.w / 2, cy - r.h / 2, r.w, r.h), { opacity: op });
  }

  // Lines typed from a centred block (or from x). A line with `word` gets the blue ring round its first word.
  // Returns where the cursor is; draws it unless cursor === false.
  lines(target, t, list, style, { opacity = 1, cursor = true, paneH = 22 } = {}) {
    let cur = null;
    for (const l of list) {
      if (t < l.at) continue;
      const st = { ...style, ...(l.style || {}) };
      const n = Math.min(l.s.length, Math.floor((t - l.at) * (l.cps ?? 15)) + 1), full = tx(l.s, st).w;
      const left = l.x ?? (540 - full / 2);
      const w = this.put(target, l.s.slice(0, n), left, l.y, { ...st, align: 'left', opacity });
      cur = { x: left + w + 14, y: l.y, typing: n < l.s.length };
      if (l.word) { const ww = tx(l.word, st).w; this.ring(target, t, l.at + .25, left + ww / 2, l.y, ww + 34, st.size * 1.5, opacity); }
    }
    if (cursor && cur && opacity > 0 && (cur.typing || (t * 1.9) % 1 < .62)) drawPane(this.stage, target, cur.x, cur.y, paneH, { gain: 1.2, opacity });
    return cur;
  }

  // Chained lines: each starts when the one before has finished typing.
  static chain(start, strs, { cps = 15, gap = .3, y0 = 1000, dy = 90, word = null, style = null } = {}) {
    let at = start;
    return strs.map((s, i) => { const l = { s, at, cps, y: y0 + i * dy }; if (i === 0 && word) l.word = word; if (style) l.style = style; at += s.length / cps + gap; return l; });
  }

  static typeEvents(list, ev) {
    for (const l of list) for (let k = 0; k < l.s.length; k++) if (l.s[k] !== ' ') ev.push({ t: l.at + k / (l.cps ?? 15), type: 'type' });
    for (const l of list) if (l.word) ev.push({ t: l.at + .25, type: 'pen' });
  }

  // Odometer year at y. v below zero is BC. prefix overrides the label.
  year(target, v, color, { opacity = 1, y = 400, size = 128, prefix = null } = {}) {
    if (opacity <= 0) return;
    const a = Math.abs(v), n = a < 10 ? 1 : a < 100 ? 2 : a < 1000 ? 3 : a < 10000 ? 4 : 5, adv = size * .6;
    const label = prefix ?? (v < 0 ? '公元前' : null);
    const x0 = 540 - (n - 1) / 2 * adv + (label ? 60 : 0);
    if (label) this.put(target, label, x0 - adv / 2 - 14, y + size * .14, { align: 'right', size: size * .3, weight: 700, color, opacity });
    for (let i = 0; i < n; i++) {
      const p = n - 1 - i, place = Math.pow(10, p), pv = a / place, d = Math.floor(pv) % 10, frac = pv - Math.floor(pv);
      const f = p === 0 ? frac : clamp((frac - (1 - 1 / place)) * place), x = x0 + i * adv, roll = f > .002 && f < .998;
      this.put(target, String(d), x, y + (roll ? f * size * .45 : 0), { size, weight: 800, color, opacity: opacity * (roll ? 1 - f : 1) });
      if (roll) this.put(target, String((d + 1) % 10), x, y - (1 - f) * size * .45, { size, weight: 800, color, opacity: opacity * f });
    }
  }

  // Page B pushes page A up. drawA/drawB draw a full page into the target they are given.
  slide(target, k, drawA, drawB) {
    const s = this.stage;
    s.clear(this.holdA); drawA(this.holdA);
    s.clear(this.holdB); drawB(this.holdB);
    s.quad(target, this.holdA.texture, rect(0, -k * H * .42, W, H), { hdr: true, uvRect: FLIP });
    s.quad(target, this.holdB.texture, rect(0, (1 - k) * H, W, H), { hdr: true, uvRect: FLIP });
  }

  // The blue pane flies from `from` into the logo; the logo comes up with light through it; the slogan is typed under it.
  endCard(t, target, { slogan = true, text = SLOGAN } = {}) {
    const s = this.stage, E = this.endT;
    if (t >= E.fly && t < E.land + .4) {
      const k = easeInOut(ramp(t, E.fly, E.land)), [fx, fy, fh] = E.from;
      drawPane(s, target, mix(fx, LOGO.pane[0], k), mix(fy, LOGO.pane[1], k), mix(fh, LOGO.pane[2], k), { gain: 1.25, opacity: 1 - smooth(t, E.land, E.land + .3) });
    }
    if (t < E.logo) return;
    const a = smooth(t, E.logo, E.logo + .5), q = rect(540 - LOGO.w / 2, LOGO.cy - LOGO.h / 2, LOGO.w, LOGO.h);
    s.clear(this.mask, [0, 0, 0]);
    s.quad(this.mask, this.logo, q, { gain: 2.2, opacity: a });
    const R = this.mRays.uniforms, B = this.mBlur.uniforms;
    R.mask.value = this.mask.texture; R.time.value = t;
    s.pass(this.mRays, this.raysRT);
    B.src.value = this.raysRT.texture; B.dir.value.set(1.6 / (W / 4), 0); s.pass(this.mBlur, this.raysA);
    B.src.value = this.raysA.texture; B.dir.value.set(0, 1.6 / (H / 4)); s.pass(this.mBlur, this.raysB);
    this.mAdd.uniforms.src.value = this.raysB.texture; this.mAdd.uniforms.gain.value = .2 * a;
    s.pass(this.mAdd, target);
    s.quad(target, this.logo, q, { opacity: a });
    if (slogan) this.lines(target, t, [{ s: text, at: E.type, cps: 14, y: LOGO.lineY }], { size: 42, weight: 600, color: '#e7ebef', spacing: 2 }, { paneH: 17, cursor: t < E.type + text.length / 14 + .1 });
  }

  endEvents(ev, { slogan = true, text = SLOGAN } = {}) {
    const E = this.endT;
    ev.push({ t: E.fly + .05, type: 'whoosh' }, { t: E.land - .04, type: 'boom' });
    if (slogan) TypeFilm.typeEvents([{ s: text, at: E.type, cps: 14 }], ev);
  }

  blurSamples() { return 1; }

  async frame(t) {
    const s = this.stage, N = this.blurSamples(t);
    if (N === 1) { s.clear(this.final, [0, 0, 0]); this.world(t, this.final); }
    else {
      s.clear(this.accum, [0, 0, 0]);
      for (let i = 0; i < N; i++) {
        s.clear(this.comp, [0, 0, 0]);
        this.world(t + ((i + .5) / N - .5) * (.6 / this.fps), this.comp);
        this.mAdd.uniforms.src.value = this.comp.texture; this.mAdd.uniforms.gain.value = 1 / N;
        s.pass(this.mAdd, this.accum);
      }
      this.mCopy.uniforms.src.value = this.accum.texture; s.pass(this.mCopy, this.final);
    }
    const F = this.mFinal.uniforms;
    F.frameNo.value = Math.round(t * this.fps); F.fade.value = 1 - smooth(t, this.endT.out, this.endT.end);
    s.pass(this.mFinal, null);
    return s.readPixels();
  }

  async postEvents() { await fetch('/events', { method: 'POST', body: JSON.stringify(this.events().sort((a, b) => a.t - b.t)) }); }
}

export { THREE, W, H, BRAND_BLUE, clamp, ramp, smooth, easeOut, easeInOut, mix, card, canvasTexture, makeCanvas, rgb, drawPane };
