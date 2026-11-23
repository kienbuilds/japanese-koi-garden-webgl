import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stoneMaterial } from './stone.js';
import { rockGeometry } from './rocks.js';
import { terrainHeight } from './pond.js';
import { patchMaterial } from '../util/patch.js';

// ---------------------------------------------------------------- bridge
export const BRIDGE = { a: new THREE.Vector2(-3.35, 0.98), b: new THREE.Vector2(0.62, -0.5), width: 0.92, y: 0.4, arch: 0.13 };

export function createBridge() {
  const { a, b, width, y, arch } = BRIDGE;
  const dir = new THREE.Vector2().subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  const side = new THREE.Vector2(-dir.y, dir.x);
  const hw = width / 2;
  // cross-section (lateral, vertical) — deck with a carved raised rim and a chamfered bottom
  const prof = [
    [-hw, -0.17], [-hw, -0.02], [-hw + 0.01, 0.035], [-hw + 0.075, 0.04], [-hw + 0.09, 0.012],
    [-hw + 0.11, 0.0], [hw - 0.11, 0.0], [hw - 0.09, 0.012], [hw - 0.075, 0.04], [hw - 0.01, 0.035], [hw, -0.02],
    [hw, -0.17], [hw - 0.04, -0.2], [-hw + 0.04, -0.2],
  ];
  const N = 48;
  const pos = [], idx = [], uv = [];
  const P = prof.length;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const cx = a.x + dir.x * len * t, cz = a.y + dir.y * len * t;
    const cy = y + arch * (1 - (2 * t - 1) ** 2) + 0.004 * Math.sin(t * 37.0);
    for (let k = 0; k < P; k++) {
      const [l, v] = prof[k];
      pos.push(cx + side.x * l, cy + v, cz + side.y * l);
      uv.push(t * len, k / P);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < P; k++) {
      const a0 = i * P + k, a1 = i * P + ((k + 1) % P), b0 = a0 + P, b1 = a1 + P;
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  const deck = new THREE.Mesh(g, stoneMaterial({ moss: 0.3, tone: 1.6, carved: true, warm: 0.1, key: 'bridge' }));
  deck.castShadow = deck.receiveShadow = true;

  // central pier (mostly under water) + end supports
  const grp = new THREE.Group();
  grp.add(deck);
  const pierMat = stoneMaterial({ moss: 0.6, tone: 0.85, key: 'pier' });
  const mid = new THREE.Vector2().lerpVectors(a, b, 0.5);
  const pierG = rockGeometry(5.5, 3, 0.4);
  const pier = new THREE.Mesh(pierG, pierMat);
  pier.position.set(mid.x, -0.35, mid.y);
  pier.scale.set(0.28, 0.85, 0.5);
  pier.rotation.y = Math.atan2(-dir.y, dir.x) + Math.PI / 2;
  pier.castShadow = pier.receiveShadow = true;
  grp.add(pier);
  return { group: grp, obstacles: [{ x: mid.x, z: mid.y, r: 0.55 }] };
}

// ---------------------------------------------------------------- tōrō (Kasuga-style stone lantern)
export function createToro(x = -0.85, z = -2.75) {
  const gy = terrainHeight(x, z);
  const parts = [];
  const add = (g, py, ry = 0) => { g.rotateY(ry); g.translate(0, py, 0); parts.push(g); };
  const hex = (rt, rb, h, py, seg = 6) => add(new THREE.CylinderGeometry(rt, rb, h, seg, 1), py + h / 2, Math.PI / 6);
  let h = 0;
  hex(0.27, 0.31, 0.1, h); h += 0.1;            // kiso (base)
  hex(0.19, 0.24, 0.07, h); h += 0.07;
  add(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 20), h + 0.02); h += 0.04;
  add(new THREE.CylinderGeometry(0.075, 0.085, 0.62, 20, 6), h + 0.31); // sao (pole)
  add(new THREE.TorusGeometry(0.083, 0.012, 6, 20).rotateX(Math.PI / 2), h + 0.2);
  add(new THREE.TorusGeometry(0.08, 0.012, 6, 20).rotateX(Math.PI / 2), h + 0.42);
  h += 0.62;
  add(new THREE.CylinderGeometry(0.1, 0.08, 0.04, 20), h + 0.02); h += 0.04;
  hex(0.25, 0.13, 0.11, h); h += 0.11;          // chūdai
  hex(0.25, 0.25, 0.025, h); h += 0.025;
  // hibukuro (fire box): six pillars + frames, with two open windows
  const boxH = 0.25, R = 0.17;
  const frame = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const p = new THREE.BoxGeometry(0.05, boxH, 0.05);
    p.rotateY(-ang);
    p.translate(Math.cos(ang) * R, h + boxH / 2, Math.sin(ang) * R);
    frame.push(p);
    const ang2 = ang + Math.PI / 6;
    const w = 2 * R * Math.sin(Math.PI / 6);
    const open = i === 1 || i === 4;
    const bot = new THREE.BoxGeometry(w, open ? 0.05 : boxH, 0.03);
    bot.rotateY(-ang2 + Math.PI / 2);
    const rr = R * Math.cos(Math.PI / 6);
    bot.translate(Math.cos(ang2) * rr, h + (open ? 0.025 : boxH / 2), Math.sin(ang2) * rr);
    frame.push(bot);
    if (open) {
      const top = new THREE.BoxGeometry(w, 0.05, 0.03);
      top.rotateY(-ang2 + Math.PI / 2);
      top.translate(Math.cos(ang2) * rr, h + boxH - 0.025, Math.sin(ang2) * rr);
      frame.push(top);
    }
  }
  parts.push(...frame);
  const core = new THREE.CylinderGeometry(0.1, 0.1, boxH * 0.8, 6); // dark interior
  core.translate(0, h + boxH / 2, 0);
  h += boxH;
  // kasa (roof) with upturned corners
  const roof = new THREE.CylinderGeometry(0.06, 0.44, 0.2, 6, 5);
  const rp = roof.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const vx = rp.getX(i), vy = rp.getY(i), vz = rp.getZ(i);
    const r = Math.hypot(vx, vz);
    const tt = (0.1 - vy) / 0.2; // 0 top .. 1 bottom
    const ang = Math.atan2(vz, vx);
    const corner = Math.pow(Math.abs(Math.cos(ang * 3)), 8);
    let ny = vy - 0.06 * Math.sin(tt * Math.PI) * 0.5; // concave slope
    if (tt > 0.8) ny += corner * 0.06 * (tt - 0.8) * 5;
    const k = 1 + corner * 0.08 * tt;
    rp.setXYZ(i, vx * k, ny, vz * k);
    if (r < 1e-4) rp.setXYZ(i, vx, ny, vz);
  }
  roof.computeVertexNormals();
  roof.rotateY(Math.PI / 6);
  roof.translate(0, h + 0.1, 0);
  parts.push(roof);
  const roofUnder = new THREE.CylinderGeometry(0.42, 0.44, 0.04, 6);
  roofUnder.rotateY(Math.PI / 6); roofUnder.translate(0, h + 0.0, 0);
  parts.push(roofUnder);
  h += 0.2;
  // hōju (jewel) with lotus collar
  add(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 12), h + 0.025); h += 0.05;
  const onion = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = Math.sin(t * Math.PI) * 0.075 * (1 - t * 0.35) + (t > 0.85 ? 0 : 0);
    onion.push(new THREE.Vector2(Math.max(0.001, r), t * 0.17));
  }
  const ho = new THREE.LatheGeometry(onion, 16);
  ho.translate(0, h, 0);
  parts.push(ho);

  const norm = parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; });
  const geo = mergeGeometries(norm);
  geo.computeVertexNormals();
  const mat = stoneMaterial({ moss: 0.75, tone: 0.9, carved: true, key: 'toro' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  const coreMesh = new THREE.Mesh(core, new THREE.MeshStandardMaterial({ color: 0x050504, roughness: 1 }));
  const grp = new THREE.Group();
  grp.add(mesh, coreMesh);
  grp.position.set(x, gy - 0.02, z);
  grp.rotation.y = 0.3;
  grp.scale.setScalar(1.12);
  return grp;
}

// ---------------------------------------------------------------- garden lamp (white globe on a slim post)
export function createLamp(x = -2.05, z = -1.9) {
  const gy = terrainHeight(x, z);
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.55, 10), new THREE.MeshStandardMaterial({ color: 0x1b1b1a, roughness: 0.5, metalness: 0.6 }));
  post.position.y = 0.775;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 0.05, 16), post.material);
  cap.position.y = 1.83;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.35, emissive: 0xfff4dd, emissiveIntensity: 0.25 }));
  globe.position.y = 1.7;
  globe.scale.y = 1.2;
  for (const m of [post, cap, globe]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  g.position.set(x, gy, z);
  return g;
}

// ---------------------------------------------------------------- house (eave, veranda, shoji) — upper left
function woodMaterial(color = [0.23, 0.14, 0.08], axis = 1, key = 'wood') {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  patchMaterial(mat, {
    key: key + axis,
    uniforms: { uWoodC: { value: new THREE.Vector3(...color) }, uAxis: { value: axis } },
    fragPars: 'uniform vec3 uWoodC; uniform float uAxis;',
    fragColor: /* glsl */`
      vec3 p = vWPos;
      vec3 q = uAxis < 0.5 ? p.yzx : (uAxis < 1.5 ? p.xzy : p.xyz);
      float grain = fbm3(vec3(q.x * 40.0, q.y * 40.0, q.z * 1.5));
      float rings = sin((q.x + q.y) * 140.0 + grain * 10.0) * 0.5 + 0.5;
      vec3 c = uWoodC * (0.75 + 0.35 * grain + 0.1 * rings);
      diffuseColor.rgb = c;
    `,
  });
  return mat;
}

function shojiTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e4d6';
  g.fillRect(0, 0, 256, 512);
  // paper fibre
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(${200 + Math.random() * 40},${195 + Math.random() * 40},${170 + Math.random() * 40},0.25)`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 3, 1);
  }
  g.fillStyle = '#4a3322';
  for (let x = 0; x <= 256; x += 64) g.fillRect(x - 3, 0, 6, 512);
  for (let y = 0; y <= 512; y += 56) g.fillRect(0, y - 3, 256, 6);
  g.fillRect(0, 0, 256, 14); g.fillRect(0, 498, 256, 14); g.fillRect(0, 0, 12, 512); g.fillRect(244, 0, 12, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createHouse() {
  const grp = new THREE.Group();
  const darkWood = woodMaterial([0.16, 0.1, 0.06], 1, 'post');
  const beamWood = woodMaterial([0.2, 0.12, 0.07], 2, 'beam');
  const deckWood = woodMaterial([0.3, 0.2, 0.12], 0, 'deck');
  const xEave = -4.55, z0 = -3.5, z1 = 7.0, eaveY = 2.78;
  const addBox = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    return m;
  };
  const deckY = 0.62;
  // posts
  for (let z = -2.8; z <= 6.5; z += 1.82) addBox(0.13, 2.3, 0.13, -5.0, deckY + 1.15, z, darkWood);
  // engawa deck + edge beam + under posts
  addBox(1.25, 0.06, z1 - z0, -5.55, deckY, (z0 + z1) / 2, deckWood);
  addBox(0.12, 0.14, z1 - z0, -4.95, deckY - 0.08, (z0 + z1) / 2, beamWood);
  for (let z = -2.8; z <= 6.5; z += 1.82) addBox(0.11, deckY, 0.11, -4.98, deckY / 2 - 0.05, z, darkWood);
  // stepping stone (kutsunugi-ishi) in front of the veranda
  const step = new THREE.Mesh(rockGeometry(31, 3, 0.35), stoneMaterial({ moss: 0.2, tone: 1.0, carved: true, key: 'step' }));
  step.scale.set(0.5, 0.18, 0.35); step.position.set(-4.5, 0.42, 2.6);
  step.castShadow = step.receiveShadow = true; grp.add(step);
  // head beam (nageshi) + lintel
  addBox(0.14, 0.2, z1 - z0, -5.0, deckY + 2.2, (z0 + z1) / 2, beamWood);
  addBox(0.08, 0.08, z1 - z0, -5.0, deckY + 1.9, (z0 + z1) / 2, beamWood);
  // shoji wall
  const shojiMat = new THREE.MeshStandardMaterial({ map: shojiTexture(), roughness: 0.9, color: 0xb8b2a4, emissive: 0x241e14, emissiveIntensity: 0.12 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, 1.9), shojiMat);
  wall.material.map.wrapS = THREE.RepeatWrapping;
  wall.material.map.repeat.set((z1 - z0) / 0.9, 1);
  wall.rotation.y = Math.PI / 2;
  wall.position.set(-6.1, deckY + 0.95, (z0 + z1) / 2);
  wall.receiveShadow = true;
  grp.add(wall);
  addBox(0.1, 0.5, z1 - z0, -6.12, deckY + 2.15, (z0 + z1) / 2, new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.95 }));

  // roof: corrugated kawara tiles
  const slopeLen = 3.8, rise = 0.48; // rise per unit run
  const rows = 24, cols = 420;
  const rg = new THREE.PlaneGeometry(z1 - z0 + 0.6, slopeLen, cols, rows);
  const rp = rg.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const u = rp.getX(i), v = rp.getY(i);
    const tile = Math.abs(Math.sin((u / 0.27) * Math.PI)) * 0.045;
    const rowStep = ((v + slopeLen / 2) % 0.3) / 0.3 * 0.025;
    rp.setZ(i, tile + rowStep);
  }
  rg.computeVertexNormals();
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.45, metalness: 0.15 });
  const roof = new THREE.Mesh(rg, roofMat);
  const ang = Math.atan(rise);
  roof.rotation.order = 'YXZ';
  roof.rotation.y = Math.PI / 2;
  roof.rotation.x = -Math.PI / 2 + ang;
  roof.position.set(xEave - Math.cos(ang) * slopeLen / 2, eaveY + Math.sin(ang) * slopeLen / 2 + 0.05, (z0 + z1) / 2);
  roof.castShadow = roof.receiveShadow = true;
  grp.add(roof);
  // eave tile ends (round caps) & fascia & rafters
  const capG = new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14).rotateZ(Math.PI / 2);
  const nCaps = Math.floor((z1 - z0) / 0.27);
  const caps = new THREE.InstancedMesh(capG, roofMat, nCaps);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < nCaps; i++) { mm.makeTranslation(xEave + 0.02, eaveY + 0.06, z0 + 0.13 + i * 0.27); caps.setMatrixAt(i, mm); }
  caps.castShadow = true;
  grp.add(caps);
  addBox(0.05, 0.2, z1 - z0 + 0.6, xEave + 0.05, eaveY - 0.08, (z0 + z1) / 2, beamWood);
  addBox(0.6, 0.03, z1 - z0, xEave - 0.3, eaveY - 0.1, (z0 + z1) / 2, beamWood); // soffit boards
  const rafG = new THREE.BoxGeometry(1.0, 0.07, 0.06);
  const nR = Math.floor((z1 - z0) / 0.42);
  const rafters = new THREE.InstancedMesh(rafG, darkWood, nR);
  for (let i = 0; i < nR; i++) {
    mm.makeRotationZ(-ang * 0.6).setPosition(xEave - 0.45, eaveY - 0.15 - 0.0, z0 + 0.2 + i * 0.42);
    rafters.setMatrixAt(i, mm);
  }
  rafters.castShadow = true;
  grp.add(rafters);
  grp.position.x = -2.1;
  return grp;
}
