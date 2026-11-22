// Timeline renderer: an episode is a talk video plus a declarative timeline (episodes/<ep>/timeline.js).
// All times in the timeline are SOURCE seconds of the talk; episode.json "segs" lists the kept ranges.
// Shots fill the frame (talk / dark / pane / end); layers draw on top. On talk shots, hand-drawn layers go behind the person.
// See docs/timeline.md for every field.
import { THREE, W, H, BRAND_BLUE, Stage, PersonFrames, fullMaterial, PERSON_FRAG, COPY_FRAG, FINAL_FRAG, clamp, ramp, smooth, easeOut, easeIn, easeOutBack, mix, card, canvasTexture, makeCanvas, textTex, rgb } from './core.js';
import { softShadowTex, landing } from './kit.js';
import {
  NOTO, HAND, BRUSH, BLUE, INK, RED, DARK_FRAG, PANE_FRAG, SeqTex, Cuts, uvr, inout, ink, wobble, lineN, ellipseScribble, arrow, handWord, strike,
  Layer, glowTex, rectGlowTex, boxOutlineTex, numberRowTex, terminalTex, popLineTex, chipTex, drawLineWorld, drawSubtitle, drawCard, drawPane, pillTex,
  makeRoundMat, drawRound, drawPipRound, drawEvidence,
} from './fxlib.js';

const COLORS = { ink: INK, blue: BLUE, red: RED, white: '#ffffff', grey: '#7a8592', sky: '#9fc4ff' };
const col = (c, dflt = INK) => COLORS[c] || c || dflt;
const BEHIND = new Set(['bigType', 'hand', 'strike', 'circle', 'arrow', 'people', 'bars']);
const during = (L, t) => t >= L.at[0] && t < L.at[1];
const fadeOf = (L, t, d = .3) => smooth(t, L.at[0], L.at[0] + (L.fadeIn ?? .25)) * (1 - smooth(t, L.at[1] - (L.fadeOut ?? d), L.at[1]));
const drawP = (L, t) => (L.draw == null ? 1 : smooth(t, L.draw, L.draw + (L.dur ?? .5)));

export class Film {
  constructor(job) { this.job = job; this.base = `/episodes/${job.episode}`; }

  async init() {
    const s = this.stage = new Stage(), u = (v) => ({ value: v }), B = this.base;
    this.ep = await (await fetch(`${B}/episode.json`)).json();
    this.tl = (await import(`${B}/timeline.js`)).default;
    this.cuts = new Cuts(this.ep.segs);
    this.subs = await (await fetch(`${B}/subtitles.json`)).json().catch(() => []);
    this.levels = await (await fetch(`${B}/build/levels.json`)).json().catch(() => []);
    this.head = await (await fetch(`${B}/build/head.json`)).json().catch(() => ({}));
    const strings = JSON.stringify(this.tl);
    await Promise.all([document.fonts.load(`60px ${HAND}`, strings), document.fonts.load(`60px ${BRUSH}`, strings), document.fonts.load('400 30px Menlo', 'API'),
      ...[900, 800, 700, 500].map((w) => document.fonts.load(`${w} 40px ${NOTO}`, strings))]);

    this.comp = s.rt(); this.post = s.rt(); this.aux = s.rt();
    this.mDark = fullMaterial(DARK_FRAG, { top: u(new THREE.Vector3(...rgb('#0d131c'))), bot: u(new THREE.Vector3(...rgb('#040506'))), haze: u(new THREE.Vector3(.010, .028, .075)) });
    this.mPane = fullMaterial(PANE_FRAG, { world: u(null), pane: u(new THREE.Vector3(560, 640, 470)), zoom: u(.45), open: u(1), look: u(new THREE.Vector2(540, 760)) }, 'over');
    this.mCopy = fullMaterial(COPY_FRAG, { src: u(null), gain: u(1) });
    this.mFinal = fullMaterial(FINAL_FRAG, { src: u(this.post.texture), grain: u(.012), frameNo: u(0), vignette: u(.05), aberr: u(0), fade: u(1), lift: u(0) });
    this.mRound = makeRoundMat(fullMaterial, THREE);
    this.talk = new SeqTex(`${B}/build/talk`);
    this.person = new PersonFrames(`${B}/build/person`);
    this.mPerson = fullMaterial(PERSON_FRAG, { fg: u(this.person.fg), al: u(this.person.alpha), xf: u(new THREE.Vector3(1, 540, 1000)), shift: u(new THREE.Vector2()),
      ambient: u(new THREE.Vector3(1, 1, 1)), glowCol: u(new THREE.Vector3()), glowPos: u(new THREE.Vector2(540, 600)), glowR: u(700),
      rimCol: u(new THREE.Vector3()), rimDir: u(new THREE.Vector2(0, -1)), rimWidth: u(9), eyes: u(new THREE.Vector4()), lensR: u(0), lensCol: u(new THREE.Vector3()), lensFlick: u(1) }, 'over');

    this.shadow = softShadowTex(); this.glow = glowTex(); this.rglow = rectGlowTex();
    this.behind = new Layer(); this.front = new Layer();
    this.rec = {}; this.img = {};
    for (const L of this.tl.layers) {
      if (L.rec && !this.rec[L.rec]) {
        const meta = await (await fetch(`${B}/build/rec/${L.rec}.json`)).json().catch(() => null);
        this.rec[L.rec] = new SeqTex(`${B}/build/rec/${L.rec}`, { last: meta ? meta.frames - 1 : Infinity });
      }
      for (const src of [L.image, L.logo].filter(Boolean)) if (!this.img[src]) this.img[src] = await this.loadImg(`${B}/${src}`);
      if (L.type === 'term') { L._tex = {}; L._pop = {}; L._base = terminalTex(L.lines, -1, L.title || ''); (L.steps || []).forEach((st, i) => { L._tex[i] = terminalTex(L.lines, st.hi, L.title || ''); L._pop[i] = popLineTex(st.pop || L.lines[st.hi[0]], 34); }); }
      if (L.type === 'numbers') L._rows = L.rows.map((r) => numberRowTex(r.big, r.unit || '', r.label || '', r.note || ''));
    }
    for (const S of this.tl.shots) for (const src of [S.logo, S.background].filter(Boolean)) if (!this.img[src]) this.img[src] = await this.loadImg(`${B}/${src}`);
    this.hiBox = boxOutlineTex(480, 40, BLUE, 4);
  }

  async loadImg(url) {
    const img = new Image(); img.src = url; await img.decode();
    const [c, x] = makeCanvas(img.width, img.height); x.drawImage(img, 0, 0);
    return { tex: canvasTexture(c), w: img.width, h: img.height };
  }

  // ---------- helpers ----------
  full(T, tex, o = {}) { this.stage.quad(T, tex, [[0, 0], [W, 0], [0, H], [W, H]], o); }
  shotAt(t) { return this.tl.shots.find((S) => t >= S.from && t < S.to) || this.tl.shots[this.tl.shots.length - 1]; }
  recFrame(name, L, t) {   // clip frame for layer time; plays forward then back if the layer outlasts the clip
    const n = Math.round((t - L.at[0] + (L.recStart || 0)) * 30), last = this.rec[name].last;
    if (!isFinite(last) || last <= 0) return n;
    const p = n % (2 * last); return p <= last ? p : 2 * last - p;
  }
  level(t) { return Math.pow(this.levels[Math.min(this.levels.length - 1, Math.round(t * 30))] || 0, 1.6); }
  text(T, str, x, y, o = {}) {
    const t = textTex(str, { size: o.size || 40, weight: o.weight || 700, color: col(o.color, '#fff'), spacing: o.spacing || 0, pad: 4 });
    this.stage.quad(T, t.tex, card(o.align === 'left' ? x + t.w / 2 : x, y, t.w, t.h, { rz: o.rz || 0, scale: o.scale || 1 }), { opacity: o.opacity ?? 1 });
  }
  pillAt(T, str, x, y, t, at, o = {}) {
    const l = landing(t, at, .3, 1.3); if (l.u <= 0) return;
    const p = pillTex(str, { size: o.size || 40, weight: 800, h: o.h || Math.round((o.size || 40) * 2.2), bg: o.blue ? 'rgba(0,145,255,.96)' : 'rgba(14,20,30,.88)', color: '#fff', padX: o.padX || 34 });
    drawCard(this.stage, T, this.shadow, p.tex, x, y, p.w, p.h, { opacity: l.op * (o.a ?? 1), scale: l.scale, k: l.k, shadow: .35, rz: o.rz || 0 });
  }

  // ---------- layers ----------
  canvasLayer(x, L, t, a) {   // hand-drawn things, drawn on a 2D canvas
    if (L.type === 'hand') handWord(x, L.text, L.x ?? 540, L.y, L.size || 80, L.rot || 0, L.font === 'brush' ? BRUSH : HAND, col(L.color), drawP(L, t) * a, L.align || 'center');
    else if (L.type === 'strike') strike(x, L.x0, L.x1, L.y, drawP(L, t) * a, L.seed || 3, col(L.color, RED));
    else if (L.type === 'circle') ink(x, wobble(ellipseScribble(L.x, L.y, L.rx, L.ry, 1.15, L.seed || 3, L.rot || 0), 4, 4), L.width || 6, col(L.color, RED), 1, drawP(L, t) * a);
    else if (L.type === 'arrow') arrow(x, L.from, L.to, L.bend || 0, L.width || 5, col(L.color), L.seed || 2, drawP(L, t) * a);
    else if (L.type === 'people') {   // a row of stick figures: "N people"
      const n = L.n || 5, gap = L.gap || 190, x0 = (L.x ?? 540) - gap * (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        const p = smooth(t, (L.draw ?? L.at[0]) + i * .18, (L.draw ?? L.at[0]) + i * .18 + .3) * a, px = x0 + i * gap;
        ink(x, wobble(ellipseScribble(px, L.y, 30, 30, 1.05, i * 3), 2, i), 6, col(L.color), i, p);
        ink(x, wobble([[px - 50, L.y + 130], [px - 46, L.y + 70], [px, L.y + 46], [px + 46, L.y + 70], [px + 50, L.y + 130]], 3, i + 9), 6, col(L.color), i + 2, p);
      }
    } else if (L.type === 'bars') {   // labelled fill bars, e.g. "quota used"
      L.bars.forEach((b, i) => {
        const y = L.y + i * (L.gap || 210), p = smooth(t, b.at ?? L.at[0], (b.at ?? L.at[0]) + .4) * a;
        handWord(x, b.label, 110, y, 70, 0, HAND, INK, p, 'left');
        ink(x, wobble([[330, y - 30], [940, y - 30], [940, y + 30], [330, y + 30], [330, y - 30]], 3, i * 7), 5, INK, i, p);
        const f = b.fill * (b.grow ? smooth(t, b.grow[0], b.grow[1]) : 1);
        if (f > 0 && p > 0) { x.save(); x.globalAlpha = p * .85; x.fillStyle = col(b.color, BLUE); x.fillRect(338, y - 22, 594 * f, 44); x.restore(); }
        if (b.note) handWord(x, b.note, 940, y + 78, 54, 0, HAND, col(b.color, BLUE), smooth(t, b.noteAt ?? b.at ?? L.at[0], (b.noteAt ?? b.at ?? L.at[0]) + .5) * a, 'right');
      });
    }
  }

  async gpuLayer(T, L, t, a) {   // everything drawn with the GPU stage
    const s = this.stage;
    if (L.type === 'bigType') {
      (L.lines || []).forEach((ln, i) => {
        const l = landing(t, L.at[0] + i * .22, .38, 1.22), op = l.op * a, size = ln.size || L.size || 210, y = ln.y ?? (L.y ?? 470) + i * size * 1.15;
        if (l.u <= 0 || op <= 0) return;
        const parts = ln.parts || ln, tx = parts.map(([str, c]) => textTex(str, { size, weight: 900, color: col(c), spacing: 6, pad: 4 }));
        let x = 540 - tx.reduce((w, q) => w + q.w, 0) / 2;
        for (const q of tx) { s.quad(T, q.tex, card(540 + (x + q.w / 2 - 540) * l.scale, y, q.w, q.h, { scale: l.scale }), { opacity: op }); x += q.w; }
      });
      if (L.en) {
        const n = (L.lines || []).length, last = L.lines[n - 1], size = last.size || L.size || 210, y = last.y ?? (L.y ?? 470) + (n - 1) * size * 1.15;
        const l = landing(t, L.at[0] + n * .22, .38, 1.1);
        if (l.u > 0) this.text(T, L.en, 540, y + size * .62, { size: Math.round(size * .26), weight: 800, color: L.enColor || '#5b6675', spacing: 2, opacity: l.op * a });
      }
    } else if (L.type === 'pill') { this.pillAt(T, L.text, L.x ?? 540, L.y, t, L.pop ?? L.at[0], { blue: L.blue, size: L.size, a, rz: L.rz }); if (L.en) this.text(T, L.en, L.x ?? 540, L.y + (L.size || 40) * 1.55, { size: Math.round((L.size || 40) * .62), weight: 700, color: L.enColor || (this.shotAt(t).kind === 'dark' ? '#9fb3c8' : '#3a4552'), opacity: a * smooth(t, (L.pop ?? L.at[0]) + .2, (L.pop ?? L.at[0]) + .5) }); }
    else if (L.type === 'chip') { const c = chipTex(L.en ? `${L.text}  ${L.en}` : L.text); s.quad(T, c.tex, card((L.x ?? 50) + c.w / 2, L.y ?? 150, c.w, c.h), { opacity: a }); }
    else if (L.type === 'title') { this.text(T, L.text, 540, L.y ?? 210, { size: L.size || 54, weight: 900, opacity: a }); const sub = [L.en, L.sub].filter(Boolean).join(' · '); if (sub) this.text(T, sub, 540, (L.y ?? 210) + 66, { size: 28, weight: 500, color: '#8fa2b8', opacity: a }); }
    else if (L.type === 'lines') this.lines(T, L, t, a);
    else if (L.type === 'screen') {   // a recording as the main picture, lifted with glow and shadow
      const r = this.rec[L.rec]; await r.load(this.recFrame(L.rec, L, t));
      const [x, y, w, h] = L.crop, cw = L.width || 1000, ch = cw * h / w, cy = L.y ?? 640;
      s.quad(T, this.rglow, card(540, cy, cw * 1.25, ch * 1.35), { tint: [.03, .2, .75], add: true, opacity: .6 * a });
      drawRound(s, T, this.mRound, r.tex, uvr(r.w, r.h, x, y, w, h), [540, cy, cw, ch], { radius: 22, opacity: a, gain: 1.2, glow: .45, edge: .45 });
    } else if (L.type === 'evidence') {
      let tex, iw, ih;
      if (L.rec) { const r = this.rec[L.rec]; await r.load(this.recFrame(L.rec, L, t)); tex = r.tex; iw = r.w; ih = r.h; }
      else { const im = this.img[L.image]; tex = im.tex; iw = im.w; ih = im.h; }
      const [x, y, w, h] = L.crop || [0, 0, iw, ih], [cx, cy, bw] = L.box || [850, 168, 380], bh = bw * h / w;
      drawEvidence(s, T, this.mRound, tex, uvr(iw, ih, x, y, w, h), cx, cy, bw, bh, { a, label: L.label || '真实录屏' });
      for (const hl of L.highlights || []) if (t >= hl.at[0] && t < hl.at[1]) s.quad(T, this.hiBox, card(cx, cy - bh / 2 + (hl.y - y) / h * bh, bw - 16, 40), { opacity: a * smooth(t, hl.at[0], hl.at[0] + .3) });
    } else if (L.type === 'pip') {
      const n = Math.round(t * 30), [cx, cy, w, h] = L.box || [850, 1190, 290, 350], hd = this.head[n] || [540, 680], sw = 660, sh = sw * h / w;
      await this.talk.load(n);
      drawPipRound(s, T, this.mRound, this.talk.tex, uvr(1080, 1920, clamp(hd[0] - sw / 2, 0, 1080 - sw), clamp(hd[1] - 60, 0, 1920 - sh), sw, sh), cx, cy, w, h, { a, level: this.level(t), t, name: L.name || this.ep.speaker || '' });
    } else if (L.type === 'image') {
      const im = this.img[L.image], [cx, cy, w] = L.box, h = w * im.h / im.w;
      drawRound(s, T, this.mRound, im.tex, [0, 0, 1, 1], [cx, cy, w, h], { radius: L.radius ?? 22, opacity: a, glow: .4, edge: .4 });
    } else if (L.type === 'term') this.term(T, L, t, a);
    else if (L.type === 'numbers') {
      L.rows.forEach((r, i) => { const l = landing(t, r.at ?? L.at[0] + i * .4, .35, 1.12), q = L._rows[i]; if (l.u > 0) s.quad(T, q.tex, card(90 + q.w / 2, (L.y ?? 400) + i * 270, q.w, q.h, { scale: l.scale }), { opacity: l.op * a }); });
      if (L.source) this.text(T, L.source, 90, (L.y ?? 400) - 200, { size: 26, weight: 500, color: '#7f93ab', align: 'left', opacity: a });
    }
  }

  lines(T, L, t, a) {
    const s = this.stage, G = L.gate?.pos || [540, 700], srcs = L.sources || [], n = L.nodes?.n || 8, cols = L.nodes?.cols || 4;
    const st = {
      gatePos: G,
      src: srcs.map((q, i) => ({ name: q.name, sub: q.sub || '', x: q.x ?? 150 + i * (780 / Math.max(1, srcs.length - 1)), a: L.static ? 2 : clamp((t - q.at + .2) / 1.0, 0, 2) })),
      laptops: Array.from({ length: n }, (_, i) => {
        const at = L.nodes?.at ?? L.at[0], keyAt = L.nodes?.keyAt;
        return { x: 165 + (i % cols) * (750 / Math.max(1, cols - 1)), y: (L.nodes?.y ?? 1040) + Math.floor(i / cols) * 190, a: L.static ? 2 : clamp((t - at - i * .32) / .7, 0, 2), key: keyAt == null ? 0 : clamp((t - keyAt - i * .2) / .5, 0, 1) };
      }),
      label: L.gate ? smooth(t, L.gate.at ?? L.at[0], (L.gate.at ?? L.at[0]) + 1) : 0, gateName: L.gate?.name || '', gateSub: L.gate?.sub || '',
    };
    st.flow = st.label > .5 ? t : null;
    const x = this.front.begin();
    x.globalAlpha = a; drawLineWorld(x, st); x.globalAlpha = 1;
    if (L.caption) { const [c0, c1] = L.captionAt || L.at; handWord(x, L.caption, 540, L.captionY ?? 200, 64, -.03, HAND, '#9fc4ff', a * smooth(t, c0, c0 + 1.2) * (1 - smooth(t, c1 - .4, c1))); }
    if (st.label > 0) { s.quad(T, this.glow, card(G[0], G[1], 560, 560), { tint: [.1, .4, 1], add: true, opacity: .6 * st.label * a }); drawPane(s, T, G[0], G[1], 70 * mix(.4, 1, easeOutBack(st.label, 1.4)), { gain: 1.6, opacity: st.label * a }); }
    this.full(T, this.front.end());
    if (L.marker !== false) this.text(T, L.marker || '原理示意', 60, 1440, { size: 24, weight: 500, color: '#7f93ab', align: 'left', opacity: a * .9 });
  }

  term(T, L, t, a) {
    const s = this.stage, steps = L.steps || [];
    let k = -1; steps.forEach((st, i) => { if (t >= st.at) k = i; });
    const tm = k < 0 ? L._base : L._tex[k], cw = 860, ch = cw * tm.h / tm.w, cx = 540, cy = L.y ?? 475;
    s.quad(T, this.rglow, card(cx, cy, cw * 1.2, ch * 1.25), { tint: [.03, .18, .6], add: true, opacity: .5 * a });
    const l0 = landing(t, L.at[0], .4, 1.1);
    drawCard(s, T, this.shadow, tm.tex, cx, cy, cw, ch, { shadow: .7, opacity: a * l0.op, scale: l0.scale, k: l0.k });
    steps.forEach((st, i) => {
      const on = i <= k, x = 540 - (steps.length - 1) * 110 + i * 220, y = cy - ch / 2 - 70;
      s.quad(T, null, card(x, y, 64, 64, { rz: 45 }), { solid: true, tint: on ? BRAND_BLUE : [.12, .15, .2], gain: i === k ? 1.5 : 1, opacity: a });
      this.text(T, String(i + 1), x, y, { size: 32, weight: 900, opacity: a });
      if (i < steps.length - 1) s.quad(T, null, card(x + 110, y, 120, 3), { solid: true, tint: i < k ? BRAND_BLUE : [.2, .24, .3], opacity: a });
    });
    if (k >= 0) {
      const st = steps[k], p = L._pop[k], l = landing(t, st.at, .35, 1.25), rowY = cy - ch / 2 + (120 + st.hi[0] * tm.lh) * ch / tm.h;
      const pw = Math.min(1000, p.w), ph = pw * p.h / p.w, py = cy + ch / 2 + 110;
      s.quad(T, null, card(cx, (rowY + 30 + py - ph / 2) / 2, 4, Math.max(0, py - ph / 2 - rowY - 30)), { solid: true, tint: BRAND_BLUE, gain: 1.4, opacity: a * l.op });
      drawCard(s, T, this.shadow, p.tex, cx, py, pw, ph, { shadow: .7, rz: -1.2, opacity: a * l.op, scale: l.scale, k: l.k });
      if (st.name) { const nm = pillTex(`${k + 1}  ${st.name}`, { size: 48, weight: 900, h: 104, bg: 'rgba(0,145,255,.96)', color: '#fff', padX: 44 }), l2 = landing(t, st.at + .15, .3, 1.3);
        drawCard(s, T, this.shadow, nm.tex, 540, py + 130, nm.w, nm.h, { shadow: .4, opacity: a * l2.op, scale: l2.scale, k: l2.k }); }
    } else if (L.intro) this.text(T, L.intro, 540, cy + ch / 2 + 120, { size: 64, weight: 900, opacity: a * smooth(t, L.at[0] + .3, L.at[0] + .7) });
  }

  async layers(T, t, filter) {
    const act = this.tl.layers.filter((L) => during(L, t) && filter(L));
    const canv = act.filter((L) => BEHIND.has(L.type) && !['bigType'].includes(L.type));
    if (canv.length) { const x = this.behind.begin(); for (const L of canv) this.canvasLayer(x, L, t, fadeOf(L, t)); this.full(T, this.behind.end()); }
    for (const L of act) if (!canv.includes(L)) await this.gpuLayer(T, L, t, fadeOf(L, t));
  }

  // ---------- shots ----------
  async talkShot(T, t, S, zoom) {
    const s = this.stage, n = Math.round(t * 30), z = zoom ?? S.zoom ?? 1, cy = 1000;
    await this.talk.load(n); await this.person.load(n);
    const c = (x, y) => [(x - 540) * z + 540, (y - cy) * z + cy];
    s.quad(T, this.talk.tex, [c(0, 0), c(W, 0), c(0, H), c(W, H)]);
    await this.layers(T, t, (L) => BEHIND.has(L.type) && !L.front);
    this.mPerson.uniforms.xf.value.set(z, 540, cy); s.pass(this.mPerson, T);
    await this.layers(T, t, (L) => !BEHIND.has(L.type) || L.front);
  }

  async frame(ft) {
    const { t } = this.cuts.toSrc(ft), s = this.stage, S = this.shotAt(t), T = this.comp;
    s.clear(T, [0, 0, 0]);
    if (S.kind === 'talk') await this.talkShot(T, t, S);
    else if (S.kind === 'dark') { s.pass(this.mDark, T); await this.layers(T, t, () => true); }
    else if (S.kind === 'pane') {
      // the blue pane opens behind the speaker onto the next shot's world, then the camera pushes through it
      const next = this.tl.shots[this.tl.shots.indexOf(S) + 1], wt = next ? next.from + .6 : t;
      s.clear(this.aux, [0, 0, 0]); s.pass(this.mDark, this.aux); await this.layers(this.aux, wt, (L) => L.type === 'lines' || L.type === 'title' || L.type === 'hand');
      const open = easeOut(ramp(t, S.from + .1, S.from + .9)), push = easeIn(ramp(t, S.to - .8, S.to)), z = S.zoom ?? 1;
      const n = Math.round(t * 30); await this.talk.load(n); await this.person.load(n);
      const c = (x, y) => [(x - 540) * z + 540, (y - 1000) * z + 1000];
      s.quad(T, this.talk.tex, [c(0, 0), c(W, 0), c(0, H), c(W, H)]);
      s.quad(T, this.glow, card(560, 640, 1500, 1900), { tint: [.15, .45, 1], add: true, opacity: .32 * open });
      const un = this.mPane.uniforms; un.world.value = this.aux.texture; un.pane.value.set(560, mix(640, 900, push), mix(20, 470, open) * mix(1, 6.5, push)); un.zoom.value = mix(.45, 1, push); un.open.value = open; un.look.value.set(540, mix(760, 960, push));
      s.pass(this.mPane, T);
      const pu = this.mPerson.uniforms; pu.xf.value.set(z, 540, 1000); pu.rimCol.value.set(.35 * open, .8 * open, 2.4 * open); s.pass(this.mPerson, T); pu.rimCol.value.set(0, 0, 0);
      const thru = smooth(push, .35, .85); if (thru > 0) this.full(T, this.aux.texture, { opacity: thru, hdr: true });
    } else if (S.kind === 'end') {
      const a = smooth(t, S.from, S.from + .7);
      if (S.background) this.full(T, this.img[S.background]?.tex, { gain: .9 * a }); else s.pass(this.mDark, T);
      const str = S.slogan || '', nch = Math.floor(clamp((t - (S.typeAt ?? S.from + .5)) * 14, 0, str.length));
      if (nch > 0) { const full = textTex(str, { size: 50, weight: 700, spacing: 2, pad: 4 }), part = textTex(str.slice(0, nch), { size: 50, weight: 700, spacing: 2, pad: 4 });
        s.quad(T, part.tex, card(540 - full.w / 2 + part.w / 2, 1440, part.w, part.h)); if (nch < str.length) drawPane(s, T, 540 - full.w / 2 + part.w + 10, 1440, 20); }
      if (S.logo) { const im = this.img[S.logo], w = S.logoWidth || 300; s.quad(T, im.tex, card(540, 1600, w, w * im.h / im.w), { opacity: smooth(t, S.logoAt ?? S.to - 1.5, (S.logoAt ?? S.to - 1.5) + .6) }); }
    }
    this.mCopy.uniforms.src.value = T.texture; s.pass(this.mCopy, this.post);
    const line = this.subs.find((l) => ft >= l.s && ft < l.e);
    if (line && !(S.kind === 'end' && S.noSubs)) drawSubtitle(s, this.post, line.text, smooth(ft, line.s, line.s + .06) * (1 - smooth(ft, line.e - .05, line.e)), this.ep.bilingual === false ? '' : line.en || '');
    this.mFinal.uniforms.frameNo.value = Math.round(ft * 30); s.pass(this.mFinal, null);
    return s.readPixels();
  }
}
