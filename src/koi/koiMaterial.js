import * as THREE from 'three';
import { patchMaterial, patchedDepthMaterial } from '../util/patch.js';

export const KOI_TYPES = ['kohaku', 'sanke', 'showa', 'ogon', 'chagoi', 'platinum', 'orenji', 'tancho', 'yamabuki'];

const VPARS = /* glsl */`
attribute vec3 aBody;
attribute vec4 aSwim;   // phase, amplitude, bend, fin phase
attribute vec4 aKoi;    // type, seed, -, -
varying vec3 vBody; varying vec3 vLocal; varying vec4 vKoi;
`;
const VBEGIN = /* glsl */`
{
  float u = aBody.x; float part = aBody.y;
  float ph = aSwim.x, amp = aSwim.y, bend = aSwim.z;
  float A = amp * (0.03 + 0.97 * u * u) * 0.15;
  float wave = sin(u * 5.8 - ph) * A;
  float turn = bend * u * u * 0.32;
  if (part > 0.5 && part < 1.5) wave += sin(u * 5.8 - ph - 1.0) * A * 0.45 * aBody.z;   // trailing caudal fin
  transformed.z += wave + turn;
  if (part > 2.5 && part < 4.5) {                                                        // pectoral paddling
    float side = part < 3.5 ? -1.0 : 1.0;
    float f = sin(aSwim.w);
    transformed.z += side * aBody.z * 0.025 * f;
    transformed.y += aBody.z * 0.012 * cos(aSwim.w);
  }
  if (part > 5.5) transformed.y += sin(uTime * 3.0 + aKoi.y * 20.0 + aBody.z * 3.0) * 0.004 * aBody.z; // barbels
  #ifdef KOI_VARY
  vBody = aBody; vLocal = position; vKoi = aKoi;
  #endif
}
`;

export function createKoiMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.0, side: THREE.DoubleSide });
  patchMaterial(mat, {
    key: 'koi',
    underwater: true,
    vertexPars: VPARS,
    vertexBegin: '#define KOI_VARY\n' + VBEGIN,
    fragPars: 'varying vec3 vBody; varying vec3 vLocal; varying vec4 vKoi;',
    fragColor: /* glsl */`
      float koiMetal = 0.0; float koiRough = 0.38;
      {
        float type = floor(vKoi.x + 0.5); float seed = vKoi.y;
        vec3 lp = vLocal; float u = vBody.x; float part = floor(vBody.y + 0.5);
        vec3 WHITE = vec3(0.86, 0.85, 0.8), RED = vec3(0.78, 0.07, 0.015), BLACK = vec3(0.012, 0.012, 0.014);
        vec3 ORANGE = vec3(0.95, 0.3, 0.025), GOLD = vec3(1.0, 0.64, 0.16), BRONZE = vec3(0.42, 0.22, 0.07);
        float back = smoothstep(-0.035, 0.05, lp.y);
        float belly = smoothstep(0.0, -0.07, lp.y);
        vec3 q = lp * vec3(8.5, 11.0, 11.0) + seed * 13.1;
        float n = fbm3(q);
        float n2 = fbm3(lp * 15.0 + seed * 5.3 + 7.0);
        float edge = 0.025;
        vec3 c = WHITE;
        if (type < 0.5) {                          // kohaku
          float m = smoothstep(0.5 - edge, 0.5 + edge, n + back * 0.12 - belly * 0.25);
          c = mix(WHITE, RED, m);
        } else if (type < 1.5) {                   // sanke
          float m = smoothstep(0.5 - edge, 0.5 + edge, n + back * 0.1 - belly * 0.25);
          c = mix(WHITE, RED, m);
          float s = smoothstep(0.66, 0.68, n2) * back;
          c = mix(c, BLACK, s);
        } else if (type < 2.5) {                   // showa
          float r = smoothstep(0.5 - edge, 0.5 + edge, n + back * 0.06);
          float w = smoothstep(0.55, 0.57, n2) * (1.0 - r * 0.7);
          c = mix(BLACK, RED, r);
          c = mix(c, WHITE, max(w, belly * 0.6));
        } else if (type < 3.5) {                   // ogon (metallic gold)
          c = vec3(1.0, 0.52, 0.1) * (0.9 + 0.2 * n); koiMetal = 0.7; koiRough = 0.28;
        } else if (type < 4.5) {                   // chagoi
          c = BRONZE * (0.85 + 0.3 * n); koiRough = 0.45;
        } else if (type < 5.5) {                   // platinum
          c = vec3(0.92, 0.92, 0.9); koiMetal = 0.6; koiRough = 0.28;
        } else if (type < 6.5) {                   // orenji / kigoi
          c = mix(ORANGE, ORANGE * vec3(1.05, 1.3, 1.4), smoothstep(0.55, 0.7, n) * 0.5);
        } else if (type < 7.5) {                   // tancho
          float hd = length((lp.xz - vec2(0.36, 0.0)) * vec2(1.0, 1.3));
          c = mix(RED, WHITE, smoothstep(0.045, 0.055, hd + (n - 0.5) * 0.02) + (1.0 - back));
        } else {                                   // yamabuki (yellow metallic)
          c = vec3(1.0, 0.62, 0.16); koiMetal = 0.55; koiRough = 0.3;
        }
        // pale belly
        if (type != 2.0) c = mix(c, WHITE * vec3(1.0, 0.97, 0.9), belly * 0.7);
        // reticulated scales
        if (part < 0.5) {
          float ang = atan(lp.y, lp.z);
          vec2 v = voronoi(vec2(lp.x * 70.0, ang * 7.0 + lp.x * 6.0));
          float sc = smoothstep(0.0, 0.12, v.y - v.x);
          float scaleK = (type > 3.5 && type < 4.5) ? 0.35 : 0.12;
          c *= mix(1.0 - scaleK, 1.0, sc);
          if (koiMetal > 0.1) c *= mix(1.25, 1.0, sc);
          // gill line + eye
          float gill = smoothstep(0.006, 0.0, abs(lp.x - 0.38 + abs(lp.y) * 0.3)) * step(abs(lp.y), 0.06);
          c *= 1.0 - gill * 0.25;
          float eye = length(vec2(lp.x - 0.435, lp.y - 0.008));
          float side = smoothstep(0.03, 0.05, abs(lp.z));
          c = mix(c, mix(vec3(0.6, 0.45, 0.15), vec3(0.005), smoothstep(0.009, 0.006, eye)), smoothstep(0.014, 0.011, eye) * side);
          // darker snout/lips
          c *= 1.0 - smoothstep(0.47, 0.5, lp.x) * 0.25;
        } else {
          // fins: translucent white-ish carrying a little of the body colour
          float t = vBody.z;
          vec3 fc = mix(c, WHITE * 0.8, 0.2 + 0.25 * t) * 0.85;
          if (type > 1.5 && type < 2.5 && part > 2.5 && part < 4.5) fc = mix(BLACK, fc, smoothstep(0.2, 0.55, t)); // motoguro
          if (type > 2.5 && type < 3.5) fc = vec3(1.0, 0.55, 0.12);
          if (type > 4.5 && type < 5.5) fc = vec3(0.95);
          if (type > 3.5 && type < 4.5) fc = BRONZE * 1.2;
          // fin rays
          fc *= 0.9 + 0.1 * sin(vLocal.y * 260.0 + vLocal.z * 260.0);
          c = fc; koiRough = 0.45;
          if (part > 5.5) c = WHITE * 0.7;
        }
        diffuseColor.rgb = c;
      }
    `,
    fragRough: 'metalnessFactor = koiMetal; roughnessFactor = koiRough;',
  });
  const depth = patchedDepthMaterial({ key: 'koi', vertexPars: VPARS, vertexBegin: VBEGIN }, { side: THREE.DoubleSide });
  return { mat, depth };
}
