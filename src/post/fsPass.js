import * as THREE from 'three';

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const triangle = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
})();

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Minimal full-screen shader pass. */
export class FSPass {
  constructor(fragmentShader, uniforms = {}, opts = {}) {
    this.uniforms = uniforms;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: 'varying vec2 vUv;\n' + fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
      blending: opts.blending ?? THREE.NoBlending,
      transparent: !!opts.blending,
      defines: opts.defines || {},
    });
    this.mesh = new THREE.Mesh(triangle, this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }
  render(renderer, target, clear = true) {
    renderer.setRenderTarget(target);
    const ac = renderer.autoClear;
    renderer.autoClear = clear;
    renderer.render(this.scene, camera);
    renderer.autoClear = ac;
  }
}
