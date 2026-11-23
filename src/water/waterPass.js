import * as THREE from 'three';
import { FSPass } from '../post/fsPass.js';
import { NOISE } from '../util/noise.glsl.js';
import { createWaterNormalMap } from './normalMap.js';
import { RIPPLE_BOUNDS } from './ripples.js';
import { sdfTexture, SDF_BOUNDS } from '../scene/pond.js';

export const SHADOW_GLSL = /* glsl */`
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform vec2 uShadowTexel;
float sunVisibility(vec3 wp, float radius){
  vec4 sc = uShadowMatrix * vec4(wp, 1.0);
  vec3 c = sc.xyz / sc.w;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  c.z -= 0.0006;
  vec2 r = uShadowTexel * radius;
  float s = texture(uShadowMap, c);
  s += texture(uShadowMap, vec3(c.xy + vec2( r.x,  r.y) * 0.9, c.z));
  s += texture(uShadowMap, vec3(c.xy + vec2(-r.x,  r.y) * 0.9, c.z));
  s += texture(uShadowMap, vec3(c.xy + vec2( r.x, -r.y) * 0.9, c.z));
  s += texture(uShadowMap, vec3(c.xy + vec2(-r.x, -r.y) * 0.9, c.z));
  s += texture(uShadowMap, vec3(c.xy + vec2( r.x * 1.6, 0.0), c.z));
  s += texture(uShadowMap, vec3(c.xy + vec2(-r.x * 1.6, 0.0), c.z));
  s += texture(uShadowMap, vec3(c.xy + vec2(0.0,  r.y * 1.6), c.z));
  s += texture(uShadowMap, vec3(c.xy + vec2(0.0, -r.y * 1.6), c.z));
  return s / 9.0;
}
`;

export const RECON_GLSL = /* glsl */`
uniform mat4 uInvProj;
uniform mat4 uInvView;
vec3 viewPosFromDepth(vec2 uv, float d){
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
vec3 worldPosFromDepth(vec2 uv, float d){
  return (uInvView * vec4(viewPosFromDepth(uv, d), 1.0)).xyz;
}
`;

/**
 * Full-screen water composite. The water surface is the plane y=0 intersected with the camera ray;
 * a pixel is water when the opaque scene behind it lies below that plane inside the pond.
 */
export class WaterPass {
  constructor() {
    this.normalMap = createWaterNormalMap();
    this.uniforms = {
      tScene: { value: null }, tDepth: { value: null }, tAO: { value: null }, tRefl: { value: null },
      tNormal: { value: this.normalMap }, tRipple: { value: null }, tSDF: { value: sdfTexture }, tShafts: { value: null },
      uShadowMap: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() }, uShadowTexel: { value: new THREE.Vector2(1 / 4096, 1 / 4096) },
      uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() }, uReflVP: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Vector3() },
      uSkyColor: { value: new THREE.Vector3(0.5, 0.65, 0.9) }, uTime: { value: 0 },
      uDeep: { value: new THREE.Vector3() }, uShallow: { value: new THREE.Vector3() }, uAbsorb: { value: new THREE.Vector3() },
      uScatter: { value: 0.5 }, uWaveSpeed: { value: 1 }, uWaveStr: { value: 1 }, uReflStr: { value: 1 }, uRefr: { value: 0.03 },
      uGlitter: { value: 1 }, uRippleStr: { value: 1 }, uAOStr: { value: 1 },
      uRippleB: { value: RIPPLE_BOUNDS }, uRippleTexel: { value: 1 / 256 },
      uSdfB: { value: new THREE.Vector4(SDF_BOUNDS.minX, SDF_BOUNDS.minZ, SDF_BOUNDS.maxX - SDF_BOUNDS.minX, SDF_BOUNDS.maxZ - SDF_BOUNDS.minZ) },
      uHazeColor: { value: new THREE.Vector3(0.55, 0.65, 0.6) }, uHaze: { value: 1 }, uShaftStr: { value: 1 }, uShaftColor: { value: new THREE.Vector3(1, 0.9, 0.7) },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    this.pass = new FSPass(/* glsl */`
      ${NOISE}
      ${SHADOW_GLSL}
      ${RECON_GLSL}
      uniform sampler2D tScene, tDepth, tAO, tRefl, tNormal, tRipple, tSDF, tShafts;
      uniform mat4 uReflVP;
      uniform vec3 uCamPos, uSunDir, uSunColor, uSkyColor, uDeep, uShallow, uAbsorb, uHazeColor, uShaftColor;
      uniform float uTime, uScatter, uWaveSpeed, uWaveStr, uReflStr, uRefr, uGlitter, uRippleStr, uAOStr, uRippleTexel, uHaze, uShaftStr;
      uniform vec4 uRippleB, uSdfB;
      uniform vec2 uResolution;

      float aoAt(vec2 uv){ return mix(1.0, texture2D(tAO, uv).r, uAOStr); }
      vec2 nrm(vec2 uv){ return texture2D(tNormal, uv).rg * 2.0 - 1.0; }
      float rippleH(vec2 uv){ return texture2D(tRipple, uv).r; }

      void main(){
        float d = texture2D(tDepth, vUv).x;
        vec3 col = texture2D(tScene, vUv).rgb * aoAt(vUv);
        vec3 ro = uCamPos;
        vec3 farP = worldPosFromDepth(vUv, 1.0);
        vec3 rd = normalize(farP - ro);
        bool sky = d >= 0.999999;
        vec3 wpS = worldPosFromDepth(vUv, d);
        float distS = sky ? 1e4 : length(wpS - ro);
        float dist = distS;
        vec3 outc = col;
        bool water = false;
        if (rd.y < -1e-4) {
          float tP = -ro.y / rd.y;
          vec3 P = ro + rd * tP;
          vec2 suv = (P.xz - uSdfB.xy) / uSdfB.zw;
          float sd = texture2D(tSDF, suv).r;
          if (distS > tP + 0.0015 && sd < 0.35) {
            water = true;
            dist = tP;
            vec3 V = -rd;
            float t = uTime * uWaveSpeed;
            // --- small, calm ripples: three drifting normal-map layers
            vec2 p = P.xz;
            vec2 s1 = nrm(p * 0.32 + vec2(0.012, 0.007) * t);
            vec2 s2 = nrm(mat2(0.8, -0.6, 0.6, 0.8) * p * 0.71 + vec2(-0.010, 0.016) * t);
            vec2 s3 = nrm(mat2(0.28, 0.96, -0.96, 0.28) * p * 1.73 + vec2(0.021, -0.013) * t);
            vec2 slope = (s1 * 0.5 + s2 * 0.35 + s3 * 0.22) * 0.11 * uWaveStr;
            // --- ripple buffer (fish rising)
            vec2 ruv = (p - uRippleB.xy) / uRippleB.zw;
            if (ruv.x > 0.0 && ruv.y > 0.0 && ruv.x < 1.0 && ruv.y < 1.0) {
              float e = uRippleTexel;
              float hx = rippleH(ruv + vec2(e, 0.0)) - rippleH(ruv - vec2(e, 0.0));
              float hz = rippleH(ruv + vec2(0.0, e)) - rippleH(ruv - vec2(0.0, e));
              slope -= vec2(hx, hz) / (2.0 * e * uRippleB.z) * uRippleStr * 2.2;
            }
            vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
            float cosV = clamp(dot(N, V), 0.0, 1.0);
            float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);

            // --- sun visibility on the surface (dappled tree shadows)
            float sunVis = sunVisibility(P, 1.5);

            // --- reflection (planar, distorted by the normal)
            vec4 rc = uReflVP * vec4(P + vec3(slope.x, 0.0, slope.y) * (0.35 + tP * 0.06), 1.0);
            vec2 rflUv = clamp(rc.xy / rc.w * 0.5 + 0.5, 0.001, 0.999);
            vec3 refl = texture2D(tRefl, rflUv).rgb * uReflStr;

            // --- refraction with above-water rejection
            vec2 rs2 = slope; float rl = length(rs2); if (rl > 0.18) rs2 *= 0.18 / rl;
            vec2 off = rs2 * uRefr * 6.0 / (1.0 + tP * 0.12);
            vec2 rUv = vUv + off;
            float dR = texture2D(tDepth, rUv).x;
            vec3 S2 = worldPosFromDepth(rUv, dR);
            if (S2.y > 0.005 || dR >= 0.999999) { rUv = vUv; dR = d; S2 = wpS; }
            vec3 refr = texture2D(tScene, rUv).rgb * aoAt(rUv);
            float L = length(S2 - P);                 // path length through water
            float depthB = max(0.0, -S2.y);
            vec3 T = exp(-uAbsorb * (L + depthB * 0.35));
            // in-scattering: deep moss green, brighter where the sun reaches into the water
            vec3 amb = uSkyColor * 0.35;
            vec3 inscat = uDeep * (amb + uSunColor * sunVis * 0.18) * uScatter;
            vec3 under = refr * T + inscat * (1.0 - T);
            under = mix(under, under * uShallow * 2.5, (1.0 - T.g) * 0.25);

            // --- sun glitter: sharp specular on wave crests
            vec3 H = normalize(uSunDir + V);
            vec3 Ng = normalize(vec3(slope * 1.8 + (nrm(p * 4.1 + vec2(0.03, 0.02) * t) * 0.03), 1.0));
            float NH = max(dot(Ng, H), 0.0);
            float Fh = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
            float spec = pow(NH, 1400.0) * 220.0 + pow(max(dot(N, H), 0.0), 160.0) * 3.0;
            // pinpoint sparkles
            // capillary micro-facets: random steep normals per cell, re-rolled ~8x per second
            vec2 cell = floor(p * 70.0);
            float tk = floor(t * 8.0 + hash12(cell) * 8.0);
            vec2 hr = hash22(cell + tk * 13.7);
            vec3 nr = normalize(vec3((hr.x - 0.5) * 0.95, 1.0, (hr.y - 0.5) * 0.95) + vec3(slope.x, 0.0, slope.y) * 2.0);
            vec2 f = fract(p * 70.0) - 0.5;
            float dotMask = smoothstep(0.32, 0.0, length(f));
            spec += pow(max(dot(nr, H), 0.0), 1600.0) * 1400.0 * dotMask * step(0.82, hash12(cell * 1.7 + tk));
            vec3 glitter = uSunColor * spec * Fh * sunVis * uGlitter;

            // --- thin surface film catches a little sun (makes the leaf shadows readable on the water)
            vec3 film = uSunColor * sunVis * 0.0035 + uSkyColor * 0.002;

            vec3 w = mix(under, refl, F) + glitter + film * (1.0 - F);
            // soft shoreline
            float shore = smoothstep(0.0, 0.04, L);
            outc = mix(col, w, shore);
          }
        }
        // god rays (already includes the phase function)
        vec3 shafts = texture2D(tShafts, vUv).rgb * uShaftColor * uShaftStr;
        // aerial perspective
        if (!sky) {
          float sunAmt = pow(max(dot(rd, uSunDir), 0.0), 5.0);
          float f = (1.0 - exp(-max(dist - 8.0, 0.0) * 0.006 * uHaze)) * 0.85;
          outc = mix(outc, uHazeColor * (0.9 + sunAmt * 1.6), f);
        }
        outc += shafts;
        gl_FragColor = vec4(outc, 1.0);
      }
    `, this.uniforms);
  }

  render(renderer, target) { this.pass.render(renderer, target); }
}
