import * as THREE from 'three';
import { FSPass } from './fsPass.js';
import { RECON_GLSL } from '../water/waterPass.js';

const hdr = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };

/** Dual-filter bloom (bright-pass + 5-level down/up chain). */
export class BloomPass {
  constructor(levels = 5) {
    this.levels = levels;
    this.down = [];
    this.up = [];
    for (let i = 0; i < levels; i++) { this.down.push(new THREE.WebGLRenderTarget(1, 1, hdr)); this.up.push(new THREE.WebGLRenderTarget(1, 1, hdr)); }
    this.bright = new FSPass(/* glsl */`
      uniform sampler2D tSrc; uniform float uThreshold; uniform vec2 uTexel;
      void main(){
        vec3 c = vec3(0.0);
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
        c *= 0.25;
        float l = max(c.r, max(c.g, c.b));
        float k = max(0.0, l - uThreshold) / max(l, 1e-4);
        gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
      }
    `, { tSrc: { value: null }, uThreshold: { value: 1.5 }, uTexel: { value: new THREE.Vector2() } });
    this.ds = new FSPass(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel;
      void main(){
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }
    `, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.us = new FSPass(/* glsl */`
      uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel;
      void main(){
        vec3 c = vec3(0.0);
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, 0.0)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(0.0,  1.0)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
        gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
      }
    `, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
  }
  setSize(w, h) {
    let cw = Math.max(1, w >> 1), ch = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      this.down[i].setSize(cw, ch); this.up[i].setSize(cw, ch);
      cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
    }
  }
  render(renderer, src, threshold) {
    const b = this.bright.uniforms;
    b.tSrc.value = src; b.uThreshold.value = threshold;
    b.uTexel.value.set(1 / this.down[0].width / 2, 1 / this.down[0].height / 2);
    this.bright.render(renderer, this.down[0]);
    for (let i = 1; i < this.levels; i++) {
      this.ds.uniforms.tSrc.value = this.down[i - 1].texture;
      this.ds.uniforms.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      this.ds.render(renderer, this.down[i]);
    }
    let prev = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      this.us.uniforms.tSrc.value = prev.texture;
      this.us.uniforms.tAdd.value = this.down[i].texture;
      this.us.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
      this.us.render(renderer, this.up[i]);
      prev = this.up[i];
    }
    return prev.texture;
  }
}

/** Depth of field: background-only circle of confusion, golden-angle gather. */
export class DOFPass {
  constructor() {
    this.pass = new FSPass(/* glsl */`
      ${RECON_GLSL}
      uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uFocusFar; uniform float uAmount; uniform float uMaxPx;
      float coc(vec2 uv){
        float d = textureLod(tDepth, uv, 0.0).x;
        float z = d >= 0.999999 ? 400.0 : -viewPosFromDepth(uv, d).z;
        return smoothstep(uFocusFar, uFocusFar * 2.8, z) * uAmount;
      }
      void main(){
        float c0 = coc(vUv);
        vec3 base = texture2D(tSrc, vUv).rgb;
        if (c0 < 0.02) { gl_FragColor = vec4(base, 1.0); return; }
        vec3 acc = base; float w = 1.0;
        float r = c0 * uMaxPx;
        for (int i = 0; i < 20; i++) {
          float fi = (float(i) + 0.5) / 20.0;
          float a = float(i) * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * sqrt(fi) * r / uRes;
          float cs = coc(vUv + o);
          float wi = smoothstep(0.0, 0.3, cs);       // do not pull sharp foreground into the blur
          acc += textureLod(tSrc, vUv + o, 0.0).rgb * wi; w += wi;
        }
        gl_FragColor = vec4(acc / w, 1.0);
      }
    `, {
      tSrc: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uFocusFar: { value: 11 },
      uAmount: { value: 1 }, uMaxPx: { value: 5 }, uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
    });
  }
}

/** Exposure, bloom mix, ACES, grading, vignette, grain, sRGB. */
export class FinalPass {
  constructor() {
    this.pass = new FSPass(/* glsl */`
      uniform sampler2D tSrc; uniform sampler2D tBloom;
      uniform float uExposure, uBloom, uVignette, uSaturation, uContrast, uGrain, uTime;
      uniform vec2 uRes;
      // ACES fitted (Stephen Hill)
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 ACES(vec3 c){
        const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        c = inM * c; c = RRTAndODTFit(c); c = outM * c; return clamp(c, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(tSrc, vUv).rgb;
        c += texture2D(tBloom, vUv).rgb * uBloom;
        c *= uExposure;
        // grade in linear: deep greens, slightly warm highlights, cool-green shadows
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSaturation);
        c *= mix(vec3(0.94, 1.02, 0.98), vec3(1.04, 1.0, 0.94), smoothstep(0.05, 0.6, l));
        c = ACES(c * 1.1);
        // contrast around mid grey (display space-ish)
        c = pow(c, vec3(uContrast));
        vec2 q = vUv - 0.5;
        float vig = 1.0 - dot(q * vec2(1.15, 1.0), q * vec2(1.15, 1.0)) * uVignette * 2.2;
        c *= clamp(vig, 0.0, 1.0);
        vec3 s = toSRGB(c);
        s += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
        gl_FragColor = vec4(s, 1.0);
      }
    `, {
      tSrc: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.1 }, uVignette: { value: 0.3 },
      uSaturation: { value: 1 }, uContrast: { value: 1.05 }, uGrain: { value: 0.02 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() },
    });
  }
}

/** FXAA (luma-based, after tone mapping) — cleans foliage alpha edges and thin koi fins. */
export class FXAAPass {
  constructor() {
    this.pass = new FSPass(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel;
      float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
      void main(){
        vec3 rgbM = texture2D(tSrc, vUv).rgb;
        float lM = luma(rgbM);
        float lNW = luma(texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb);
        float lNE = luma(texture2D(tSrc, vUv + vec2( 1.0, -1.0) * uTexel).rgb);
        float lSW = luma(texture2D(tSrc, vUv + vec2(-1.0,  1.0) * uTexel).rgb);
        float lSE = luma(texture2D(tSrc, vUv + vec2( 1.0,  1.0) * uTexel).rgb);
        float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
        float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
        if (lMax - lMin < max(0.03, lMax * 0.1)) { gl_FragColor = vec4(rgbM, 1.0); return; }
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
        float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
        float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
        dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
        vec3 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
        vec3 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);
        float lB = luma(b);
        gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
      }
    `, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  }
}
