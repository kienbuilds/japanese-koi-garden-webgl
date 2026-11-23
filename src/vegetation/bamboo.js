import * as THREE from 'three';
import { FoliageBuilder } from './foliage.js';
import { patchMaterial, patchedDepthMaterial } from '../util/patch.js';
import { terrainHeight } from '../scene/pond.js';
import { makeRng } from '../util/rng.js';

const CULM_PARS = /* glsl */`
attribute vec4 aCulm; // x: lean x, y: lean z, z: phase, w: seed
varying float vCulmY; varying float vSeed;
`;
const CULM_BEGIN = /* glsl */`
{
  float y = position.y;              // 0..1 along the culm
  float t = uTime * uWindSpeed;
  float sway = (sin(t * 0.7 + aCulm.z) * 0.6 + sin(t * 1.6 + aCulm.z * 2.3) * 0.25) * uWind;
  vec3 off = vec3(aCulm.x + sway * 0.12, 0.0, aCulm.y + sway * 0.04) * y * y;
  transformed += inverse(mat3(instanceMatrix)) * off;
  #ifdef CULM_VARY
  vCulmY = y; vSeed = aCulm.w;
  #endif
}
`;

export function createBamboo(leafTex) {
  const rng = makeRng(808);
  const group = new THREE.Group();
  const spots = [];
  // groves: back-left behind the house, back-centre, right
  const groves = [[-8.0, -6.0, 3.0, 2.0, 10], [-3.5, -8.5, 3.0, 1.5, 7], [6.5, -7.5, 2.5, 1.5, 7], [10.0, -3.5, 1.5, 2.0, 5]];
  for (const [cx, cz, sx, sz, n] of groves) {
    for (let i = 0; i < n; i++) spots.push([cx + rng.range(-sx, sx), cz + rng.range(-sz, sz)]);
  }
  const n = spots.length;
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 24, true);
  geo.translate(0, 0.5, 0);
  const aCulm = new Float32Array(n * 4);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  patchMaterial(mat, {
    key: 'culm',
    vertexPars: CULM_PARS,
    vertexBegin: '#define CULM_VARY\n' + CULM_BEGIN,
    fragPars: 'varying float vCulmY; varying float vSeed;',
    fragColor: /* glsl */`
      float H = 8.0;
      float seg = fract(vCulmY * H * 2.6 + vSeed);
      float node = smoothstep(0.0, 0.03, seg) * smoothstep(0.08, 0.04, seg);
      vec3 base = mix(vec3(0.09, 0.12, 0.04), vec3(0.16, 0.17, 0.07), vSeed);
      base *= 0.8 + 0.3 * vnoise(vec2(vCulmY * 80.0, vSeed * 10.0));
      base = mix(base, vec3(0.2, 0.2, 0.13), smoothstep(0.6, 0.0, vCulmY) * 0.3);
      diffuseColor.rgb = mix(base, base * 0.55, node);
    `,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const leaves = new FoliageBuilder({ texture: leafTex, name: 'bamboo', wrap: 0.6, transl: 0.9, coreColor: 0x1d2d10 });
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    const h = rng.range(6.0, 9.5), r = rng.range(0.028, 0.05);
    const gy = terrainHeight(x, z);
    m.makeScale(r, h, r).setPosition(x, gy - 0.05, z);
    mesh.setMatrixAt(i, m);
    const lx = rng.range(-0.6, 0.6) + (x < 0 ? 0.3 : -0.3), lz = rng.range(-0.4, 0.4);
    aCulm.set([lx, lz, rng() * 6.28, rng()], i * 4);
    // leaf sprays along the upper culm, displaced by the lean
    for (let k = 0; k < 4; k++) {
      const yy = rng.range(0.45, 1.0);
      const c = new THREE.Vector3(x + lx * yy * yy, gy + h * yy, z + lz * yy * yy);
      leaves.addBlob({
        center: c, radii: [rng.range(0.6, 1.0), rng.range(0.35, 0.6), rng.range(0.6, 1.0)], density: 18,
        size: [0.45, 0.7], colors: [new THREE.Color(0.85, 0.95, 0.75), new THREE.Color(1.0, 1.05, 0.7), new THREE.Color(0.7, 0.85, 0.65)],
        colorVar: 0.12, shellMin: 0.3, lumpy: 0.3, wind: 0.07, flutter: 0.03, jitter: 1.0, core: false, transl: 1.2,
      });
    }
  });
  geo.setAttribute('aCulm', new THREE.InstancedBufferAttribute(aCulm, 4));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.customDepthMaterial = patchedDepthMaterial({ key: 'culm', vertexPars: CULM_PARS, vertexBegin: CULM_BEGIN });
  group.add(mesh);
  group.add(leaves.build());
  return { group, leafMat: leaves.mat };
}
