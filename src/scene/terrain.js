import * as THREE from 'three';
import { terrainHeight } from './pond.js';
import { patchMaterial } from '../util/patch.js';

export function createTerrain() {
  // Denser in the pond region, coarser far away (two meshes).
  const group = new THREE.Group();
  const near = buildGrid(-7, 9, -5.5, 11, 200, 205);
  const far = buildGrid(-26, 26, -30, 14, 90, 80, (x, z) => x > -7 && x < 9 && z > -5.5 && z < 11);
  const mat = terrainMaterial();
  for (const g of [near, far]) {
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.castShadow = false;
    group.add(m);
  }
  return group;
}

function buildGrid(x0, x1, z0, z1, nx, nz, skip) {
  const pos = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (i / nx) * (x1 - x0), z = z0 + (j / nz) * (z1 - z0);
      let y = terrainHeight(x, z);
      if (skip && skip(x, z)) y -= 0.05; // hidden under the near mesh
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (skip) {
        const cx = x0 + ((i + 0.5) / nx) * (x1 - x0), cz = z0 + ((j + 0.5) / nz) * (z1 - z0);
        if (skip(cx, cz) && skip(cx - (x1 - x0) / nx, cz - (z1 - z0) / nz) && skip(cx + (x1 - x0) / nx, cz + (z1 - z0) / nz)) continue;
      }
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function terrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, envMapIntensity: 0.4 });
  patchMaterial(mat, {
    key: 'terrain',
    underwater: true,
    fragPars: /* glsl */`
      float pebbles(vec2 p){ vec2 v = voronoi(p); return smoothstep(0.02, 0.18, v.y - v.x); }
    `,
    fragColor: /* glsl */`
      vec3 wp = vWPos;
      float n1 = fbm2(wp.xz * 1.3);
      float n2 = fbm2(wp.xz * 5.0 + 7.0);
      float n3 = fbm2(wp.xz * 0.35 - 3.0);
      // moss & ground cover above the waterline
      vec3 mossA = vec3(0.045, 0.09, 0.02);
      vec3 mossB = vec3(0.11, 0.17, 0.04);
      vec3 dirt = vec3(0.1, 0.08, 0.05);
      vec3 land = mix(mossA, mossB, smoothstep(0.35, 0.7, n1));
      land = mix(land, dirt, smoothstep(0.62, 0.8, n3) * 0.6);
      land *= 0.75 + 0.5 * n2;
      // pond floor: dark silt, sunken pebbles, algae film
      float peb = mix(1.0, pebbles(wp.xz * 7.0), 0.5);
      vec3 silt = mix(vec3(0.03, 0.032, 0.02), vec3(0.06, 0.058, 0.035), n2);
      vec3 stone = mix(vec3(0.1, 0.1, 0.08), vec3(0.17, 0.16, 0.13), hash12(floor(wp.xz*7.0)));
      vec3 floorC = mix(silt, stone, (1.0 - peb) * smoothstep(-0.4, -0.1, wp.y) * 0.3);
      floorC = mix(floorC, vec3(0.04, 0.07, 0.02), smoothstep(0.45, 0.75, n1) * 0.6);
      // wet band at the waterline
      float wet = smoothstep(0.12, 0.0, wp.y);
      vec3 c = mix(land, floorC, smoothstep(0.02, -0.06, wp.y));
      c *= mix(1.0, 0.6, wet * smoothstep(-0.08, 0.0, wp.y));
      diffuseColor.rgb = c;
    `,
    fragNormal: /* glsl */`
      {
        float h = fbm2(vWPos.xz * 6.0) * 0.6;
        normal = perturbNormalH(-vViewPosition, normal, h, 0.025);
      }
    `,
    fragRough: /* glsl */`
      roughnessFactor = mix(0.95, 0.55, smoothstep(0.1, -0.02, vWPos.y));
    `,
  });
  return mat;
}
