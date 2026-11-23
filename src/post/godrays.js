import * as THREE from 'three';
import { FSPass } from './fsPass.js';
import { RECON_GLSL, SHADOW_GLSL } from '../water/waterPass.js';

/**
 * Volumetric light shafts: ray-march the sun's shadow map along each view ray (quarter res),
 * Henyey–Greenstein forward scattering. Leaves cut real shafts through the canopy.
 */
export class GodRaysPass {
  constructor() {
    const o = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = new THREE.WebGLRenderTarget(1, 1, o);
    this.rt2 = new THREE.WebGLRenderTarget(1, 1, o);
    this.march = new FSPass(/* glsl */`
      ${RECON_GLSL}
      ${SHADOW_GLSL}
      uniform sampler2D tDepth; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform float uTime; uniform float uDensity;
      float hg(float c, float g){ float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5) / 12.566; }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float sunVisRaw(vec3 wp){
        vec4 sc = uShadowMatrix * vec4(wp, 1.0);
        vec3 c = sc.xyz / sc.w;
        if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
        return texture(uShadowMap, vec3(c.xy, c.z - 0.001));
      }
      void main(){
        float d = texture2D(tDepth, vUv).x;
        vec3 wp = worldPosFromDepth(vUv, min(d, 0.99999));
        vec3 rd = normalize(wp - uCamPos);
        float L = min(length(wp - uCamPos), 26.0);
        // the air above the pond only: stop at the water plane
        if (rd.y < 0.0) L = min(L, -uCamPos.y / rd.y);
        const int N = 28;
        float dt = L / float(N);
        float j = hash(gl_FragCoord.xy + fract(uTime) * 61.0);
        float acc = 0.0;
        for (int i = 0; i < N; i++) {
          vec3 p = uCamPos + rd * (float(i) + j) * dt;
          float h = clamp(1.0 - p.y / 9.0, 0.2, 1.0);       // denser near the ground
          acc += sunVisRaw(p) * h;
        }
        float cosT = dot(rd, uSunDir);
        float phase = hg(cosT, 0.62) + 0.06;
        float v = acc * dt * phase * uDensity;
        gl_FragColor = vec4(vec3(v), 1.0);
      }
    `, {
      tDepth: { value: null }, uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() },
      uTime: { value: 0 }, uDensity: { value: 0.012 },
      uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
      uShadowMap: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() }, uShadowTexel: { value: new THREE.Vector2() },
    });
    this.blur = new FSPass(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uDir; uniform vec2 uRes;
      void main(){
        vec3 s = vec3(0.0); float w = 0.0;
        for (int i = -4; i <= 4; i++) {
          float wi = exp(-float(i * i) / 8.0);
          s += texture2D(tSrc, vUv + uDir * float(i) / uRes).rgb * wi; w += wi;
        }
        gl_FragColor = vec4(s / w, 1.0);
      }
    `, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() } });
  }
  setSize(w, h) {
    this.rt.setSize(w, h); this.rt2.setSize(w, h);
    this.blur.uniforms.uRes.value.set(w, h);
  }
  render(renderer) {
    this.march.render(renderer, this.rt);
    this.blur.uniforms.tSrc.value = this.rt.texture; this.blur.uniforms.uDir.value.set(1, 0);
    this.blur.render(renderer, this.rt2);
    this.blur.uniforms.tSrc.value = this.rt2.texture; this.blur.uniforms.uDir.value.set(0, 1);
    this.blur.render(renderer, this.rt);
    return this.rt.texture;
  }
}
