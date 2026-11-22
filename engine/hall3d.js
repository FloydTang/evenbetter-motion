// A stand-in factory floor until real footage is in: conveyors, machines and ceiling lights in real 3D.
// Any scene using it should also show the 示意 marker.
import { THREE, hash } from './core.js';

export class FactoryHall {
  constructor(stage, { warm = true } = {}) {
    this.stage = stage;
    this.rt = stage.rt(540, 960, { depthBuffer: true, samples: 4 });
    const sc = this.scene = new THREE.Scene();
    const fog = warm ? 0x0b0704 : 0x05070b;
    sc.fog = new THREE.FogExp2(fog, .052);
    this.bg = new THREE.Color(fog);
    this.cam = new THREE.PerspectiveCamera(58, 540 / 960, .1, 90);
    sc.add(new THREE.HemisphereLight(0xffe2c0, 0x20140c, warm ? .65 : .4));
    const lc = warm ? 0xffd0a0 : 0xcfe2ff;
    for (let i = 0; i < 9; i++) {
      const l = new THREE.PointLight(lc, 34, 26, 1.6);
      l.position.set(0, 6.2, -i * 7);
      sc.add(l);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 160), new THREE.MeshStandardMaterial({ color: 0x3a342d, roughness: .34, metalness: .25 }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -60; sc.add(floor);
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.9, 2.2) });
    for (const x of [-3.4, 0, 3.4]) for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(.32, .06, 2.6), strip);
      m.position.set(x, 7, -i * 5); sc.add(m);
    }
    const belt = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: .55 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x5f6a70, roughness: .4, metalness: .6 });
    for (const x of [-1.7, 1.7]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, .12, 150), belt); b.position.set(x, .92, -60); sc.add(b);
      for (const dx of [-.62, .62]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.08, .12, 150), frame); r.position.set(x + dx, 1.0, -60); sc.add(r); }
      for (let i = 0; i < 40; i++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.08, .92, .08), frame); leg.position.set(x + (i % 2 ? .5 : -.5), .46, -i * 4); sc.add(leg); }
    }
    const body = new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness: .46, metalness: .55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: .6, metalness: .4 });
    const lampA = new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, 2.2, .7) });
    const lampB = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.3, .2) });
    for (const side of [-1, 1]) for (let i = 0; i < 18; i++) {
      const h = 2.2 + hash(i * 2.3 + side) * 1.6, x = side * (5.1 + hash(i + 3) * .5), z = -3 - i * 6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, h, 4), body); m.position.set(x, h / 2, z); sc.add(m);
      const t = new THREE.Mesh(new THREE.BoxGeometry(2.8, .3, 4.2), dark); t.position.set(x, h + .15, z); sc.add(t);
      const p = new THREE.Mesh(new THREE.BoxGeometry(.04, .5, .9), dark); p.position.set(x - side * 1.32, h * .6, z + 1); sc.add(p);
      const la = new THREE.Mesh(new THREE.BoxGeometry(.05, .09, .09), i % 3 ? lampA : lampB); la.position.set(x - side * 1.34, h * .6 + .34, z + 1.3); sc.add(la);
    }
    // Goods riding the conveyors.
    const goodsMat = new THREE.MeshStandardMaterial({ color: 0xcdb48c, roughness: .8 });
    this.goods = new THREE.InstancedMesh(new THREE.BoxGeometry(.62, .34, .62), goodsMat, 120);
    this.goods.frustumCulled = false; sc.add(this.goods);
    this.tmp = new THREE.Object3D();
  }

  render(t, { dolly = 0 } = {}) {
    const r = this.stage.renderer;
    this.cam.position.set(0, 2.3, 3 - dolly);
    this.cam.lookAt(0, 2.05, -30 - dolly);
    for (let i = 0; i < 120; i++) {
      const side = i % 2 ? -1.7 : 1.7, speed = 1.5;
      const z = -((i * 2.3 + t * speed * (i % 2 ? 1 : -1)) % 130 + 130) % 130 + 6;
      this.tmp.position.set(side, 1.16, z); this.tmp.updateMatrix(); this.goods.setMatrixAt(i, this.tmp.matrix);
    }
    this.goods.instanceMatrix.needsUpdate = true;
    r.setRenderTarget(this.rt); r.setClearColor(this.bg, 1); r.clear(true, true, false);
    r.render(this.scene, this.cam);
    return this.rt;
  }
}
