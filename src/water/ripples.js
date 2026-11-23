import * as THREE from 'three';
import { FSPass } from '../post/fsPass.js';
import { sdfTexture, SDF_BOUNDS } from '../scene/pond.js';

// Ripple buffer: a 2D wave-equation height field over the pond (R = h, G = h_prev).
export const RIPPLE_BOUNDS = new THREE.Vector4(-4.5, -3.0, 12.0, 12.0); // minX, minZ, sizeX, sizeZ
const MAX_DROPS = 8;

export class Ripples {
  constructor(size = 256) {
    this.size = size;
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    this.rtA = new THREE.WebGLRenderTarget(size, size, opts);
    this.rtB = new THREE.WebGLRenderTarget(size, size, opts);
    this.drops = [];
    this.dropU = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4());
    this.pass = new FSPass(/* glsl */`
      uniform sampler2D uPrev; uniform vec2 uTexel; uniform vec4 uDrops[${MAX_DROPS}]; uniform int uCount;
      uniform sampler2D uSDF; uniform vec4 uBounds; uniform vec4 uSdfB;
      void main(){
        vec4 s = texture2D(uPrev, vUv);
        float h = s.r, hp = s.g;
        float l = texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r;
        float r = texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r;
        float d = texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r;
        float u = texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r;
        float lap = l + r + d + u - 4.0 * h;
        float nh = (2.0 * h - hp + 0.09 * lap) * 0.988;
        vec2 wp = uBounds.xy + vUv * uBounds.zw;
        for (int i = 0; i < ${MAX_DROPS}; i++) {
          if (i >= uCount) break;
          vec4 dr = uDrops[i];
          float dd = length(wp - dr.xy);
          nh += dr.w * exp(-dd * dd / (dr.z * dr.z));
        }
        vec2 suv = (wp - uSdfB.xy) / uSdfB.zw;
        float sd = texture2D(uSDF, suv).r;
        nh *= smoothstep(0.08, -0.05, sd);
        gl_FragColor = vec4(nh, h, 0.0, 1.0);
      }
    `, {
      uPrev: { value: null }, uTexel: { value: new THREE.Vector2(1 / size, 1 / size) },
      uDrops: { value: this.dropU }, uCount: { value: 0 },
      uSDF: { value: sdfTexture }, uBounds: { value: RIPPLE_BOUNDS },
      uSdfB: { value: new THREE.Vector4(SDF_BOUNDS.minX, SDF_BOUNDS.minZ, SDF_BOUNDS.maxX - SDF_BOUNDS.minX, SDF_BOUNDS.maxZ - SDF_BOUNDS.minZ) },
    });
  }

  /** Queue a drop at world x,z. radius in metres, strength in metres of displacement. */
  addDrop(x, z, radius = 0.06, strength = 0.02) {
    if (this.drops.length < MAX_DROPS) this.drops.push([x, z, radius, -strength]);
  }

  get texture() { return this.rtA.texture; }

  update(renderer) {
    const u = this.pass.uniforms;
    u.uCount.value = this.drops.length;
    this.drops.forEach((d, i) => this.dropU[i].set(...d));
    this.drops.length = 0;
    u.uPrev.value = this.rtA.texture;
    this.pass.render(renderer, this.rtB);
    [this.rtA, this.rtB] = [this.rtB, this.rtA];
  }
}
