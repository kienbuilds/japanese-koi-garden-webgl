import * as THREE from 'three';
import { patchMaterial } from '../util/patch.js';

/**
 * Granite / garden-rock material with procedural speckle, lichen and moss on upward faces.
 * moss: 0..1 amount, tone: base grey multiplier, carved: smoother (for worked stone).
 */
export function stoneMaterial({ moss = 0.8, tone = 1.0, carved = false, warm = 0.0, key = 'stone' } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 });
  patchMaterial(mat, {
    key: key + moss + tone + carved,
    underwater: true,
    uniforms: { uMoss: { value: moss }, uTone: { value: tone }, uCarved: { value: carved ? 1 : 0 }, uWarm: { value: warm } },
    fragPars: /* glsl */`
      uniform float uMoss; uniform float uTone; uniform float uCarved; uniform float uWarm;
      float stoneH(vec3 p){
        float h = fbm3(p * 3.0) * 0.7 + vnoise3(p * 22.0) * 0.18 * (1.0 - uCarved*0.6);
        return h;
      }
    `,
    fragColor: /* glsl */`
      vec3 p = vWPos;
      float big = fbm3(p * 1.1 + 3.1);
      float spk = vnoise3(p * 60.0);
      vec3 grey = mix(vec3(0.085, 0.085, 0.078), vec3(0.2, 0.19, 0.17), big);
      grey = mix(grey, grey * vec3(1.12, 1.0, 0.85), uWarm);
      grey *= 0.85 + 0.3 * spk;
      grey = mix(grey, vec3(0.12, 0.12, 0.11), smoothstep(0.62, 0.72, fbm3(p * 4.0 + 9.0)) * 0.5); // dark weathering
      // lichen speckles
      float lich = smoothstep(0.72, 0.8, vnoise3(p * 9.0)) * (1.0 - uCarved*0.5);
      grey = mix(grey, vec3(0.3, 0.31, 0.24), lich * 0.5);
      vec3 N = normalize(vWNormal);
      float mossMask = smoothstep(0.25, 0.75, N.y + (fbm3(p * 2.5) - 0.5) * 1.3) * uMoss;
      mossMask *= smoothstep(0.0, 0.05, p.y + 0.02);
      vec3 mossC = mix(vec3(0.04, 0.09, 0.015), vec3(0.12, 0.19, 0.035), fbm3(p * 7.0));
      // algae / wet darkening below and near the waterline
      float wet = smoothstep(0.08, -0.02, p.y);
      vec3 c = mix(grey * uTone, mossC, mossMask);
      c = mix(c, c * vec3(0.3, 0.33, 0.22), wet);
      c = mix(c, vec3(0.03, 0.045, 0.02), smoothstep(-0.03, -0.15, p.y) * 0.7); // algae film under water
      diffuseColor.rgb = c;
    `,
    fragNormal: /* glsl */`
      normal = perturbNormalH(-vViewPosition, normal, stoneH(vWPos), mix(0.07, 0.04, uCarved));
    `,
    fragRough: /* glsl */`
      roughnessFactor = mix(0.95, 0.7, smoothstep(0.06, -0.02, vWPos.y));
    `,
  });
  return mat;
}
