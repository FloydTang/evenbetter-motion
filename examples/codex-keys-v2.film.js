// 让公司每个人都能用上 Codex：一个公司订阅，给每个伙伴发一把钥匙。First film built on the 半斤九两动效系统 (style frames v1).
// Source: 11月19日.mp4 (talk, white wall) + the 11-19 screen recording (AI 数据中台, Feishu tutorial), privacy-blurred in build/rec.
// All scene times below are SOURCE seconds of the talk; Cuts maps film time to them. Subtitles: subtitles.json (film time).
import {
  THREE, W, H, BRAND_BLUE, Stage, PersonFrames, fullMaterial, PERSON_FRAG, BLUR_FRAG, COPY_FRAG, FINAL_FRAG,
  clamp, ramp, smooth, easeOut, easeIn, easeInOut, easeOutBack, mix, hash, noise1, card, canvasTexture, makeCanvas, textTex, rgb,
} from '/engine/core.js';
import { softShadowTex, landing } from '/engine/kit.js';
import {
  NOTO, HAND, BRUSH, BLUE, INK, RED, DARK_FRAG, PANE_FRAG, SeqTex, Cuts, cardPoint, uvr, inout, ink, wobble, lineN, ellipseScribble, arrow,
  handWord, strike, Layer, glowTex, rectGlowTex, boxOutlineTex, lensTex, numberRowTex, heatTex, terminalTex, popLineTex, gridPaperTex, tapeTex,
  chipTex, drawLineWorld, drawSubtitle, drawPip, drawScreen, drawCard, drawPane, pillTex, makeRoundMat, drawRound, drawPipRound, drawEvidence,
} from '/engine/fxlib.js';

const BASE = '/episodes/20261119-codex-keys';      // footage, matte, recordings and assets are shared with v1
const HERE = '/episodes/20261119-codex-keys-v2';
export const SEGS = [[4.45, 8.24], [13.15, 16.52], [18.3, 29.03], [35.6, 43.35], [54.85, 60.35], [63.6, 70.72], [74.04, 79.92], [98.9, 102.0], [105.1, 107.8], [118.9, 122.1], [129.4, 134.12], [143.08, 145.52], [147.75, 152.45], [155.76, 160.75], [168.48, 172.45], [172.74, 177.42], [188.35, 193.95], [196.9, 202.36], [211.7, 216.43], [232.0, 240.3], [240.55, 246.9], [247.15, 249.08], [255.03, 257.47], [257.47, 260.2], [273.73, 279.35], [279.6, 285.62], [289.62, 291.88], [292.05, 297.6], [301.76, 306.6], [309.48, 317.2], [342.05, 351.47], [352.25, 358.6], [359.7, 362.3]];
const CUTS = new Cuts(SEGS);
export const DURATION = CUTS.duration;
const REC = { w: 1600, h: 829 };           // dashboard segment frames (content in x < 1415)
const DOC = { w: 1200, h: 1286 };

// Which picture runs when (source seconds).
const SCENES = [
  ['talk', 4.45, 119.6],
  ['pane', 119.6, 122.3],        // 来，我这边打开后台 -> through the blue pane
  ['lines', 122.3, 142.9],       // the sources
  ['cost', 142.9, 147.75],       // 一个月也就一千左右
  ['lines', 147.75, 166.4],      // one gateway, a key each
  ['screen', 168.48, 172.7, 'ov'],
  ['data', 172.7, 184.0],
  ['talk', 184.0, 196.9],
  ['screen', 196.9, 209.9, 'model'],
  ['screen', 211.7, 216.9, 'person'],
  ['screen', 216.9, 221.7, 'date'],
  ['board', 221.7, 229.4],
  ['lines', 232.0, 240.5],
  ['doc', 240.5, 244.0, 'doctop'],
  ['talk', 244.0, 256.3],
  ['term', 256.3, 297.9],
  ['talk', 297.9, 317.2],
  ['doc', 317.2, 327.9, 'docds'],
  ['talk', 327.9, 353.9],
  ['end', 353.9, 362],
];
const sceneAt = (t) => SCENES.find((s) => t >= s[1] && t < s[2]) || SCENES[SCENES.length - 1];

// Punch-in per talk stretch so cuts in the talk do not jump.
function talkZoom(t, seg) {
  if (t < 60.5) return 1;
  if (t < 89) return 1.1;
  if (t < 102) return 1;
  if (t < 108) return 1.12;
  if (t < 198) return 1.06;
  if (t < 257) return 1;
  if (t < 318) return 1.1;
  if (t < 340) return 1;
  return 1.12;
}

// Line world: four sources, one gateway, eight partners.
const GATE = [540, 700];
const SRC = [
  { name: 'GPT', sub: '$100 ≈ ¥700/月', x: 150, at: 130.5 },
  { name: 'Grok', sub: '订阅 $10/月', x: 410, at: 136.2 },
  { name: '服务器', sub: '远程主机', x: 670, at: 141.5 },
  { name: 'DeepSeek', sub: 'API', x: 930, at: 146.3 },
];
const LAPS = []; for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) LAPS.push({ x: 165 + i * 250, y: 1040 + r * 190 });

const CODE = ['伙伴电脑上的 Codex、WorkBuddy', '   ↑ 用 CC Switch 指向公司网关（钥匙扣）', '公司网关的公网入口（https://你的域名）', '   ↑ nginx + 证书（大门）',
  'New API（前台收发室：发钥匙、记台账、管额度）', '   ↑', 'MultiVibe（转换器：把订阅变成 API）', '   ↑', '公司集中采购的订阅 / 各个官方 API 额度'];
const STEPS = [   // the four things, each lighting its line of the tutorial's own diagram
  { at: 257.5, hi: [6], no: '1', name: '转换器', pop: 'MultiVibe（转换器：把订阅变成 API）', note: '把买来的订阅，变成程序能用的 API' },
  { at: 275.6, hi: [4], no: '2', name: '前台收发室', pop: 'New API（前台收发室：发钥匙、记台账、管额度）', note: '流量分到每个人，用多少都有台账' },
  { at: 286.2, hi: [1], no: '3', name: '每人一把钥匙', pop: '↑ 用 CC Switch 指向公司网关（钥匙扣）', note: '每个人一个 API，就是一把钥匙' },
  { at: 292.1, hi: [0], no: '4', name: '登录就能用', pop: '伙伴电脑上的 Codex、WorkBuddy', note: '用钥匙登录自己的 Codex、WorkBuddy' },
];

export class Film {
  constructor(job) { this.job = job; this.fps = job.fps; }

  async init() {
    const s = this.stage = new Stage(), u = (v) => ({ value: v });
    this.comp = s.rt(); this.post = s.rt(); this.aux = s.rt(); this.aux2 = s.rt();
    await Promise.all([document.fonts.load(`60px ${HAND}`, '真香一个顶好几个傻了眼网络环境手机号验证海外接码封号五份钱额度用不完够了'),
      document.fonts.load(`60px ${BRUSH}`, '旱死涝?!真香'), document.fonts.load('400 30px Menlo', 'New API')]);
    this.mDark = fullMaterial(DARK_FRAG, { top: u(new THREE.Vector3(...rgb('#0d131c'))), bot: u(new THREE.Vector3(...rgb('#040506'))), haze: u(new THREE.Vector3(.010, .028, .075)) });
    this.mPane = fullMaterial(PANE_FRAG, { world: u(null), pane: u(new THREE.Vector3(560, 640, 470)), zoom: u(.62), open: u(1), look: u(new THREE.Vector2(540, 760)) }, 'over');
    this.mBlur = fullMaterial(BLUR_FRAG, { src: u(null), dir: u(new THREE.Vector2()) });
    this.mCopy = fullMaterial(COPY_FRAG, { src: u(null), gain: u(1) });
    this.mFinal = fullMaterial(FINAL_FRAG, { src: u(this.post.texture), grain: u(.012), frameNo: u(0), vignette: u(.05), aberr: u(0), fade: u(1), lift: u(0) });
    this.talk = new SeqTex(`${BASE}/build/talk`, { start: 132, last: 10835 });
    this.person = new PersonFrames(`${BASE}/build/person`);
    this.mPerson = fullMaterial(PERSON_FRAG, { fg: u(this.person.fg), al: u(this.person.alpha), xf: u(new THREE.Vector3(1, 540, 1000)), shift: u(new THREE.Vector2()),
      ambient: u(new THREE.Vector3(1, 1, 1)), glowCol: u(new THREE.Vector3()), glowPos: u(new THREE.Vector2(540, 600)), glowR: u(700),
      rimCol: u(new THREE.Vector3()), rimDir: u(new THREE.Vector2(0, -1)), rimWidth: u(9),
      eyes: u(new THREE.Vector4()), lensR: u(0), lensCol: u(new THREE.Vector3()), lensFlick: u(1) }, 'over');
    this.rec = {};
    for (const n of ['ov', 'model', 'person', 'date']) this.rec[n] = new SeqTex(`${BASE}/build/rec/${n}`);
    this.recLen = { ov: 365, model: 471, person: 351, date: 629 };
    this.img = {}; this.tex = {};
    for (const n of ['cost', 'doctop', 'docds', 'doccode']) { this.img[n] = await this.load(`${BASE}/assets/${n}.jpg`); this.tex[n] = this.texOf(this.img[n]); }
    for (const n of ['hall_vertical', 'logo_bj']) { this.img[n] = await this.load(`${BASE}/assets/${n}.png`); this.tex[n] = this.texOf(this.img[n]); }
    this.subs = await (await fetch(`${HERE}/subtitles.json`)).json();
    this.head = await (await fetch(`${BASE}/build/head.json`)).json();
    this.mRound = makeRoundMat(fullMaterial, THREE);
    this.rec.doc = null;
    this.levels = await (await fetch(`${BASE}/build/levels.json`)).json();
    this.head = await (await fetch(`${BASE}/build/head.json`)).json();
    this.heat = heatTex(await (await fetch(`${BASE}/build/heat.json`)).json());
    this.heatT = canvasTexture(this.heat.canvas); this.heatT.generateMipmaps = false; this.heatT.minFilter = THREE.LinearFilter;

    this.shadow = softShadowTex(); this.glow = glowTex(); this.rglow = rectGlowTex(); this.tape = tapeTex(); this.paper = gridPaperTex();
    this.fx = { shadow: this.shadow, rglow: this.rglow };
    this.behind = new Layer(); this.front = new Layer();
    this.lens = lensTex(this.img.cost, 1265, 548, 112, 400);
    this.rows = [numberRowTex('84', '天', '过去'), numberRowTex('83.48', '亿 token', '一共用掉'), numberRowTex('$575,485', '记账折算', '按官方价换算', '不是实际花费，换算方法也偏粗')];
    this.term = {}; for (const st of STEPS) this.term[st.no] = terminalTex(CODE, st.hi, '代码块 · 一个公司订阅，给每个伙伴发一把钥匙');
    this.term0 = terminalTex(CODE, -1, '代码块 · 一个公司订阅，给每个伙伴发一把钥匙');
    this.pops = STEPS.map((st) => popLineTex(st.pop, 34));
    this.hiRow = boxOutlineTex(1150, 60);
    this.hiTitle = boxOutlineTex(1100, 170);
    this.dsBox = boxOutlineTex(250, 76);
    this.rowBox = boxOutlineTex(484, 40, BLUE, 4);
  }

  async load(url) { const img = new Image(); img.src = url; await img.decode(); return img; }
  texOf(img) { const [c, x] = makeCanvas(img.width, img.height); x.drawImage(img, 0, 0); return canvasTexture(c); }

  // ---------- shared drawing ----------

  full(T, tex, o = {}) { this.stage.quad(T, tex, [[0, 0], [W, 0], [0, H], [W, H]], o); }
  dark(T) { this.stage.pass(this.mDark, T); }
  text(T, str, x, y, o = {}) {
    const t = textTex(str, { size: o.size || 40, weight: o.weight || 700, color: o.color || '#fff', spacing: o.spacing || 0, pad: 4 });
    const cx = o.align === 'left' ? x + t.w / 2 : x;
    this.stage.quad(T, t.tex, card(cx, y, t.w, t.h, { rz: o.rz || 0, scale: o.scale || 1 }), { opacity: o.opacity ?? 1 });
    return t.w;
  }
  pill(T, str, x, y, t, at, o = {}) {
    const l = landing(t, at, .3, 1.3); if (l.u <= 0) return;
    const p = pillTex(str, { size: o.size || 40, weight: 800, h: o.h || 88, bg: o.blue ? 'rgba(0,145,255,.96)' : 'rgba(14,20,30,.88)', color: '#fff', padX: o.padX || 34 });
    drawCard(this.stage, T, this.shadow, p.tex, x, y, p.w, p.h, { opacity: l.op * (o.a ?? 1), scale: l.scale, k: l.k, shadow: .35, rz: o.rz || 0 });
  }
  chip(T, str, x, y, a) {
    if (a <= 0) return; const c = chipTex(str);
    this.stage.quad(T, c.tex, card(x + c.w / 2, y, c.w, c.h), { opacity: a });
  }
  bigType(T, lines, t, at, out) {
    lines.forEach((ln, i) => {
      const l = landing(t, at + i * .22, .38, 1.22), a = l.op * (1 - smooth(t, out - .3, out));
      if (l.u <= 0 || a <= 0) return;
      let x = 540 - ln.parts.reduce((w, [str, col]) => w + textTex(str, { size: ln.size, weight: 900, color: col, spacing: 6, pad: 4 }).w, 0) / 2;
      for (const [str, col] of ln.parts) {
        const tx = textTex(str, { size: ln.size, weight: 900, color: col, spacing: 6, pad: 4 });
        this.stage.quad(T, tx.tex, card(540 + (x + tx.w / 2 - 540) * l.scale, ln.y, tx.w, tx.h, { scale: l.scale }), { opacity: a });
        x += tx.w;
      }
    });
  }
  level(t) { return Math.pow(this.levels[Math.min(this.levels.length - 1, Math.round(t * 30))] || 0, 1.6); }

  async talkBase(T, t, seg, behindFn) {
    const n = Math.round(t * 30), z = talkZoom(t, seg), cy = 1000;
    await this.talk.load(n); await this.person.load(Math.max(132, Math.min(10835, n)));
    const c = (x, y) => [(x - 540) * z + 540, (y - cy) * z + cy];
    this.stage.quad(T, this.talk.tex, [c(0, 0), c(W, 0), c(0, H), c(W, H)]);
    if (behindFn) await behindFn(T);
    const un = this.mPerson.uniforms; un.xf.value.set(z, 540, cy); un.rimCol.value.set(0, 0, 0);
    this.stage.pass(this.mPerson, T);
  }

  // The speaker's face, live, for the square PIP: a square around the head in the talk frame.
  async pip(T, t, a, x = 850, y = 1190, w = 290, h = 350) {
    if (a <= 0) return;
    const n = Math.round(t * 30), hd = this.head[n] || [540, 680], sw = 660, sh = sw * h / w;
    await this.talk.load(n);
    const x0 = clamp(hd[0] - sw / 2, 0, 1080 - sw), y0 = clamp(hd[1] - 60, 0, 1920 - sh);
    drawPipRound(this.stage, T, this.mRound, this.talk.tex, uvr(1080, 1920, x0, y0, sw, sh), x, y, w, h, { a, level: this.level(t), t });
  }

  lineState(t, scene) {
    const flow = t;
    const src = SRC.map((s) => ({ ...s, a: scene === 'final' ? 2 : clamp((t - s.at + .2) / 1.0, 0, 2) }));
    const gateA = scene === 'final' ? 1 : smooth(t, 149.6, 150.6);
    const laps = LAPS.map((L, i) => {
      const at = scene === 'final' ? 0 : 156.6 + i * .32;
      const keyAt = scene === 'final' ? 239.0 + i * .1 : 159.6 + i * .2;
      return { ...L, a: scene === 'final' ? 2 : clamp((t - at) / .7, 0, 2), key: clamp((t - keyAt) / .5, 0, 1) };
    });
    return { src, gatePos: GATE, laptops: laps, flow: gateA > .5 ? flow : null, label: gateA, gateName: '公司网关', gateSub: '一个入口 · 统一记账' , gateA };
  }

  drawLines(T, t, mode, ev = true) {
    const s = this.stage, st = this.lineState(t, mode), x = this.front.begin();
    drawLineWorld(x, st);
    if (mode !== 'final' && t < 130.4) handWord(x, '流量 · 模型 · 合在一起', 540, 560, 76, -.03, HAND, '#9fc4ff', smooth(t, 119.8, 121.4) * (1 - smooth(t, 129.9, 130.4)));
    this.dark(T);
    if (st.gateA > 0) {
      s.quad(T, this.glow, card(GATE[0], GATE[1], 560, 560), { tint: [.1, .4, 1], add: true, opacity: .6 * st.gateA });
      drawPane(s, T, GATE[0], GATE[1], 70 * mix(.4, 1, easeOutBack(st.gateA, 1.4)), { gain: 1.6, opacity: st.gateA });
    }
    this.full(T, this.front.end());
    if (mode === 'final') this.chip(T, '公司变成一个网关中转站', 60, 180, smooth(t, 232.1, 232.6));
    if (ev) this.evidence(T, t, t < 140 ? 'cost' : 'ov', 1);
  }

  // ---------- scenes ----------

  async scTalk(T, t, seg) {
    const s = this.stage;
    const behind = async (T2) => {
      const x = this.behind.begin();
      let used = false;
      // hook
      if (t < 8.4) { this.bigType(T2, [{ y: 470, size: 230, parts: [['Codex', INK]] }], t, 5.95, 8.4); }
      if (t > 7.4 && t < 8.4) { used = true; handWord(x, '真香！', 830, 250, 150, .12, BRUSH, RED, smooth(t, 7.5, 7.95) * (1 - smooth(t, 8.1, 8.4))); }
      if (t > 13.4 && t < 16.4) {
        used = true; const o = 1 - smooth(t, 16.0, 16.4);
        handWord(x, '一到全公司……', 540, 300, 86, -.03, HAND, INK, smooth(t, 13.4, 14.3) * o);
        handWord(x, '傻了眼', 820, 470, 130, .1, BRUSH, RED, smooth(t, 15.6, 16.0) * o);
      }
      // ① 注册难
      if (t > 18.3 && t < 21) { this.bigType(T2, [{ y: 470, size: 210, parts: [['① ', BLUE], ['注册难', INK]] }], t, 18.9, 21); }
      if (t > 20.8 && t < 35.4) {
        used = true; const o = 1 - smooth(t, 35.0, 35.4);
        const items = [['网络环境有要求', 20.9, 270], ['要手机号验证', 23.5, 380], ['海外号接码', 25.0, 490], ['账号还可能被封', 31.2, 600]];
        items.forEach(([str, at, y], i) => {
          handWord(x, str, 120, y, 72, -.02, HAND, INK, smooth(t, at, at + .5) * o, 'left');
          if (i < 3) strike(x, 110, 110 + str.length * 70, y, smooth(t, 27.9 + i * .25, 28.4 + i * .25) * o, 5 + i);
        });
        handWord(x, '卡住很多人', 830, 400, 96, .08, BRUSH, RED, smooth(t, 28.2, 28.7) * o);
        if (t > 31.2) handWord(x, '?!', 900, 560, 130, .2, BRUSH, RED, smooth(t, 31.5, 31.8) * o);
      }
      // ② 算账亏
      if (t > 35.6 && t < 38.6) { this.bigType(T2, [{ y: 470, size: 210, parts: [['② ', BLUE], ['算账亏', INK]] }], t, 36.0, 38.6); }
      if (t > 38.4 && t < 45.0) {
        used = true; const o = 1 - smooth(t, 44.6, 45.0);
        for (let i = 0; i < 5; i++) {
          const a = smooth(t, 38.6 + i * .18, 38.9 + i * .18) * o, px = 160 + i * 190;
          ink(x, wobble(ellipseScribble(px, 250, 30, 30, 1.05, i * 3), 2, i), 6, INK, i, a);
          ink(x, wobble([[px - 50, 380], [px - 46, 320], [px, 296], [px + 46, 320], [px + 50, 380]], 3, i + 9), 6, INK, i + 2, a);
          handWord(x, '¥', px, 440, 64, 0, HAND, BLUE, smooth(t, 39.8 + i * .12, 40.1 + i * .12) * o);
        }
        handWord(x, '5 个人 = 5 份钱', 540, 560, 96, -.03, HAND, INK, smooth(t, 42.5, 43.2) * o);
        ink(x, wobble(ellipseScribble(700, 566, 150, 68, 1.2, 3, -.05), 4, 4), 6, RED, 1, smooth(t, 43.0, 43.6) * o);
      }
      if (t > 54.8 && t < 60.5) {
        used = true; const o = 1 - smooth(t, 60.0, 60.4);
        // two quota bars: the boss barely uses it, the team runs out
        const bars = [['老板', 54.9, 210, .16, '额度用不完', 55.6], ['小伙伴', 55.3, 420, 1.0, '额度又不够了', 56.9]];
        bars.forEach(([who, at, y, fill, note, nAt], i) => {
          const a = smooth(t, at, at + .4) * o;
          handWord(x, who, 110, y, 70, 0, HAND, INK, a, 'left');
          ink(x, wobble([[330, y - 30], [940, y - 30], [940, y + 30], [330, y + 30], [330, y - 30]], 3, i * 7), 5, INK, i, a);
          const f = i === 0 ? fill : fill * smooth(t, 55.5, 56.9);
          if (f > 0) { x.save(); x.globalAlpha = a * .85; x.fillStyle = i ? RED : BLUE; x.fillRect(338, y - 22, 594 * f, 44); x.restore(); }
          handWord(x, note, 940, y + 78, 54, 0, HAND, i ? RED : BLUE, smooth(t, nAt, nAt + .5) * o, 'right');
        });
        if (t > 57.3) {
          handWord(x, '旱死', 200, 660, 140, -.14, BRUSH, INK, smooth(t, 57.9, 58.3) * o);
          handWord(x, '涝死', 880, 660, 140, .12, BRUSH, INK, smooth(t, 59.2, 59.6) * o);
        }
      }
      // ③ 管理难
      if (t > 63.6 && t < 66.4) { this.bigType(T2, [{ y: 470, size: 210, parts: [['③ ', BLUE], ['管理难', INK]] }], t, 64.1, 66.4); }
      if (t > 66.2 && t < 89) {
        used = true; const o = 1 - smooth(t, 79.6, 79.92);
        // three personal accounts, records locked inside each
        for (let i = 0; i < 3; i++) {
          const a = smooth(t, 66.5 + i * .25, 66.9 + i * .25) * o, px = 200 + i * 340, gone = i === 2 ? smooth(t, 74.6, 75.4) : 0;
          ink(x, wobble([[px - 120, 240], [px + 120, 240], [px + 120, 460], [px - 120, 460], [px - 120, 240]], 4, i * 5), 6, gone > 0 ? `rgba(22,25,30,${1 - .7 * gone})` : INK, i, a);
          handWord(x, `账号 ${i + 1}`, px, 280, 54, 0, HAND, INK, a * (1 - .7 * gone));
          for (let r = 0; r < 3; r++) ink(x, wobble(lineN([px - 80, 340 + r * 36], [px + 70 - r * 20, 340 + r * 36], 10), 2, i * 3 + r), 4, '#6b7684', r, smooth(t, 68.3 + r * .2, 68.7 + r * .2) * o * (1 - .7 * gone));
          // the lock
          const la = smooth(t, 69.5 + i * .15, 69.9 + i * .15) * o;
          ink(x, wobble(ellipseScribble(px + 90, 440, 16, 18, 1, i), 1.5, i), 5, RED, i, la);
          if (gone > 0) handWord(x, '人走了', px, 520, 60, .06, HAND, RED, smooth(t, 74.6, 75.1) * o);
        }
        if (t > 77.4) {
          const a = smooth(t, 77.6, 78.1) * o;
          handWord(x, '公司流程', 540, 610, 86, -.02, HAND, BLUE, a);
          for (let i = 0; i < 3; i++) {
            arrow(x, [200 + i * 340, 470], [mix(200 + i * 340, 540, .55), 565], i === 1 ? 0 : (i ? 20 : -20), 5, '#7a8592', i + 4, smooth(t, 78.0 + i * .2, 78.5 + i * .2) * o);
          }
          handWord(x, '×', 540, 520, 110, 0, BRUSH, RED, smooth(t, 79.0, 79.3) * o);
        }
      }
      // the solution
      if (t > 97.0 && t < 108) {
        used = true; const o = 1 - smooth(t, 107.3, 107.75);
        handWord(x, '一套解决方案', 540, 300, 110, -.03, HAND, INK, smooth(t, 101.0, 101.7) * o);
        ink(x, wobble(lineN([250, 370], [830, 360], 30), 4, 8), 8, BLUE, 2, smooth(t, 101.6, 102.0) * o);
        if (t > 105.6) handWord(x, '每个老板都该知道', 540, 470, 80, .02, HAND, RED, smooth(t, 105.8, 106.8) * o);
      }
      // 184–197: one pool, everyone uses it
      if (t > 184 && t < 197) {
        used = true; const o = 1 - smooth(t, 196.6, 197);
        handWord(x, '一个池子', 540, 230, 110, -.03, HAND, INK, smooth(t, 189.0, 189.6) * o);
        const pa = smooth(t, 189.4, 190.0) * o;
        ink(x, wobble([[240, 320], [260, 520], [820, 520], [840, 320]], 4, 3), 7, INK, 2, pa);
        if (pa > 0) { x.save(); x.globalAlpha = pa * .8; x.fillStyle = BLUE; x.beginPath(); x.moveTo(262, 400); x.lineTo(270, 510); x.lineTo(810, 510); x.lineTo(820, 400); x.fill(); x.restore(); }
        for (let i = 0; i < 5; i++) arrow(x, [300 + i * 120, 640], [300 + i * 120, 540], (i - 2) * 6, 5, INK, i, smooth(t, 192.6 + i * .12, 193.0 + i * .12) * o);
        handWord(x, '谁用多用少都不怕', 540, 720, 70, .02, HAND, RED, smooth(t, 193.0, 193.7) * o);
      }
      // 244–256: the title, then 难吗？
      if (t > 244 && t < 247.3) {
        this.bigType(T2, [{ y: 400, size: 200, parts: [['一个订阅', INK]] }, { y: 630, size: 136, parts: [['每人一把', INK], ['钥匙', BLUE]] }], t, 244.2, 247.3);
      }
      if (t > 247.3 && t < 256.3) {
        used = true; const o = 1 - smooth(t, 255.9, 256.3);
        handWord(x, '难吗？', 300, 300, 140, -.08, BRUSH, INK, smooth(t, 247.6, 248.0) * o);
        handWord(x, '不难', 800, 320, 140, .08, BRUSH, BLUE, smooth(t, 248.7, 249.0) * o);
      }
      // 297.9–317: a skill, fed to whatever tool you have
      if (t > 300 && t < 317.2) {
        used = true; const o = 1 - smooth(t, 316.8, 317.2);
        handWord(x, '没关系', 800, 380, 120, .08, BRUSH, BLUE, smooth(t, 301.8, 302.2) * o);
      }
      // CTA zone handled in front
      if (used) this.full(T2, this.behind.end());
    };
    await this.talkBase(T, t, seg, behind);

    // front: section chips and pills
    this.chip(T, '① 注册难', 50, 150, inout(t, 21.0, 35.4));
    this.chip(T, '② 算账亏', 50, 150, inout(t, 38.6, 60.4));
    this.chip(T, '③ 管理难', 50, 150, inout(t, 66.4, 88.9));
    if (t < 13.3) {
      const o = 1 - smooth(t, 12.9, 13.3);
      this.pill(T, '背调', 240, 300, t, 9.4, { a: o, size: 50, h: 108 });
      this.pill(T, '查客户', 540, 300, t, 10.3, { a: o, size: 50, h: 108 });
      this.pill(T, '写开发信', 850, 300, t, 11.1, { a: o, size: 50, h: 108 });
      if (t > 11.8) { const x = this.front.begin(); handWord(x, '一个顶好几个', 540, 460, 96, -.03, HAND, BLUE, smooth(t, 11.8, 12.6) * o); this.full(T, this.front.end()); }
    }
    if (t > 305 && t < 317.2) {
      const o = 1 - smooth(t, 316.8, 317.2);
      this.pill(T, '做成了一个完整的 skill', 540, 520, t, 305.6, { blue: true, a: o, size: 44, h: 96 });
      this.pill(T, '豆包', 260, 660, t, 311.8, { a: o });
      this.pill(T, 'WorkBuddy', 540, 660, t, 312.3, { a: o });
      this.pill(T, '其他智能体', 840, 660, t, 314.4, { a: o });
    }
    if (t > 328 && t < 337) this.pill(T, '公司内部的 AI 流量管理', 540, 300, t, 334.6, { blue: true, a: 1 - smooth(t, 336.6, 337), size: 44, h: 96 });
    if (t > 342) {
      this.pill(T, '加助教伙伴', 540, 260, t, 345.3, { blue: true, size: 56, h: 120 });
      this.pill(T, '了解课程', 340, 430, t, 348.9, { size: 48, h: 104 });
      this.pill(T, '线上资料包', 720, 430, t, 350.9, { size: 48, h: 104 });
    }
  }

  async scPane(T, t, seg) {
    const s = this.stage;
    s.clear(this.aux, [0, 0, 0]);
    this.drawLines(this.aux, Math.max(t, 121.4), 'intro', false);
    const open = easeOut(ramp(t, 119.7, 120.5)), push = easeIn(ramp(t, 121.3, 122.06));
    const h = mix(20, 470, open) * mix(1, 6.5, push);
    const n = Math.round(t * 30), z = talkZoom(t, seg);
    await this.talk.load(n); await this.person.load(n);
    const c = (x, y) => [(x - 540) * z + 540, (y - 1000) * z + 1000];
    s.quad(T, this.talk.tex, [c(0, 0), c(W, 0), c(0, H), c(W, H)]);
    s.quad(T, this.glow, card(560, 640, 1500, 1900), { tint: [.15, .45, 1], add: true, opacity: .32 * open });
    const un = this.mPane.uniforms; un.world.value = this.aux.texture; un.pane.value.set(560, mix(640, 900, push), h); un.zoom.value = mix(.45, 1, push); un.open.value = open; un.look.value.set(540, mix(760, 960, push));
    s.pass(this.mPane, T);
    const pu = this.mPerson.uniforms; pu.xf.value.set(z, 540, 1000); pu.rimCol.value.set(.35 * open, .8 * open, 2.4 * open);
    s.pass(this.mPerson, T);
    pu.rimCol.value.set(0, 0, 0);
    // through the window: the world takes the whole frame
    const thru = smooth(push, .35, .85);
    if (thru > 0) this.full(T, this.aux.texture, { opacity: thru, hdr: true });
  }

  async scCost(T, t) {
    const s = this.stage, im = this.img.cost, cr = [0, 240, 1415, 350];
    const a = smooth(t, 142.9, 143.3) * (1 - smooth(t, 147.4, 147.8));
    this.dark(T);
    this.text(T, '全公司 · 每月固定成本', 540, 230, { size: 62, weight: 900, opacity: a });
    this.text(T, '数据中台截图 · 2026-11-19', 540, 302, { size: 28, weight: 500, color: '#8fa2b8', opacity: a });
    const cw = 960, ch = cw * cr[3] / cr[2], cx = 520, cy = 640, o = { ry: mix(22, 14, easeOut(ramp(t, 142.9, 147.8))), rx: -7, persp: 1500 };
    drawScreen(s, T, this.fx, this.tex.cost, uvr(im.width, im.height, ...cr), cx, cy, cw, ch, o, { a, gain: 1.3 });
    const la = smooth(t, 144.0, 144.5) * a;
    if (la > 0) {
      const [qx, qy] = cardPoint(cx, cy, cw, ch, o, (1265 - cr[0]) / cr[2], (548 - cr[1]) / cr[3]);
      const lx = 400, ly = 1080, R = 200, ang = Math.atan2(ly - qy, lx - qx), ex = lx - Math.cos(ang) * R, ey = ly - Math.sin(ang) * R, len = Math.hypot(ex - qx, ey - qy);
      s.quad(T, null, card((qx + ex) / 2, (qy + ey) / 2, len, 4, { rz: ang * 180 / Math.PI }), { solid: true, tint: BRAND_BLUE, gain: 1.4, opacity: la });
      s.quad(T, null, card(qx, qy, 18, 18, { rz: 45 }), { solid: true, tint: BRAND_BLUE, gain: 1.5, opacity: la });
      s.quad(T, this.shadow, card(lx + 16, ly + 30, R * 3.1, R * 3.1), { opacity: .6 * la });
      s.quad(T, this.lens, card(lx, ly, R * 2, R * 2, { scale: mix(.7, 1, easeOutBack(ramp(t, 144.0, 144.5), 1.3)) }), { opacity: la });
      this.pill(T, '一个月也就一千左右', 790, 1210, t, 144.8, { blue: true, a, size: 36, h: 80 });
    }
  }

  async scScreen(T, t, seg, name) {
    const s = this.stage, sc = sceneAt(t), t0 = sc[1], t1 = sc[2];
    const rec = this.rec[name], n = Math.min(this.recLen[name], Math.round((t - t0) * 30) + (name === 'date' ? 30 : 0));
    await rec.load(n);
    const a = smooth(t, t0, t0 + .35) * (1 - smooth(t, t1 - .3, t1));
    this.dark(T);
    const crops = { ov: [0, 0, 1415, 500], model: [0, 180, 1415, 440], person: [0, 0, 1415, 560], date: [0, 60, 1415, 560] };
    const titles = { ov: '每个人用了多少，一眼看到', model: '近 30 天 · 哪个模型用得最多', person: '按归属人 · 每个伙伴用了什么', date: '按日期 · 哪天用得多' };
    const cr = crops[name], cw = name === 'model' ? 1060 : 1020, ch = cw * cr[3] / cr[2], push = easeInOut(ramp(t, t0, t1)), cx = 540, cy = 640;
    this.text(T, titles[name], 540, 210, { size: 50, weight: 900, opacity: a });
    drawScreen(s, T, this.fx, rec.tex, uvr(REC.w, REC.h, ...cr), cx, cy, cw * mix(1, 1.04, push), ch * mix(1, 1.04, push), { ry: mix(-6, 4, push), rx: -4, persp: 1800 }, { a, gain: 1.25, reflect: false });
    if (name === 'model') {
      // top row: used most; then worth paying; bottom rows: on the way out
      const rowY = (i) => cy - ch / 2 + ch * (244 - cr[1] + i * 30) / cr[3];
      const hA = smooth(t, 201.6, 202.1) * a;
      if (hA > 0) s.quad(T, this.hiRow, card(cx, rowY(0), cw * .97, 34), { opacity: hA });
      this.pill(T, '用得最多', 880, rowY(0) - 70, t, 201.8, { blue: true, a, size: 34, h: 72 });
      this.pill(T, '值得付费', 860, rowY(1) + 40, t, 205.9, { a, size: 34, h: 72 });
      this.pill(T, '可以慢慢退出', 780, cy + ch / 2 - 30, t, 207.6, { a, size: 34, h: 72 });
    }
    if (name === 'person') this.pill(T, '名字已打码', 230, cy + ch / 2 + 50, t, 210.3, { a: a * .9, size: 28, h: 60 });
    await this.pip(T, t, a, 820, 1180, 340);
  }

  async scData(T, t) {
    const s = this.stage, a = smooth(t, 172.7, 173.0) * (1 - smooth(t, 183.6, 184));
    this.dark(T);
    this.text(T, '数据：半斤九两 AI 数据中台 · 2026-11-19', 90, 150, { size: 26, weight: 500, color: '#7f93ab', align: 'left', opacity: a });
    [172.8, 175.2].forEach((at, i) => {
      const l = landing(t, at, .35, 1.12), r = this.rows[i];
      if (l.u > 0) s.quad(T, r.tex, card(90 + r.w / 2, 400 + i * 270, r.w, r.h, { scale: l.scale }), { opacity: l.op * a });
    });
    await this.rec.ov.load(Math.round((t - 172.7) * 30) + 150);
    this.evidence(T, t, 'heat', a);
    this.heat.draw(ramp(t, 173.2, 176.0)); this.heatT.needsUpdate = true;
    s.quad(T, this.glow, card(540, 1240, 1000, 520), { tint: [.05, .3, 1], add: true, opacity: .35 * a });
    s.quad(T, this.heatT, card(540, 1180, W, 560), { opacity: a });
    this.text(T, '近 84 天 · 每一格是一天，越高用得越多', 540, 1418, { size: 28, weight: 500, color: '#8fa2b8', opacity: a * smooth(t, 175.5, 176) });
  }

  async scBoard(T, t) {
    const s = this.stage, B = this.aux;
    await Promise.all([this.rec.ov.load(150), this.rec.model.load(200), this.rec.date.load(300)]);
    s.clear(B, [0, 0, 0]); this.full(B, this.paper);
    // camera: slides in from the right, settles, drifts
    const u = easeOut(ramp(t, 221.7, 222.9)), cam = mix(-900, 0, u) - 30 * ramp(t, 223, 229.4), speed = (1 - u) * 900;
    const cards = [
      [this.rec.ov.tex, uvr(REC.w, REC.h, 0, 0, 1415, 520), 430, 420, 780, -3],
      [this.rec.model.tex, uvr(REC.w, REC.h, 0, 60, 1415, 500), 640, 820, 760, 2],
      [this.rec.date.tex, uvr(REC.w, REC.h, 0, 60, 1415, 520), 380, 1180, 700, -2],
      [this.tex.doccode, uvr(DOC.w, DOC.h, 0, 170, 1200, 560), 760, 1330, 520, 3],
    ];
    for (const [tex, uv, x0, y, w, rz] of cards) {
      const x = x0 - cam, h = w * uv[3] * (tex === this.tex.doccode ? DOC.h : REC.h) / (uv[2] * (tex === this.tex.doccode ? DOC.w : REC.w));
      s.quad(B, this.shadow, card(x + 8, y + 16, w * 1.25, h * 1.5, { rz }), { opacity: .28 });
      s.quad(B, null, card(x, y, w + 16, h + 16, { rz }), { solid: true, tint: [.94, .94, .93] });
      s.quad(B, tex, card(x, y, w, h, { rz }), { uvRect: uv });
      s.quad(B, this.tape, card(x, y - h / 2 - 4, 150, 46, { rz: rz + 4 }));
    }
    const x = this.front.begin();
    x.save(); x.translate(-cam, 0);
    handWord(x, '用量', 760, 175, 70, -.05, HAND, '#0b5fd6', smooth(t, 223.0, 223.5));
    handWord(x, '哪个模型', 900, 600, 66, .04, HAND, '#0b5fd6', smooth(t, 223.6, 224.1));
    handWord(x, '哪一天', 120, 960, 66, -.05, HAND, '#0b5fd6', smooth(t, 224.2, 224.7), 'left');
    handWord(x, '全在公司自己手里', 540, 1700, 84, -.02, HAND, RED, smooth(t, 226.6, 227.6));
    x.restore();
    this.full(B, this.front.end());
    let src = B, dst = this.aux2;
    const blur = speed / 900;
    for (let i = 0; i < (blur > .02 ? 3 : 0); i++) {
      this.mBlur.uniforms.src.value = src.texture; this.mBlur.uniforms.dir.value.set((blur * 9 * (1 + i)) / W, 0);
      s.pass(this.mBlur, dst); [src, dst] = [dst, src];
    }
    this.mCopy.uniforms.src.value = src.texture; this.mCopy.uniforms.gain.value = 1; s.pass(this.mCopy, T);
  }

  async scDoc(T, t, seg, name) {
    const s = this.stage, sc = sceneAt(t), t0 = sc[1], t1 = sc[2], im = this.img[name];
    const a = smooth(t, t0, t0 + .35) * (1 - smooth(t, t1 - .3, t1)), push = easeInOut(ramp(t, t0, t1));
    this.dark(T);
    if (name === 'doctop') {
      const cr = [0, 0, 1200, 860], cw = 1000, ch = cw * cr[3] / cr[2];
      drawScreen(s, T, this.fx, this.tex.doctop, uvr(im.width, im.height, ...cr), 540, 700, cw, ch, { ry: mix(6, -4, push), rx: -3, persp: 1800 }, { a, gain: 1, reflect: false });
      const hA = smooth(t, 243.4, 243.9) * a;
      if (hA > 0) s.quad(T, this.hiTitle, card(540, 700 - ch / 2 + ch * 160 / 860, cw * .92, 150), { opacity: hA });
      this.text(T, '专门的教程', 540, 220, { size: 54, weight: 900, opacity: a });
    } else {
      const cr = [0, 260, 1200, 900], cw = 1000, ch = cw * cr[3] / cr[2];
      this.text(T, '这个中台，也是 DeepSeek 搭的本地插件', 540, 220, { size: 46, weight: 900, opacity: a });
      drawScreen(s, T, this.fx, this.tex.docds, uvr(im.width, im.height, ...cr), 540, 700, cw * mix(1, 1.06, push), ch * mix(1, 1.06, push), { ry: mix(-5, 5, push), rx: -3, persp: 1800 }, { a, gain: 1.1, reflect: false });
      const la = smooth(t, 317.6, 318.1) * a;
      if (la > 0) {
        const bx = 540 - cw / 2 + cw * 135 / 1200, by = 700 - ch / 2 + ch * (382 - 260) / 900;
        s.quad(T, this.dsBox, card(bx, by, 250, 76), { opacity: la });
      }
      this.pill(T, '本地用 DeepSeek 创建', 380, 1180, t, 318.7, { blue: true, a, size: 38, h: 84 });
    }
    await this.pip(T, t, a, 820, 1250, 320);
  }

  async scTerm(T, t) {
    const s = this.stage, a = smooth(t, 256.3, 256.7) * (1 - smooth(t, 297.5, 297.9));
    let k = -1; STEPS.forEach((st, i) => { if (t >= st.at) k = i; });
    const tm = k < 0 ? this.term0 : this.term[STEPS[k].no], cw = 860, ch = cw * tm.h / tm.w, cx = 540, cy = 475;
    this.dark(T);
    s.quad(T, this.rglow, card(cx, cy, cw * 1.2, ch * 1.25), { tint: [.03, .18, .6], add: true, opacity: .5 * a });
    const l0 = landing(t, 256.3, .4, 1.1);
    drawCard(s, T, this.shadow, tm.tex, cx, cy, cw, ch, { shadow: .7, opacity: a * l0.op, scale: l0.scale, k: l0.k });
    // step dots 1-4 along the top
    STEPS.forEach((st, i) => {
      const on = i <= k, cur = i === k, x = 210 + i * 220, y = 110;
      s.quad(T, null, card(x, y, 64, 64, { rz: 45 }), { solid: true, tint: on ? BRAND_BLUE : [.12, .15, .2], gain: cur ? 1.5 : 1, opacity: a });
      this.text(T, st.no, x, y, { size: 32, weight: 900, opacity: a });
      if (i < 3) s.quad(T, null, card(x + 110, y, 120, 3), { solid: true, tint: i < k ? BRAND_BLUE : [.2, .24, .3], opacity: a });
    });
    if (k >= 0) {
      const st = STEPS[k], p = this.pops[k], l = landing(t, st.at, .35, 1.25);
      const rowY = cy - ch / 2 + (120 + st.hi[0] * tm.lh) * ch / tm.h, pw = Math.min(1000, p.w), ph = pw * p.h / p.w, py = 880;
      s.quad(T, null, card(cx, (rowY + 30 + py - ph / 2) / 2, 4, Math.max(0, py - ph / 2 - rowY - 30)), { solid: true, tint: BRAND_BLUE, gain: 1.4, opacity: a * l.op });
      drawCard(s, T, this.shadow, p.tex, cx, py, pw, ph, { shadow: .7, rz: -1.2, opacity: a * l.op, scale: l.scale, k: l.k });
      const name = pillTex(`${st.no}  ${st.name}`, { size: 48, weight: 900, h: 104, bg: 'rgba(0,145,255,.96)', color: '#fff', padX: 44 });
      const l2 = landing(t, st.at + .15, .3, 1.3);
      drawCard(s, T, this.shadow, name.tex, 540, 1010, name.w, name.h, { shadow: .4, opacity: a * l2.op, scale: l2.scale, k: l2.k });
    } else {
      this.text(T, '总共就干了四件事', 540, 950, { size: 64, weight: 900, opacity: a * smooth(t, 256.6, 257.0) });
    }
    this.evidence(T, t, 'table', a, k);
    await this.pip(T, t, a, 860, 1250, 260, 312);
  }

  // Real recording in a rounded window, as proof that the drawing above is not made up.
  evidence(T, t, kind, a, step = -1) {
    const s = this.stage;
    if (kind === 'table') {
      const cx = 310, cy = 1250, w = 500, h = 204, rowC = [54, 95.5, 179, 179];
      drawEvidence(s, T, this.mRound, this.tex.doccode, uvr(DOC.w, DOC.h, 20, 610, 1080, 440), cx, cy, w, h, { a, label: '真实教程录屏', gain: 1 });
      if (step >= 0) s.quad(T, this.rowBox, card(cx, cy - h / 2 + rowC[step], w - 16, 40), { opacity: a * smooth(t, STEPS[step].at, STEPS[step].at + .3) });
      return;
    }
    const cx = 850, cy = 168, w = 380;
    if (kind === 'cost') drawEvidence(s, T, this.mRound, this.tex.cost, uvr(this.img.cost.width, this.img.cost.height, 0, 330, 1100, 520), cx, cy, w, w * 520 / 1100, { a, label: '真实后台录屏' });
    else if (kind === 'heat') drawEvidence(s, T, this.mRound, this.rec.ov.tex, uvr(REC.w, REC.h, 0, 170, 640, 320), cx, cy, w, w / 2, { a, label: '真实后台录屏' });
    else drawEvidence(s, T, this.mRound, this.rec.ov.tex, uvr(REC.w, REC.h, 0, 0, 1415, 500), cx, cy, w, w * 500 / 1415, { a, label: '真实后台录屏' });
  }

  async scEnd(T, t) {
    const s = this.stage, a = smooth(t, 353.9, 354.6);
    this.full(T, this.tex.hall_vertical, { gain: .9 * a });
    s.quad(T, this.shadow, card(540, 1540, 1300, 520), { opacity: .5 * a });
    const str = '把重复交给 AI，把时间还给真实世界', nch = Math.floor(clamp((t - 359.95) * 14, 0, str.length));
    if (nch > 0) {
      const full = textTex(str, { size: 50, weight: 700, spacing: 2, pad: 4 }), part = textTex(str.slice(0, nch), { size: 50, weight: 700, spacing: 2, pad: 4 });
      s.quad(T, part.tex, card(540 - full.w / 2 + part.w / 2, 1440, part.w, part.h));
      if (nch < str.length) drawPane(s, T, 540 - full.w / 2 + part.w + 10, 1440, 20);
    }
    const la = smooth(t, 361.3, 361.9);
    s.quad(T, this.tex.logo_bj, card(540, 1600, 300, 300 * 211 / 512), { opacity: la });
  }

  async frame(ft) {
    const { t, seg } = CUTS.toSrc(ft), s = this.stage, sc = sceneAt(t);
    s.clear(this.comp, [0, 0, 0]);
    const T = this.comp;
    switch (sc[0]) {
      case 'talk': await this.scTalk(T, t, seg); break;
      case 'pane': await this.scPane(T, t, seg); break;
      case 'lines': await this.rec.ov.load(Math.round(t * 30) % 300); this.drawLines(T, t, t > 229 ? 'final' : 'intro'); break;
      case 'cost': await this.scCost(T, t); break;
      case 'screen': await this.scScreen(T, t, seg, sc[3]); break;
      case 'data': await this.scData(T, t); break;
      case 'board': await this.scBoard(T, t); break;
      case 'doc': await this.scDoc(T, t, seg, sc[3]); break;
      case 'term': await this.scTerm(T, t); break;
      case 'end': await this.scEnd(T, t); break;
    }
    this.mCopy.uniforms.src.value = this.comp.texture; this.mCopy.uniforms.gain.value = 1;
    s.pass(this.mCopy, this.post);
    const line = this.subs.find((l) => ft >= l.s && ft < l.e);
    if (line && !(sc[0] === 'end' && t >= 358.6)) drawSubtitle(s, this.post, line.text, smooth(ft, line.s, line.s + .06) * (1 - smooth(ft, line.e - .05, line.e)));
    this.mFinal.uniforms.frameNo.value = Math.round(ft * 30);
    s.pass(this.mFinal, null);
    return s.readPixels();
  }
}
