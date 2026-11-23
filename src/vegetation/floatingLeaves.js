import * as THREE from 'three';
import { fallenLeafTexture } from './leafTextures.js';
import { pondSDF, pondGradient } from '../scene/pond.js';
import { makeRng } from '../util/rng.js';

/** A few fallen leaves drifting slowly on the surface. */
export class FloatingLeaves {
  constructor(count = 12) {
    const rng = makeRng(99);
    const g = new THREE.PlaneGeometry(1, 1, 2, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, x * x * 0.25); }
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: fallenLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(g, mat, count);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.leaves = [];
    const tint = new THREE.Color();
    for (let i = 0; i < count; i++) {
      let x, z;
      do { x = rng.range(-1, 5); z = rng.range(-1, 5.5); } while (pondSDF(x, z) > -0.3);
      this.leaves.push({ x, z, rot: rng() * 6.28, spin: rng.range(-0.08, 0.08), s: rng.range(0.07, 0.12), ph: rng() * 10 });
      tint.setHSL(rng.range(0.06, 0.12), rng.range(0.5, 0.8), rng.range(0.35, 0.6));
      this.mesh.setColorAt(i, tint);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.leaves.forEach((l, i) => {
      // slow swirling surface current
      const vx = 0.012 * Math.sin(l.z * 0.7 + t * 0.05 + l.ph) + 0.006;
      const vz = 0.012 * Math.cos(l.x * 0.6 - t * 0.04 + l.ph) - 0.004;
      l.x += vx * dt; l.z += vz * dt;
      const sd = pondSDF(l.x, l.z);
      if (sd > -0.2) { const [gx, gz] = pondGradient(l.x, l.z); l.x -= gx * 0.01; l.z -= gz * 0.01; }
      l.rot += l.spin * dt;
      this._q.setFromAxisAngle(this._v.set(0, 1, 0), l.rot);
      const bob = Math.sin(t * 1.3 + l.ph) * 0.002;
      this._m.compose(this._v.set(l.x, 0.006 + bob, l.z), this._q, this._s.set(l.s, l.s, l.s * 1.4));
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
