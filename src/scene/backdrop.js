import * as THREE from 'three';
import { patchMaterial } from '../util/patch.js';

/**
 * Distant hillside forest: a curved band around the camera with a procedural canopy shader
 * (leafy clumps, sun-lit crowns, darker undergrowth) and a ragged top silhouette.
 * It dips on the left so a sliver of sky shows above the roof, like the reference.
 */
export function createBackdrop(cx = 0.15, cz = 6.6) {
  const R = 26, a0 = -2.35, a1 = -0.6; // angles (around +x, toward -z) covering the view
  const g = new THREE.CylinderGeometry(R, R, 18, 160, 24, true, 0, 1);
  // rebuild positions manually for a custom arc
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const a = a0 + (a1 - a0) * u;
    const r = R + Math.sin(u * 23.0) * 0.8 + Math.sin(u * 7.0) * 1.5;
    pos.setXYZ(i, cx + Math.cos(a) * r, -1 + v * 18, cz + Math.sin(a) * r);
  }
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  patchMaterial(mat, {
    key: 'backdrop',
    vertexPars: 'varying vec2 vBUv;',
    vertexBegin: 'vBUv = uv;',
    fragPars: 'varying vec2 vBUv;',
    fragColor: /* glsl */`
      {
        float u = vBUv.x, y = vWPos.y;
        // ragged canopy top; lower on the left (u small)
        float top = 10.5 + 2.5 * fbm2(vec2(u * 9.0, 1.3)) + 1.6 * vnoise(vec2(u * 60.0, 2.0))
                  - 5.2 * smoothstep(0.22, 0.02, u);
        float clump = vnoise(vec2(u * 140.0, y * 1.6)) * 0.8;
        if (y > top - clump) discard;
        // leafy clumps
        vec2 p = vec2(u * 240.0, y * 3.2);
        float n1 = fbm2(p * 0.35);
        float n2 = fbm2(p * 1.4 + 3.0);
        vec2 vo = voronoi(p * 0.55);
        float crown = smoothstep(0.9, 0.1, vo.x);            // dome of each crown
        vec3 dark = vec3(0.02, 0.045, 0.018);
        vec3 mid = vec3(0.065, 0.12, 0.04);
        vec3 lit = vec3(0.2, 0.26, 0.09);
        vec3 c = mix(dark, mid, smoothstep(0.3, 0.7, n1));
        c = mix(c, lit, crown * smoothstep(0.45, 0.8, n2) * 0.8);
        // brighter, hazier near the top edge (sunlit crowns), darker towards the ground
        c *= mix(0.55, 1.1, smoothstep(0.0, top, y));
        // bamboo groves read slightly yellower
        c = mix(c, c * vec3(1.25, 1.2, 0.8), smoothstep(0.55, 0.75, fbm2(vec2(u * 12.0, 0.0))) * 0.5);
        diffuseColor.rgb = c;
      }
    `,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}
