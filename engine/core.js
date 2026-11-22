// The shared compositor. Everything is drawn in pixel coordinates (origin top-left, 1080x1920),
// in linear light on half-float targets, and every value is a pure function of time.
import * as THREE from '/node_modules/three/build/three.module.js';
export { THREE };

export const W = 1080, H = 1920;
export const BRAND_BLUE = [0, 0.283, 1];   // #0091FF from the logo, in linear light

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ramp = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (t, a, b) => { const u = ramp(t, a, b); return u * u * (3 - 2 * u); };
export const easeOut = (u) => 1 - Math.pow(1 - u, 3);
export const easeIn = (u) => u * u * u;
export const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
export const easeOutBack = (u, s = 1.3) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
export const mix = (a, b, u) => a + (b - a) * u;
export const mix3 = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const noise1 = (t) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return mix(hash(i), hash(i + 1), u); };
export const srgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const rgb = (hex) => [srgb(parseInt(hex.slice(1, 3), 16) / 255), srgb(parseInt(hex.slice(3, 5), 16) / 255), srgb(parseInt(hex.slice(5, 7), 16) / 255)];

const GLSL = `
const float W = 1080.0, H = 1920.0;
vec3 toLinear(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s; }
`;

const FULL_VS = `
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv = p; gl_Position = vec4(p*2.-1., 0., 1.); }`;

const QUAD_VS = `
uniform vec3 P[4];
out vec3 vUvW;
void main(){
  int i = gl_VertexID; vec3 p = P[i];
  vec2 q = vec2((i==1||i==3)?1.:0., (i>=2)?1.:0.);
  vUvW = vec3(q, 1.);  // GL interpolates perspective-correctly because w is set below
  gl_Position = vec4(vec2(p.x/W*2.-1., 1.-p.y/H*2.)*p.z, 0., p.z);
}`;

const blends = {
  over: { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor },
  add: { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor },
  none: { blending: THREE.NoBlending },
};

export function fullMaterial(frag, uniforms = {}, blend = 'none') {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: GLSL + FULL_VS,
    fragmentShader: `precision highp float;\n${GLSL}\nin vec2 vUv; out vec4 outColor;\n${frag}`,
    uniforms, depthTest: false, depthWrite: false, side: THREE.DoubleSide, transparent: blend !== 'none', ...blends[blend] });
}

function quadMaterial(frag, uniforms, blend) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: GLSL + QUAD_VS,
    fragmentShader: `precision highp float;\n${GLSL}\nin vec3 vUvW; out vec4 outColor;\n${frag}`,
    uniforms: { P: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] }, ...uniforms },
    depthTest: false, depthWrite: false, side: THREE.DoubleSide, transparent: true, ...blends[blend] });
}

const QUAD_FRAG = `
uniform sampler2D map; uniform float opacity; uniform vec3 tint; uniform float gain; uniform float isHDR; uniform vec4 uvRect; uniform float solid;
void main(){
  vec2 uv = vUvW.xy/vUvW.z;
  vec2 e = max(fwidth(uv), vec2(1e-5));
  float edge = smoothstep(0., e.x*1.5, uv.x)*smoothstep(0., e.x*1.5, 1.-uv.x)*smoothstep(0., e.y*1.5, uv.y)*smoothstep(0., e.y*1.5, 1.-uv.y);
  vec4 c;
  if (solid > .5) { c = vec4(1.); }
  else {
    c = texture(map, uvRect.xy + uv*uvRect.zw);
    if (isHDR < .5) { vec3 s = c.a > 1e-4 ? c.rgb/c.a : vec3(0.); c.rgb = toLinear(s)*c.a; }
  }
  float a = opacity*edge;
  outColor = vec4(c.rgb*tint*gain*a, c.a*a);
}`;

export class Stage {
  constructor() {
    THREE.ColorManagement.enabled = false;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H, false); r.autoClear = false;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    document.body.appendChild(r.domElement);
    this.gl = r.getContext();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fullScene = new THREE.Scene();
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.fullMesh = new THREE.Mesh(tri); this.fullMesh.frustumCulled = false; this.fullScene.add(this.fullMesh);
    this.quadScene = new THREE.Scene();
    const qg = new THREE.BufferGeometry();
    qg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    qg.setIndex([0, 2, 1, 1, 2, 3]);
    this.quadMesh = new THREE.Mesh(qg); this.quadMesh.frustumCulled = false; this.quadScene.add(this.quadMesh);
    const uni = () => ({ map: { value: null }, opacity: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: 1 }, isHDR: { value: 0 }, uvRect: { value: new THREE.Vector4(0, 0, 1, 1) }, solid: { value: 0 } });
    this.quadOver = quadMaterial(QUAD_FRAG, uni(), 'over');
    this.quadAdd = quadMaterial(QUAD_FRAG, uni(), 'add');
    this.pixels = new Uint8Array(W * H * 4);
  }

  rt(w = W, h = H, opts = {}) {
    return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...opts });
  }

  clear(target, c = [0, 0, 0], a = 1) {
    const r = this.renderer;
    r.setRenderTarget(target);
    r.setClearColor(new THREE.Color(c[0], c[1], c[2]), a);
    r.clear(true, target ? target.depthBuffer : false, false);
  }

  pass(material, target) {
    this.fullMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fullScene, this.cam);
  }

  // corners: [TL, TR, BL, BR], each [x, y] or [x, y, w]
  quad(target, tex, corners, { opacity = 1, tint = [1, 1, 1], gain = 1, add = false, hdr = false, uvRect = null, solid = false } = {}) {
    if (opacity <= 0) return;
    const m = add ? this.quadAdd : this.quadOver, u = m.uniforms;
    corners.forEach((c, i) => u.P.value[i].set(c[0], c[1], c[2] ?? 1));
    u.map.value = tex; u.opacity.value = opacity; u.tint.value.set(tint[0], tint[1], tint[2]); u.gain.value = gain; u.isHDR.value = hdr ? 1 : 0; u.solid.value = solid ? 1 : 0;
    if (uvRect) u.uvRect.value.set(uvRect[0], uvRect[1], uvRect[2], uvRect[3]); else u.uvRect.value.set(0, 0, 1, 1);
    this.quadMesh.material = m;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.cam);
  }

  readPixels() {
    this.renderer.setRenderTarget(null);
    this.gl.readPixels(0, 0, W, H, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.pixels);
    return this.pixels;
  }
}

// Corners of a W x H card centred at (cx, cy), rotated rz degrees, with optional tilt and perspective.
export function card(cx, cy, w, h, { rz = 0, rx = 0, ry = 0, scale = 1, persp = 1600 } = {}) {
  const a = rz * Math.PI / 180, b = rx * Math.PI / 180, c = ry * Math.PI / 180;
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => {
    let x = sx * w / 2 * scale, y = sy * h / 2 * scale, z = 0;
    let z1 = -x * Math.sin(c); x = x * Math.cos(c);                         // ry
    let y1 = y * Math.cos(b) - z1 * Math.sin(b); z = y * Math.sin(b) + z1 * Math.cos(b); // rx
    const px = x * Math.cos(a) - y1 * Math.sin(a), py = x * Math.sin(a) + y1 * Math.cos(a); // rz
    const k = persp / (persp + z);
    return [cx + px * k, cy + py * k, 1 / k];
  }).map(([x, y, invk]) => [x, y, invk]);
}

export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false; t.premultiplyAlpha = true; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

// One line of text as a texture; returns {tex, w, h}
const textCache = new Map();
export function textTex(str, { size = 50, weight = 500, color = '#fff', spacing = 0, shadow = null, pad = 12 } = {}) {
  const key = JSON.stringify([str, size, weight, color, spacing, shadow]);
  if (textCache.has(key)) return textCache.get(key);
  const font = `${weight} ${size}px "Noto Sans SC"`;
  const [, mctx] = makeCanvas(4, 4);
  mctx.font = font; mctx.letterSpacing = `${spacing}px`;
  const m = mctx.measureText(str);
  const shadowPad = shadow ? shadow.blur + Math.abs(shadow.y || 0) : 0;
  const w = Math.ceil(m.width) + 2 * (pad + shadowPad), h = Math.ceil(size * 1.5) + 2 * shadowPad;
  const [c, ctx] = makeCanvas(w, h);
  ctx.font = font; ctx.letterSpacing = `${spacing}px`; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  if (shadow) { ctx.shadowColor = shadow.color; ctx.shadowBlur = shadow.blur; ctx.shadowOffsetY = shadow.y || 0; }
  ctx.fillText(str, pad + shadowPad, h / 2 + size * 0.04);
  const out = { tex: canvasTexture(c), w, h };
  textCache.set(key, out);
  return out;
}

// Person: colour + alpha frames decoded per source frame.
export class PersonFrames {
  constructor(base, fps = 30) {
    this.base = base; this.fps = fps; this.cur = -1;
    const mk = () => { const t = new THREE.Texture(); t.flipY = false; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
    this.fg = mk(); this.alpha = mk();
  }

  async load(n) {
    if (n === this.cur) return;
    const name = String(n).padStart(6, '0') + '.jpg';
    const get = async (d) => createImageBitmap(await (await fetch(`${this.base}/${d}/${name}`)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const [a, b] = await Promise.all([get('fg'), get('alpha')]);
    this.fg.image?.close?.(); this.alpha.image?.close?.();
    this.fg.image = a; this.alpha.image = b;
    this.fg.needsUpdate = true; this.alpha.needsUpdate = true;
    this.cur = n;
  }
}

export const PERSON_FRAG = `
uniform sampler2D fg, al;
uniform vec3 xf;                // zoom, centre x, centre y (pixels)
uniform vec2 shift;
uniform vec3 ambient;           // light on the person
uniform vec3 glowCol; uniform vec2 glowPos; uniform float glowR;   // a soft local light, e.g. a laptop screen
uniform vec3 rimCol; uniform vec2 rimDir; uniform float rimWidth;
uniform vec4 eyes; uniform float lensR; uniform vec3 lensCol; uniform float lensFlick;
float alphaAt(vec2 s){ return texture(al, s/vec2(W,H)).r; }
void main(){
  vec2 p = vec2(vUv.x*W, (1.-vUv.y)*H);
  vec2 s = (p-xf.yz)/xf.x + xf.yz - shift;
  if (s.x<0.||s.y<0.||s.x>W||s.y>H) { outColor = vec4(0.); return; }
  float a = alphaAt(s);
  if (a < 0.002) { outColor = vec4(0.); return; }
  vec3 c = toLinear(texture(fg, s/vec2(W,H)).rgb);
  float d = length((s-glowPos)/glowR);
  vec3 light = ambient + glowCol*exp(-d*d);
  vec3 col = c*light;
  // Rim: lit where the silhouette faces the light.
  if (dot(rimCol,rimCol) > 1e-5) {
    float inner = 0.;
    inner += alphaAt(s+rimDir*rimWidth);
    inner += alphaAt(s+rimDir*rimWidth*.55);
    inner += alphaAt(s+vec2(-rimDir.y,rimDir.x)*rimWidth*.7);
    inner += alphaAt(s+vec2(rimDir.y,-rimDir.x)*rimWidth*.7);
    float edge = clamp(1.-inner*.25, 0., 1.);
    col += rimCol*edge*edge*(1.-smoothstep(.01,.10,luma(c)));
  }
  // Screen reflected in the lenses.
  if (lensR > 0.) {
    for (int i=0;i<2;i++) {
      vec2 e = i==0 ? eyes.xy : eyes.zw;
      vec2 q = (s-e)/vec2(lensR, lensR*.8);
      float mask = 1.-smoothstep(.70, .98, length(q));
      vec2 r = q-vec2(i==0?-.18:.18, .34);
      r.y += r.x*(i==0?.12:-.12);
      float rect = smoothstep(.16,.0,abs(r.x)-.42)*smoothstep(.12,.0,abs(r.y)-.20);
      col += lensCol*mask*(rect*.13 + .012)*lensFlick;
    }
  }
  outColor = vec4(col*a, a);
}`;

export const BLUR_FRAG = `
uniform sampler2D src; uniform vec2 dir;
void main(){
  vec4 s = texture(src, vUv)*.227027;
  s += (texture(src, vUv+dir*1.3846)+texture(src, vUv-dir*1.3846))*.316216;
  s += (texture(src, vUv+dir*3.2308)+texture(src, vUv-dir*3.2308))*.070270;
  outColor = s;
}`;

export const BRIGHT_FRAG = `
uniform sampler2D src; uniform float thresh;
void main(){ vec3 c = texture(src, vUv).rgb; float l = luma(c); float k = smoothstep(thresh, thresh*1.6, l); outColor = vec4(min(c,vec3(8.))*k, 1.); }`;

export const COPY_FRAG = `uniform sampler2D src; uniform float gain; void main(){ outColor = vec4(texture(src, vUv).rgb*gain, 1.); }`;

// Radial light shafts from an emitter mask.
export const RAYS_FRAG = `
uniform sampler2D mask; uniform vec2 center; uniform float density, decay, gain; uniform float time;
void main(){
  vec2 d = (vUv-center)*density/96.;
  vec2 uv = vUv; vec3 acc = vec3(0.); float w = 1.;
  for (int i=0;i<96;i++){ uv -= d; acc += texture(mask, uv).rgb*w; w *= decay; }
  float haze = .7 + .5*fbm(vUv*vec2(2.5,4.)+vec2(time*.04,-time*.02));
  outColor = vec4(acc/96.*gain*haze, 1.);
}`;

export const FINAL_FRAG = `
uniform sampler2D src; uniform float grain, frameNo, vignette, aberr, fade, lift;
void main(){
  vec2 uv = vUv; vec2 c = uv-.5;
  vec3 col;
  if (aberr > .0001) {
    vec2 o = c*aberr;
    col = vec3(texture(src, uv+o).r, texture(src, uv).g, texture(src, uv-o).b);
  } else col = texture(src, uv).rgb;
  float v = 1.-vignette*smoothstep(.35,.95,length(c*vec2(1.,1.25)));
  col *= v*fade;
  // keep everything up to .8 untouched so real footage stays faithful, roll off HDR highlights above that
  col = mix(col, .8+.2*(1.-exp(-(col-.8)/.2)), step(.8,col));
  col = toSRGB(col);
  float n = h21(gl_FragCoord.xy*.73+frameNo*.137)-.5;
  col += n*grain*(1.-.5*luma(col));
  outColor = vec4(col+lift, 1.);
}`;
