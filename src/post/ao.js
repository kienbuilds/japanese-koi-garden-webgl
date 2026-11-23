import * as THREE from 'three';
import { FSPass } from './fsPass.js';
import { RECON_GLSL } from '../water/waterPass.js';

/** Depth-only scalable ambient obscurance (half resolution) + depth-aware blur. */
export class AOPass {
  constructor(samples = 10) {
    const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rt2 = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.ao = new FSPass(/* glsl */`
      ${RECON_GLSL}
      uniform sampler2D tDepth; uniform vec2 uRes; uniform float uRadius; uniform float uIntensity; uniform float uProjScale;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        float d = texture2D(tDepth, vUv).x;
        if (d >= 0.999999) { gl_FragColor = vec4(1.0, -1e4, 0.0, 1.0); return; }
        vec3 P = viewPosFromDepth(vUv, d);
        vec2 px = 1.0 / uRes;
        vec3 Px = viewPosFromDepth(vUv + vec2(px.x, 0.0), texture2D(tDepth, vUv + vec2(px.x, 0.0)).x);
        vec3 Py = viewPosFromDepth(vUv + vec2(0.0, px.y), texture2D(tDepth, vUv + vec2(0.0, px.y)).x);
        vec3 Pxm = viewPosFromDepth(vUv - vec2(px.x, 0.0), texture2D(tDepth, vUv - vec2(px.x, 0.0)).x);
        vec3 Pym = viewPosFromDepth(vUv - vec2(0.0, px.y), texture2D(tDepth, vUv - vec2(0.0, px.y)).x);
        vec3 dx = abs(Px.z - P.z) < abs(Pxm.z - P.z) ? Px - P : P - Pxm;
        vec3 dy = abs(Py.z - P.z) < abs(Pym.z - P.z) ? Py - P : P - Pym;
        vec3 N = normalize(cross(dx, dy));
        float rad = uRadius * uProjScale / -P.z;            // radius in uv units
        rad = min(rad, 0.08);
        float ang0 = hash(gl_FragCoord.xy) * 6.2831;
        float occ = 0.0;
        const int S = SAMPLES;
        for (int i = 0; i < S; i++) {
          float fi = (float(i) + 0.5) / float(S);
          float a = ang0 + float(i) * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * rad * sqrt(fi);
          o.x *= uRes.y / uRes.x;
          vec2 suv = vUv + o;
          float sd = textureLod(tDepth, suv, 0.0).x;
          vec3 Q = viewPosFromDepth(suv, sd);
          vec3 v = Q - P;
          float vv = dot(v, v), vn = dot(v, N);
          float fall = max(0.0, 1.0 - vv / (uRadius * uRadius * 4.0));
          occ += max(0.0, vn + P.z * 0.002) / (vv + 0.02) * fall;
        }
        float ao = max(0.0, 1.0 - occ / float(S) * uIntensity * uRadius);
        gl_FragColor = vec4(pow(ao, 1.4), P.z, 0.0, 1.0);
      }
    `, {
      tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uRadius: { value: 0.35 }, uIntensity: { value: 1.6 },
      uProjScale: { value: 1 }, uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
    }, { defines: { SAMPLES: samples } });
    this.blur = new FSPass(/* glsl */`
      uniform sampler2D tAO; uniform vec2 uDir; uniform vec2 uRes;
      void main(){
        vec4 c = texture2D(tAO, vUv);
        float z = c.g; float sum = c.r; float w = 1.0;
        for (int i = -3; i <= 3; i++) {
          if (i == 0) continue;
          vec2 uv = vUv + uDir * float(i) / uRes;
          vec4 s = texture2D(tAO, uv);
          float wi = exp(-abs(s.g - z) * 4.0 / max(0.5, -z * 0.15)) * (1.0 - abs(float(i)) / 4.0);
          sum += s.r * wi; w += wi;
        }
        gl_FragColor = vec4(sum / w, z, 0.0, 1.0);
      }
    `, { tAO: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2() } });
  }

  setSize(w, h) {
    this.rt.setSize(w, h);
    this.rt2.setSize(w, h);
    this.ao.uniforms.uRes.value.set(w, h);
    this.blur.uniforms.uRes.value.set(w, h);
  }

  render(renderer, depthTex, camera) {
    const u = this.ao.uniforms;
    u.tDepth.value = depthTex;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uProjScale.value = camera.projectionMatrix.elements[5] * 0.5;
    this.ao.render(renderer, this.rt);
    this.blur.uniforms.tAO.value = this.rt.texture;
    this.blur.uniforms.uDir.value.set(1, 0);
    this.blur.render(renderer, this.rt2);
    this.blur.uniforms.tAO.value = this.rt2.texture;
    this.blur.uniforms.uDir.value.set(0, 1);
    this.blur.render(renderer, this.rt);
    return this.rt.texture;
  }
}
