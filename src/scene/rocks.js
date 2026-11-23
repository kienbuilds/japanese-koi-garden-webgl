import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, fbm3 } from '../util/rng.js';
import { POLY, pondSDF, terrainHeight } from './pond.js';
import { stoneMaterial } from './stone.js';

export function rockGeometry(seed, detail = 4, rough = 1.0) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const o = seed * 13.37;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm3(v.x * 1.2 + o, v.y * 1.2, v.z * 1.2 - o, 5);
    const ridge = Math.abs(fbm3(v.x * 2.7 - o, v.y * 2.7 + o, v.z * 2.7, 3));
    let r = 1 + 0.5 * n * rough - 0.22 * ridge * rough;
    // flatten bottom & slightly flatter top (garden stones are set with their flat face up)
    if (v.y < -0.2) r *= 1 - (Math.min(1, (-v.y - 0.2) * 1.4)) * 0.45;
    if (v.y > 0.55) r *= 1 - (v.y - 0.55) * 0.35;
    v.multiplyScalar(r);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Bank rocks along the pond outline + the rocky landing for the bridge. */
export function createRocks() {
  const rng = makeRng(77);
  const geos = [];
  const obstacles = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  const place = (x, y, z, sx, sy, sz, yaw, seed, detail = 3) => {
    const g = rockGeometry(seed, detail, 1.0);
    q.setFromEuler(new THREE.Euler(rng.range(-0.15, 0.15), yaw, rng.range(-0.15, 0.15)));
    m.compose(t.set(x, y, z), q, s.set(sx, sy, sz));
    g.applyMatrix4(m);
    geos.push(g);
  };

  // walk the outline
  let acc = 0;
  for (let i = 0; i < POLY.length; i++) {
    const [ax, az] = POLY[i], [bx, bz] = POLY[(i + 1) % POLY.length];
    const seg = Math.hypot(bx - ax, bz - az);
    acc += seg;
    const spacing = 0.42 + rng() * 0.35;
    if (acc < spacing) continue;
    acc = 0;
    if (az > 8.5) continue; // behind the camera
    const tx = (bx - ax) / seg, tz = (bz - az) / seg;
    // outward normal (polygon is clockwise in XZ-from-above => outward = (tz,-tx) or opposite)
    let nx = tz, nz = -tx;
    if (pondSDF(ax + nx * 0.3, az + nz * 0.3) < 0) { nx = -nx; nz = -nz; }
    const leftBank = ax < -1.4 && az > 1.4; // azalea bank: fewer, smaller stones
    if (leftBank && rng() < 0.15) continue;
    const big = !leftBank && rng() < 0.3;
    const r = big ? rng.range(0.38, 0.6) : rng.range(0.18, 0.34);
    const off = rng.range(-0.05, 0.12);
    const x = ax + nx * off, z = az + nz * off;
    const yaw = Math.atan2(-tz, tx) + rng.range(-0.4, 0.4);
    place(x, rng.range(-0.06, 0.04) + r * 0.15, z, r * rng.range(1.1, 1.6), r * rng.range(0.55, 0.8), r, yaw, i * 3.1 + 1, big ? 4 : 3);
    // a second smaller stone tucked behind sometimes
    if (rng() < 0.4) {
      const r2 = r * rng.range(0.5, 0.8);
      place(x + nx * r * 1.1 + tx * rng.range(-0.3, 0.3), terrainHeight(x + nx * r, z + nz * r) + r2 * 0.2,
        z + nz * r * 1.1 + tz * rng.range(-0.3, 0.3), r2 * 1.3, r2 * 0.7, r2, yaw + 1, i * 7.7 + 2, 3);
    }
  }

  // Bridge landing (center of the garden) — big flat stones forming a little peninsula.
  const landing = [
    [0.75, -0.62, 0.62, 0.34, 0.5, 0.3], [1.45, -0.95, 0.5, 0.3, 0.42, 1.2], [0.15, -1.05, 0.48, 0.26, 0.42, 2.2],
    [1.05, -0.3, 0.32, 0.2, 0.28, 0.7], [2.05, -1.2, 0.42, 0.32, 0.38, 2.9], [-0.55, -1.35, 0.36, 0.22, 0.34, 0.4],
  ];
  for (const [x, z, sx, sy, sz, yaw] of landing) {
    place(x, sy * 0.35, z, sx, sy, sz, yaw, x * 10 + z, 4);
    obstacles.push({ x, z, r: Math.max(sx, sz) * 1.05 });
  }
  // left landing under the bridge start
  place(-3.15, 0.18, 0.95, 0.55, 0.3, 0.45, 0.4, 91, 4);
  place(-2.75, 0.06, 1.35, 0.34, 0.22, 0.3, 1.4, 92, 3);
  // large flat rocks at the right edge (as in the reference)
  place(5.6, 0.12, 0.85, 0.85, 0.32, 0.6, -0.5, 93, 4);
  place(6.4, 0.2, 2.0, 0.8, 0.42, 0.7, 0.3, 94, 4);
  place(4.7, 0.05, -0.15, 0.6, 0.28, 0.45, -0.2, 95, 4);
  // a stepping-stone island in the water on the right
  place(3.6, -0.02, 0.55, 0.42, 0.2, 0.32, 0.9, 96, 4);
  obstacles.push({ x: 3.6, z: 0.55, r: 0.5 });

  const geo = mergeGeometries(geos);
  const mesh = new THREE.Mesh(geo, stoneMaterial({ moss: 0.95, tone: 0.95, key: 'rocks' }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, obstacles };
}
