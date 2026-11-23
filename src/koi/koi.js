import * as THREE from 'three';
import { createKoiGeometry } from './koiGeometry.js';
import { createKoiMaterial } from './koiMaterial.js';
import { pondSDF, pondGradient, terrainHeight } from '../scene/pond.js';
import { makeRng } from '../util/rng.js';
import { config } from '../config.js';

// variety mix — weighted towards the reds/oranges/whites seen in the reference
const VARIETY_POOL = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 6, 7, 8];

/**
 * Koi school: boids (separation / alignment / cohesion) + wander + shore & obstacle avoidance,
 * depth preference, speed bursts and occasional surfacing that drops rings into the ripple buffer.
 */
export class KoiSchool {
  constructor(count, obstacles, ripples) {
    this.rng = makeRng(4242);
    this.obstacles = obstacles;
    this.ripples = ripples;
    this.count = count;
    const geo = createKoiGeometry();
    const { mat, depth } = createKoiMaterial();
    this.aSwim = new Float32Array(count * 4);
    this.aKoi = new Float32Array(count * 4);
    geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(this.aSwim, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aKoi', new THREE.InstancedBufferAttribute(this.aKoi, 4));
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.customDepthMaterial = depth;
    this.fish = [];
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      let x, z;
      do { x = r.range(-1.0, 2.4); z = r.range(0.8, 5.0); } while (pondSDF(x, z) > -0.6);
      const len = r.range(0.48, 0.82) * (i < 5 ? 1.15 : 1);
      const yaw = r() * Math.PI * 2;
      const type = VARIETY_POOL[i % VARIETY_POOL.length];
      const f = {
        pos: new THREE.Vector3(x, r.range(-0.55, -0.15), z),
        dir: new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)),
        speed: r.range(0.1, 0.2), target: r.range(0.1, 0.22), len, yaw, yawRate: 0, bend: 0,
        phase: r() * 10, fin: r() * 10, amp: 0.5, wander: r() * Math.PI * 2, depth: r.range(-0.6, -0.14),
        burst: 0, home: new THREE.Vector2(r.range(-0.9, 1.9), r.range(1.4, 4.6)), surf: 0, gulp: 0,
        vy: 0,
      };
      this.fish.push(f);
      this.aKoi.set([type, r() * 10, 0, 0], i * 4);
    }
    this.surfaceTimer = 3;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YZX');
    this._s = new THREE.Vector3();
    this.update(0.016);
  }

  update(dt) {
    dt = Math.min(dt, 0.05) * config.koi.speed;
    const F = this.fish, n = F.length, r = this.rng;
    // occasionally send a fish to the surface
    this.surfaceTimer -= dt;
    if (this.surfaceTimer <= 0) {
      this.surfaceTimer = r.range(4, 9);
      const f = F[Math.floor(r() * n)];
      if (f.surf <= 0) { f.surf = r.range(3.0, 4.5); f.gulp = 0; }
    }
    const steer = new THREE.Vector3(), sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const f = F[i];
      steer.set(0, 0, 0); sep.set(0, 0, 0); ali.set(0, 0, 0); coh.set(0, 0, 0);
      let na = 0, nc = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const g = F[j];
        const dx = f.pos.x - g.pos.x, dz = f.pos.z - g.pos.z, dy = f.pos.y - g.pos.y;
        const d2 = dx * dx + dz * dz + dy * dy * 4;
        const sepR = (f.len + g.len) * 0.55;
        if (d2 < sepR * sepR) { const d = Math.sqrt(d2) + 1e-3; sep.x += dx / d * (sepR - d) / sepR; sep.z += dz / d * (sepR - d) / sepR; }
        if (d2 < 1.6 * 1.6) { ali.add(g.dir); na++; }
        if (d2 < 2.2 * 2.2) { coh.x += g.pos.x; coh.z += g.pos.z; nc++; }
      }
      steer.addScaledVector(sep, 2.2);
      if (na) steer.addScaledVector(ali.multiplyScalar(1 / na).sub(f.dir), 0.35);
      if (nc) { coh.multiplyScalar(1 / nc); steer.x += (coh.x - f.pos.x) * 0.08; steer.z += (coh.z - f.pos.z) * 0.08; }
      // wander
      f.wander += r.gauss() * dt * 1.4;
      steer.x += Math.cos(f.wander) * 0.35; steer.z += Math.sin(f.wander) * 0.35;
      // home attraction (keeps the school in view, near the camera)
      const hx = f.home.x - f.pos.x, hz = f.home.y - f.pos.z, hd = Math.hypot(hx, hz);
      if (hd > 1.2) { steer.x += hx / hd * 0.25 * (hd - 1.2); steer.z += hz / hd * 0.25 * (hd - 1.2); }
      if (r() < dt * 0.05) f.home.set(r.range(-0.9, 2.2), r.range(1.0, 4.8));
      // shore avoidance (look ahead)
      const look = 0.5 + f.speed * 2.0;
      const lx = f.pos.x + f.dir.x * look, lz = f.pos.z + f.dir.z * look;
      const sdA = pondSDF(lx, lz), sdH = pondSDF(f.pos.x, f.pos.z);
      for (const [sd, px, pz] of [[sdA, lx, lz], [sdH, f.pos.x, f.pos.z]]) {
        if (sd > -0.75) {
          const [gx, gz] = pondGradient(px, pz);
          const k = Math.min(4, (sd + 0.75) * 5.0);
          steer.x -= gx * k; steer.z -= gz * k;
        }
      }
      // obstacles (bridge pier, landing rocks)
      for (const o of this.obstacles) {
        const dx = lx - o.x, dz = lz - o.z, d = Math.hypot(dx, dz);
        const R = o.r + 0.35;
        if (d < R) { steer.x += dx / (d + 1e-3) * (R - d) * 4; steer.z += dz / (d + 1e-3) * (R - d) * 4; }
      }
      // speed: cruise, glide, burst
      if (f.burst > 0) { f.burst -= dt; f.target = 0.55; }
      else if (r() < dt * 0.04) { f.burst = r.range(0.8, 1.8); }
      else if (r() < dt * 0.15) { f.target = r() < 0.3 ? r.range(0.05, 0.09) : r.range(0.11, 0.24); }
      if (f.surf > 0) f.target = Math.min(f.target, 0.12);
      const prevSpeed = f.speed;
      f.speed += (f.target - f.speed) * Math.min(1, dt * (f.burst > 0 ? 2.5 : 0.8));
      const accel = (f.speed - prevSpeed) / Math.max(dt, 1e-3);
      // heading: turn towards the steering direction with a limited turn rate
      tmp.set(f.dir.x + steer.x * 0.5, 0, f.dir.z + steer.z * 0.5);
      const desiredYaw = Math.atan2(tmp.z, tmp.x);
      let dy = desiredYaw - f.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const maxTurn = (f.burst > 0 ? 2.2 : 1.1) * dt;
      const turn = THREE.MathUtils.clamp(dy, -maxTurn, maxTurn) * Math.min(1, 0.4 + Math.abs(dy));
      f.yawRate += (turn / Math.max(dt, 1e-3) - f.yawRate) * Math.min(1, dt * 5);
      f.yaw += f.yawRate * dt;
      f.dir.set(Math.cos(f.yaw), 0, Math.sin(f.yaw));
      // depth
      let targetDepth = f.depth;
      if (f.surf > 0) {
        f.surf -= dt;
        const surfDepth = -0.075 * f.len - 0.012;
        targetDepth = f.surf > 0.9 ? surfDepth : f.depth;
        if (f.pos.y > surfDepth - 0.03 && f.surf > 0.9) {
          f.gulp -= dt;
          if (f.gulp <= 0) {
            f.gulp = r.range(0.35, 0.6);
            const hx2 = f.pos.x + f.dir.x * f.len * 0.45, hz2 = f.pos.z + f.dir.z * f.len * 0.45;
            this.ripples?.addDrop(hx2, hz2, 0.05 + f.len * 0.04, 0.012 + f.len * 0.01);
          }
        }
      } else if (r() < dt * 0.03) f.depth = r.range(-0.65, -0.12);
      const floor = terrainHeight(f.pos.x, f.pos.z) + 0.1 + f.len * 0.12;
      targetDepth = Math.max(targetDepth, floor);
      f.vy += ((targetDepth - f.pos.y) * 0.8 - f.vy) * Math.min(1, dt * 1.5);
      f.pos.y += f.vy * dt;
      f.pos.y = Math.min(f.pos.y, -0.065 * f.len - 0.01);
      f.pos.x += f.dir.x * f.speed * dt;
      f.pos.z += f.dir.z * f.speed * dt;
      // hard safety: never leave the water
      const sdNow = pondSDF(f.pos.x, f.pos.z);
      if (sdNow > -0.25) { const [gx, gz] = pondGradient(f.pos.x, f.pos.z); f.pos.x -= gx * (sdNow + 0.25); f.pos.z -= gz * (sdNow + 0.25); }
      // swimming animation parameters
      const freq = 1.6 + f.speed * 11.0 / Math.sqrt(f.len);
      f.phase += dt * freq * Math.PI * 2 * 0.5;
      f.fin += dt * (2.0 + (0.3 - Math.min(0.3, f.speed)) * 8.0);
      const ampT = 0.35 + f.speed * 2.6 + Math.max(0, accel) * 0.9;
      f.amp += (Math.min(1.6, ampT) - f.amp) * Math.min(1, dt * 3);
      f.bend += (-f.yawRate * 0.55 - f.bend) * Math.min(1, dt * 4);
      this.aSwim.set([f.phase, f.amp, THREE.MathUtils.clamp(f.bend, -0.9, 0.9), f.fin], i * 4);
      // matrix
      const pitch = THREE.MathUtils.clamp(f.vy / Math.max(f.speed, 0.05), -0.5, 0.5) * 0.6 + (f.surf > 0.9 ? 0.12 : 0);
      this._e.set(0, -f.yaw, pitch);
      this._q.setFromEuler(this._e);
      this._m.compose(f.pos, this._q, this._s.setScalar(f.len));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aSwim.needsUpdate = true;
  }
}
