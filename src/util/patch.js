import * as THREE from 'three';
import { NOISE, PERTURB, UNDERWATER } from './noise.glsl.js';

// Shared uniforms (time, sun, wind) referenced by every patched material.
export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.7, -0.5).normalize() },
  uAbsorb: { value: new THREE.Vector3(1.5, 0.8, 0.95) },
  uCaustic: { value: 1.0 },
  uWind: { value: 1.0 },
  uWindSpeed: { value: 1.0 },
};

let keyCounter = 0;

/**
 * Patch a built-in material with custom GLSL injected at well-known chunk points.
 * opts: { key, uniforms, vertexPars, vertexNoise, vertexBegin, vertexNormal, vertexWorld,
 *         fragPars, fragColor, fragNormal, fragRough, fragLights, fragEnd,
 *         underwater, lambertWrap }
 */
export function patchMaterial(mat, opts = {}) {
  const key = 'p' + (opts.key || '') + (keyCounter++);
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, opts.uniforms || {});
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', `#include <common>
uniform float uTime; uniform float uWind; uniform float uWindSpeed; uniform vec3 uSunDir;
varying vec3 vWPos; varying vec3 vWNormal;
${opts.vertexNoise ? NOISE : ''}
${opts.vertexPars || ''}`);
    if (opts.vertexBegin) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${opts.vertexBegin}`);
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wp4 = vec4(transformed, 1.0);
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4; wn = mat3(instanceMatrix) * wn;
  #endif
  vWPos = (modelMatrix * wp4).xyz;
  vWNormal = normalize(mat3(modelMatrix) * wn);
}
${opts.vertexWorld || ''}`);
    if (opts.vertexNormal) vs = vs.replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>\n${opts.vertexNormal}`);

    fs = fs.replace('#include <common>', `#include <common>
uniform float uTime; uniform vec3 uSunDir;
varying vec3 vWPos; varying vec3 vWNormal;
${NOISE}
${PERTURB}
${opts.underwater ? UNDERWATER : ''}
${opts.lambertWrap ? 'uniform float uWrap; uniform float uTransl; varying float vTransl;' : ''}
${opts.fragPars || ''}`);
    if (opts.lambertWrap) {
      const chunk = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
        /float dotNL = saturate\( dot\( geometryNormal, directLight\.direction \) \);\s*vec3 irradiance = dotNL \* directLight\.color;/,
        `float ndl = dot( geometryNormal, directLight.direction );
	float wrapD = saturate( (ndl + uWrap) / (1.0 + uWrap) );
	float backLit = pow( saturate( dot( -geometryViewDir, directLight.direction ) ), 2.0 );
	float transl = uTransl * vTransl * (0.25 + 0.75 * saturate(-ndl)) * (0.3 + 1.2 * backLit);
	vec3 irradiance = (wrapD + transl) * directLight.color;`);
      fs = fs.replace('#include <lights_lambert_pars_fragment>', chunk);
    }
    if (opts.fragColor) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${opts.fragColor}`);
    if (opts.fragRough) fs = fs.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${opts.fragRough}`);
    if (opts.fragNormal) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${opts.fragNormal}`);
    if (opts.underwater || opts.fragLights) {
      fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
${opts.underwater ? `{ vec3 uwD = underwaterDirect(vWPos); vec3 uwI = underwaterIndirect(vWPos);
  reflectedLight.directDiffuse *= uwD; reflectedLight.directSpecular *= uwD;
  reflectedLight.indirectDiffuse *= uwI; reflectedLight.indirectSpecular *= uwI; }` : ''}
${opts.fragLights || ''}`);
    }
    if (opts.fragEnd) fs = fs.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${opts.fragEnd}`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
    mat.userData.shader = shader;
  };
  return mat;
}

/** Depth material for shadow casting that shares the vertex deformation. */
export function patchedDepthMaterial(opts = {}, base = {}) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, ...base });
  const key = 'd' + (opts.key || '') + (keyCounter++);
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, opts.uniforms || {});
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>
uniform float uTime; uniform float uWind; uniform float uWindSpeed; uniform vec3 uSunDir;
${opts.vertexNoise ? NOISE : ''}
${opts.vertexPars || ''}`);
    if (opts.vertexBegin) {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 objectNormal = vec3(0.0, 1.0, 0.0);
${opts.vertexBegin}`);
    }
    shader.vertexShader = vs;
  };
  return m;
}
