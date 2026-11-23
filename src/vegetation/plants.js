import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FoliageBuilder, taperedTube, barkMaterial } from './foliage.js';
import { azaleaTexture, pineTexture, broadleafTexture, bambooTexture } from './leafTextures.js';
import { createBamboo } from './bamboo.js';
import { terrainHeight } from '../scene/pond.js';
import { makeRng } from '../util/rng.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Colour palettes (linear-ish multipliers on the leaf texture)
const AZALEA = [C(1.1, 1.0, 0.72), C(0.95, 0.95, 0.68), C(1.2, 1.08, 0.7), C(0.85, 0.88, 0.7)];
const AZALEA_YELLOW = [C(1.35, 1.25, 0.75), C(1.2, 1.2, 0.7), C(1.45, 1.3, 0.7)];
const BOX_DARK = [C(0.7, 0.85, 0.7), C(0.62, 0.78, 0.62), C(0.75, 0.9, 0.7)];
const PINE = [C(1.35, 1.3, 0.8), C(1.15, 1.2, 0.78), C(1.5, 1.38, 0.78)];
const PINE_LIGHT = [C(1.6, 1.5, 0.9), C(1.45, 1.45, 0.85), C(1.75, 1.6, 0.85)];
const FOREST = [C(0.68, 0.8, 0.6), C(0.58, 0.72, 0.55), C(0.8, 0.88, 0.58), C(0.52, 0.66, 0.5)];
const FOREST_SUN = [C(1.15, 1.15, 0.65), C(1.0, 1.08, 0.6)];

export function createVegetation() {
  const group = new THREE.Group();
  const rng = makeRng(2024);
  const azalea = new FoliageBuilder({ texture: azaleaTexture(), name: 'azalea', wrap: 0.5, transl: 0.55, coreColor: 0x34491a });
  const pine = new FoliageBuilder({ texture: pineTexture(), name: 'pine', wrap: 0.6, transl: 1.0, coreColor: 0x1e2e0e });
  const forest = new FoliageBuilder({ texture: broadleafTexture(), name: 'forest', wrap: 0.6, transl: 0.8, coreColor: 0x0d1a0a, castShadow: false });
  const bark = barkMaterial();
  const barkDark = barkMaterial([0.15, 0.12, 0.1]);
  const trunks = [];
  const trunksDark = [];

  const bush = (x, z, rx, ry, rz, opts = {}) => {
    const gy = terrainHeight(x, z);
    azalea.addBlob({
      center: V(x, gy + ry * (opts.lift ?? 0.62), z), radii: [rx, ry, rz], density: opts.density ?? 230,
      size: opts.size ?? [0.14, 0.21], colors: opts.colors ?? AZALEA, colorVar: 0.1, flatBottom: 0.7,
      shellMin: 0.86, lumpy: opts.lumpy ?? 0.07, wind: 0.006, flutter: 0.004, jitter: 0.38, ao: opts.ao ?? 1,
    });
  };

  // ---------------- karikomi azaleas: left bank, stacked in tiers (front → back)
  const leftBank = [
    // x, z, rx, ry, rz
    [-2.05, 5.0, 0.7, 0.4, 0.75], [-2.3, 3.85, 0.68, 0.45, 0.7], [-2.6, 2.75, 0.78, 0.5, 0.7],
    [-3.2, 1.75, 0.65, 0.45, 0.6], [-2.75, 5.3, 0.95, 0.68, 0.95], [-3.1, 4.0, 0.9, 0.72, 0.85],
    [-3.6, 2.8, 0.85, 0.7, 0.8], [-3.95, 1.55, 0.75, 0.6, 0.7], [-4.0, 5.0, 1.0, 0.85, 1.0],
    [-4.35, 3.55, 0.95, 0.9, 0.9], [-4.6, 2.2, 0.8, 0.75, 0.8], [-3.8, 0.5, 0.65, 0.55, 0.6],
    [-1.85, 6.1, 0.65, 0.38, 0.6], [-1.55, 4.4, 0.42, 0.28, 0.5], [-1.75, 3.4, 0.45, 0.3, 0.5], [-1.4, 5.5, 0.4, 0.26, 0.45],
  ];
  leftBank.forEach(([x, z, rx, ry, rz], i) => bush(x, z, rx, ry, rz, { colors: i % 5 === 2 ? AZALEA_YELLOW : AZALEA, size: z > 3.5 ? [0.1, 0.15] : [0.13, 0.2], density: z > 3.5 ? 300 : 190 }));
  // bushes along the back around the bridge landing and the tōrō
  const back = [
    [-2.55, -0.55, 0.7, 0.5, 0.6], [-1.7, -1.75, 0.65, 0.55, 0.55], [-0.15, -2.15, 0.6, 0.45, 0.5],
    [0.55, -1.6, 0.45, 0.35, 0.4], [-1.25, -2.45, 0.5, 0.42, 0.45], [1.65, -2.2, 0.55, 0.45, 0.5],
    [-3.1, -1.6, 0.8, 0.6, 0.7], [-0.6, -3.4, 0.55, 0.5, 0.5], [4.4, -1.4, 0.6, 0.5, 0.55],
    [-2.6, -2.8, 0.7, 0.75, 0.65], [5.4, -0.9, 0.7, 0.6, 0.6],
    // fill the open lawn behind the pond
    [2.5, -1.75, 0.55, 0.4, 0.45], [4.0, -2.2, 0.7, 0.55, 0.6], [5.9, -1.9, 0.9, 0.7, 0.8], [7.2, -1.0, 0.9, 0.75, 0.8],
    [7.6, 0.6, 0.8, 0.6, 0.7], [6.6, -3.2, 1.0, 0.85, 0.9], [0.0, -3.0, 0.65, 0.5, 0.6], [1.2, -2.9, 0.6, 0.5, 0.55],
    [-1.9, -3.4, 0.7, 0.6, 0.6], [-3.6, -2.6, 0.8, 0.7, 0.7], [-3.9, -0.6, 0.7, 0.55, 0.6], [2.2, -3.6, 0.8, 0.6, 0.7],
    [-0.9, -4.6, 0.9, 0.7, 0.8], [3.8, -4.4, 1.0, 0.8, 0.9], [-4.6, -3.9, 1.0, 0.85, 0.9], [8.4, -2.6, 1.0, 0.8, 0.9],
  ];
  back.forEach(([x, z, rx, ry, rz], i) => bush(x, z, rx, ry, rz, { colors: i % 3 === 0 ? AZALEA_YELLOW : (i % 3 === 1 ? BOX_DARK : AZALEA) }));
  // big round bush on the right (o-karikomi)
  bush(3.05, -2.65, 1.35, 1.1, 1.15, { colors: AZALEA, density: 200, size: [0.15, 0.24], lift: 0.75, lumpy: 0.09 });

  // ---------------- niwaki pines: trunk + curved branches ending in flat cloud pads
  const makePine = (base, spec, light = false) => {
    const gy = terrainHeight(base.x, base.z);
    const trunkPts = spec.trunk.map(([x, y, z]) => V(base.x + x, gy + y, base.z + z));
    trunks.push(taperedTube(trunkPts, (t) => spec.r0 * (1 - 0.7 * t) + 0.02, 40, 10));
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
    for (const pad of spec.pads) {
      const [t, px, py, pz, rx, ry, rz] = pad;
      const s = trunkCurve.getPointAt(t);
      const c = V(base.x + px, gy + py, base.z + pz);
      const mid = s.clone().lerp(c, 0.5); mid.y -= 0.12;
      const r0 = spec.r0 * (1 - 0.7 * t) * 0.55;
      trunks.push(taperedTube([s, mid, c.clone().add(V(0, -ry * 0.4, 0))], (u) => r0 * (1 - 0.65 * u) + 0.012, 14, 6));
      pine.addBlob({
        center: c, radii: [rx * 1.2, ry * 1.45, rz * 1.2], density: 260, size: [0.17, 0.26],
        colors: light ? PINE_LIGHT : PINE, colorVar: 0.1, flatBottom: 0.9, shellMin: 0.55,
        lumpy: 0.18, wind: 0.02, flutter: 0.006, upBias: 0.35, jitter: 0.6, ao: 1.0,
      });
    }
  };

  // Pine A — tall tiered pine, left-centre
  makePine(V(-2.35, 0, -3.9), {
    r0: 0.13,
    trunk: [[0, 0, 0], [0.15, 0.8, 0.05], [-0.1, 1.6, -0.05], [0.1, 2.4, 0.0], [-0.05, 3.25, 0.05], [0.0, 3.7, 0.0]],
    pads: [
      [0.32, 0.85, 1.15, 0.35, 0.75, 0.22, 0.6], [0.4, -0.75, 1.45, 0.15, 0.7, 0.2, 0.55],
      [0.55, 0.65, 2.0, 0.2, 0.62, 0.2, 0.5], [0.62, -0.6, 2.3, -0.1, 0.6, 0.2, 0.5],
      [0.78, 0.45, 2.8, 0.1, 0.52, 0.18, 0.45], [0.86, -0.4, 3.1, 0.0, 0.48, 0.18, 0.42],
      [1.0, 0.0, 3.7, 0.0, 0.5, 0.25, 0.45], [0.45, 0.1, 1.75, 0.7, 0.55, 0.18, 0.5],
    ],
  });
  // Pine B — broad cloud pine, centre-right behind the landing
  makePine(V(0.8, 0, -3.7), {
    r0: 0.15,
    trunk: [[0, 0, 0], [-0.25, 0.7, 0.1], [0.1, 1.4, 0.0], [0.35, 2.1, -0.1], [0.2, 2.8, 0.0], [0.25, 3.2, 0.0]],
    pads: [
      [0.3, -1.05, 1.05, 0.5, 0.85, 0.24, 0.65], [0.35, 1.0, 1.25, 0.3, 0.8, 0.22, 0.6],
      [0.5, -0.4, 1.75, 0.55, 0.7, 0.22, 0.55], [0.6, 1.1, 2.05, 0.0, 0.7, 0.2, 0.55],
      [0.7, -0.6, 2.35, -0.2, 0.65, 0.2, 0.5], [0.85, 0.75, 2.7, 0.2, 0.55, 0.2, 0.45],
      [1.0, 0.25, 3.2, 0.0, 0.62, 0.26, 0.5], [0.45, 0.3, 1.5, 0.9, 0.55, 0.18, 0.5],
    ],
  });
  // small pine near the right bush
  makePine(V(4.6, 0, -2.9), {
    r0: 0.09,
    trunk: [[0, 0, 0], [0.1, 0.8, 0], [-0.05, 1.6, 0.05], [0.05, 2.2, 0]],
    pads: [[0.45, -0.55, 1.2, 0.3, 0.55, 0.18, 0.45], [0.6, 0.5, 1.6, 0.2, 0.5, 0.18, 0.4], [1.0, 0.0, 2.25, 0.0, 0.48, 0.2, 0.42]],
  });

  // ---------------- leaning tree on the right reaching over the water
  {
    const base = V(7.2, terrainHeight(7.2, -0.3), -0.3);
    const pts = [V(0, 0, 0), V(-0.25, 0.8, 0.15), V(-0.9, 1.5, 0.45), V(-1.9, 1.95, 0.85), V(-2.9, 2.15, 1.2), V(-3.7, 2.35, 1.5)].map((p) => p.add(base));
    trunks.push(taperedTube(pts, (t) => 0.2 * (1 - 0.75 * t) + 0.02, 48, 12));
    const curve = new THREE.CatmullRomCurve3(pts);
    const pads = [
      [0.95, -0.2, 0.35, 0.1, 0.85, 0.26, 0.7], [0.8, 0.1, 0.45, -0.6, 0.7, 0.22, 0.6], [0.7, 0.2, 0.6, 0.65, 0.75, 0.24, 0.6],
      [0.55, 0.25, 0.55, -0.5, 0.65, 0.22, 0.55], [0.4, 0.15, 0.8, 0.5, 0.6, 0.22, 0.5], [0.25, 0.3, 1.0, -0.2, 0.7, 0.26, 0.6],
      [0.15, 0.6, 1.5, 0.3, 0.8, 0.3, 0.7], [1.0, -0.35, 0.55, 0.5, 0.6, 0.22, 0.55],
    ];
    for (const [t, ox, oy, oz, rx, ry, rz] of pads) {
      const s = curve.getPointAt(t);
      const c = s.clone().add(V(ox, oy, oz));
      trunks.push(taperedTube([s, s.clone().lerp(c, 0.5).add(V(0, 0.08, 0)), c.clone().add(V(0, -ry * 0.3, 0))], (u) => 0.05 * (1 - 0.6 * u) + 0.01, 12, 6));
      pine.addBlob({
        center: c, radii: [rx, ry, rz], density: 240, size: [0.18, 0.27], colors: PINE_LIGHT, colorVar: 0.1,
        flatBottom: 0.9, shellMin: 0.55, lumpy: 0.2, wind: 0.035, flutter: 0.008, upBias: 0.35, jitter: 0.6,
      });
    }
  }

  // ---------------- background forest: dense broadleaf canopy wall behind the garden
  for (let i = 0; i < 70; i++) {
    const x = rng.range(-16, 16);
    const z = rng.range(-7.5, -14);
    const depth = (-z - 7.5) / 9.5;
    const h = rng.range(2.0, 6.5) + depth * 3.5 - Math.max(0, -x - 9) * 0.35;
    const r = rng.range(1.4, 2.6) + depth * 0.8;
    const sunny = rng() < 0.25;
    forest.addBlob({
      center: V(x, terrainHeight(x, z) + h, z), radii: [r * rng.range(0.9, 1.3), r * rng.range(0.75, 1.0), r * 0.9],
      density: 5.5, size: [0.8, 1.3], colors: sunny ? FOREST_SUN : FOREST, colorVar: 0.12, flatBottom: 0.2,
      shellMin: 0.6, lumpy: 0.3, wind: 0.05, flutter: 0.02, jitter: 0.8, ao: 0.9 - depth * 0.15, core: true,
    });
    if (rng() < 0.5) {
      const tx = x + rng.range(-0.5, 0.5);
      const gy = terrainHeight(tx, z);
      trunksDark.push(taperedTube([V(tx, gy - 0.1, z), V(tx + rng.range(-0.3, 0.3), gy + h * 0.5, z), V(x, gy + h, z)], (t) => 0.12 * (1 - 0.5 * t), 8, 6));
    }
  }
  // lower shrub layer at the back edge of the garden
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-9, 9), z = rng.range(-4.6, -7.2);
    const r = rng.range(0.7, 1.3);
    forest.addBlob({
      center: V(x, terrainHeight(x, z) + r * 0.7, z), radii: [r * 1.2, r, r], density: 20, size: [0.45, 0.75],
      colors: FOREST, colorVar: 0.12, flatBottom: 0.6, shellMin: 0.65, lumpy: 0.25, wind: 0.03, flutter: 0.015, jitter: 0.8, ao: 0.85,
    });
  }

  group.add(azalea.build(), pine.build(), forest.build());

  const trunkMesh = new THREE.Mesh(mergeGeometries(trunks), bark);
  trunkMesh.castShadow = trunkMesh.receiveShadow = true;
  group.add(trunkMesh);
  if (trunksDark.length) {
    const tm = new THREE.Mesh(mergeGeometries(trunksDark), barkDark);
    tm.castShadow = tm.receiveShadow = true;
    group.add(tm);
  }
  const bamboo = createBamboo(bambooTexture());
  group.add(bamboo.group);

  const materials = [azalea.mat, pine.mat, forest.mat, bamboo.leafMat].filter(Boolean);
  return { group, materials, forest: forest.mesh };
}
