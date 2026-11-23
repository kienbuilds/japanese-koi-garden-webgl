import * as THREE from 'three';
import { makeRng } from '../util/rng.js';

/**
 * Dust motes floating in the sunbeams. Rendered after the water composite with a manual
 * depth test against the scene depth, lit only where the shadow map says the sun reaches.
 */
export class Motes {
  constructor(count = 300) {
    const rng = makeRng(31337);
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([rng.range(-4, 6), rng.range(0.15, 3.2), rng.range(-3.5, 5.5)], i * 3);
      seed[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = {
      uTime: { value: 0 }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() },
      uShadowMap: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() }, uSunColor: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3() }, uNear: { value: 0.1 }, uFar: { value: 200 }, uPixelRatio: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime; uniform sampler2DShadow uShadowMap; uniform mat4 uShadowMatrix; uniform float uPixelRatio;
        uniform vec3 uSunDir;
        varying float vLit; varying float vViewZ; varying float vSeed;
        void main(){
          vec3 p = position;
          float t = uTime * 0.12 + aSeed * 50.0;
          p += vec3(sin(t * 1.1 + aSeed * 7.0), sin(t * 0.7 + aSeed * 3.0) * 0.6 + 0.15 * sin(t*0.3), cos(t * 0.9 + aSeed * 5.0)) * 0.35;
          vec4 sc = uShadowMatrix * vec4(p, 1.0);
          vec3 c = sc.xyz / sc.w;
          float lit = 1.0;
          if (c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0 && c.z < 1.0) lit = texture(uShadowMap, vec3(c.xy, c.z - 0.001));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vViewZ = -mv.z;
          float fwd = pow(max(dot(normalize(p - cameraPosition), uSunDir), 0.0), 3.0);
          vLit = lit * fwd * (0.55 + 0.45 * sin(uTime * (0.8 + aSeed) + aSeed * 30.0));
          vSeed = aSeed;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((1.6 + aSeed * 2.2) * uPixelRatio * 6.0 / vViewZ, 1.0, 6.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D tDepth; uniform vec2 uRes; uniform vec3 uSunColor; uniform float uNear; uniform float uFar;
        varying float vLit; varying float vViewZ; varying float vSeed;
        float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
        void main(){
          vec2 q = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(q));
          float sd = linZ(texture2D(tDepth, gl_FragCoord.xy / uRes).x);
          if (sd < vViewZ) discard;
          gl_FragColor = vec4(uSunColor * 0.03 * a * vLit, 1.0);
        }
      `,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.points);
  }
}
