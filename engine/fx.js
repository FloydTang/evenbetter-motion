// Reusable full-frame looks. Each is a fragment shader driven only by uniforms.
import { THREE, fullMaterial } from './core.js';

const u = (v) => ({ value: v });

export const makeSilk = () => fullMaterial(`
uniform float time; uniform vec3 base;
// Long soft folds, not bumps: a few stretched waves bent by slow noise.
float h(vec2 q, float t){
  float bend = 1.5*(vnoise(vec2(q.y*.55, t*.5))-.5)+.8*(vnoise(vec2(q.y*.2+7., t*.3))-.5);
  float x = q.x+bend;
  return .55*sin(x*2.3+t*.3)+.3*sin(x*4.1+1.3+q.y*.25)+.13*sin(x*8.3+q.y*.4+2.)+.04*sin(x*19.+q.y*.9);
}
void main(){
  vec2 uv = vUv*vec2(.5625,1.)*2.6;
  uv = mat2(.86,-.51,.51,.86)*uv;
  float t = time*.22;
  float e = .004, n = h(uv,t);
  vec3 N = normalize(vec3(-(h(uv+vec2(e,0.),t)-n)/e*.62, -(h(uv+vec2(0.,e),t)-n)/e*.62, 1.));
  vec3 L = normalize(vec3(-.4,.55,.74)), V = vec3(0.,0.,1.), H_ = normalize(L+V);
  float diff = max(dot(N,L),0.), spec = pow(max(dot(N,H_),0.),18.);
  // Silk: bright where a fold faces the light, a warm soft shadow elsewhere, no hard glints.
  vec3 col = base*(.2+1.02*diff*diff) + vec3(1.,.95,.86)*spec*.34;
  col *= .992+.008*sin(vUv.x*1800.)*sin(vUv.y*3200.);
  outColor = vec4(col, 1.);
}`, { time: u(0), base: u(new THREE.Vector3(.86, .72, .54)) });

export const makeRoad = () => fullMaterial(`
uniform float travel, horizon, dawn, width, reveal;
void main(){
  vec2 p = vec2(vUv.x*W, (1.-vUv.y)*H);
  float y = p.y-horizon;
  vec3 skyTop = mix(vec3(.004,.006,.012), vec3(.05,.07,.13), dawn);
  vec3 skyLow = mix(vec3(.02,.034,.06), vec3(1.0,.62,.34), dawn);
  float sk = exp(min(y,0.)/ (260.+dawn*220.));
  vec3 col = mix(skyTop, skyLow, sk);
  float gl = exp(-pow((p.x-540.)/(300.+dawn*260.),2.))*exp(min(y,0.)/70.);
  col += vec3(.5,.66,.95)*gl*mix(.32,.0,dawn) + vec3(1.,.74,.45)*gl*dawn*1.5;
  if (y > 0.) {
    float z = 300./max(y,1.);
    float x = (p.x-540.)*z/300.;
    float tz = z+travel;
    float grit = .75+.5*fbm(vec2(x*5., tz*2.5));
    vec3 ground = vec3(.006,.008,.012)*grit;
    float road = 1.-smoothstep(width-.02*z, width+.02*z, abs(x));
    vec3 asphalt = vec3(.022,.026,.034)*grit;
    col = mix(ground, asphalt, road);
    float edge = smoothstep(.022*z+.008,.0,abs(abs(x)-width*.94));
    float lanes = abs(abs(x)-width*.5);
    float dash = smoothstep(.016*z+.006,.0,lanes)*step(.45,fract(tz*.55));
    vec3 lineCol = mix(vec3(.5,.68,1.), vec3(1.,.8,.55), dawn);
    float fade = exp(-z*.11);
    float shoulder = smoothstep(.02*z+.008,.0,abs(abs(x)-width*1.16))*step(.5,fract(tz*.9));
    col += lineCol*(edge*.8+dash*1.3+shoulder*.9)*(.25+1.2*fade);
    col *= .25+1.1*exp(-z*.075);
    col += mix(vec3(.02,.03,.05),vec3(.55,.32,.16),dawn)*exp(-y/120.)*exp(-pow((p.x-540.)/460.,2.))*.7;
  }
  // Road lights in a row on both sides, sliding towards the camera.
  for (int side=0; side<2; side++) {
    float sgn = side==0 ? -1. : 1.;
    for (int i=0; i<9; i++) {
      float zz = mod(float(i)*1.05-travel*.7, 9.45)+.28;
      float sy = horizon+300./zz*.82, sx = 540.+sgn*(width*1.32)*300./zz;
      float top = horizon+300./zz*(.82-1.25);
      vec2 d = (p-vec2(sx,top))*zz;
      float r = 7.+zz*.8;
      col += mix(vec3(.62,.8,1.),vec3(1.,.82,.58),dawn)*exp(-dot(d,d)/(r*r))*(1.9*exp(-zz*.12));
      float pole = smoothstep(2.2/zz+.6,.0,abs(p.x-sx))*step(top,p.y)*step(p.y,sy);
      col = mix(col, vec3(.012,.014,.018), pole*.9);
    }
  }
  outColor = vec4(col*reveal, reveal);
}`, { travel: u(0), horizon: u(620), dawn: u(0), width: u(1.1), reveal: u(1) }, 'over');

export const makeSky = () => fullMaterial(`
uniform float time, zoom, sun;
void main(){
  vec2 uv = (vUv-vec2(.5,.62))/zoom*vec2(.5625,1.)+vec2(.5,.62);
  float t = time*.012;
  float n = fbm(uv*vec2(2.2,3.6)+vec2(t,0.)+.5*fbm(uv*5.+vec2(0.,t)));
  float c = smoothstep(.42,.74,n);
  vec3 top = vec3(.11,.3,.72), low = vec3(.62,.8,.98);
  vec3 sky = mix(low, top, smoothstep(.1,1.,vUv.y));
  vec3 col = mix(sky, vec3(1.,.99,.97)*(.84+.3*n), c*.92);
  col += vec3(1.,.92,.8)*sun*exp(-length((vUv-vec2(.72,.86))*vec2(.5625,1.))*5.)*.7;
  outColor = vec4(col, 1.);
}`, { time: u(0), zoom: u(1), sun: u(1) });

// Rounded corner mask for the eyelid blink, drawn over everything.
export const makeLids = () => fullMaterial(`
uniform float close;
void main(){
  vec2 p = vec2(vUv.x-.5, vUv.y-.5);
  float curve = (1.-pow(abs(p.x)*2.,2.))*.09;
  float open = (1.-close)*.62;
  float d = abs(p.y)-(open+curve*(1.-close)+ (close>.98?-.2:0.));
  float a = smoothstep(-.012,.012,d);
  outColor = vec4(vec3(.0)*a, a);
}`, { close: u(0) }, 'over');

export const makeHallWall = () => fullMaterial(`
uniform float time, glow;
void main(){
  vec2 p = vec2(vUv.x*W, (1.-vUv.y)*H);
  float n = .75+.5*fbm(vUv*vec2(9.,16.));
  vec2 q = (p-vec2(540.,520.))/vec2(760.,860.);
  vec3 col = vec3(.0035,.0045,.0065)*n + vec3(.022,.03,.046)*glow*exp(-dot(q,q))*n;
  outColor = vec4(col, 1.);
}`, { time: u(0), glow: u(.4) });
