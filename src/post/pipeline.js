import * as THREE from 'three';
import { AOPass } from './ao.js';
import { GodRaysPass } from './godrays.js';
import { BloomPass, DOFPass, FinalPass, FXAAPass } from './finalPasses.js';
import { Motes } from './motes.js';
import { WaterPass } from '../water/waterPass.js';
import { config, QS } from '../config.js';

const hdrOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };

/**
 * Frame graph:
 *  ripples → planar reflection (mirrored camera, clip y<0) → opaque scene (colour + depth, MSAA)
 *  → AO (½) → god rays (¼) → water composite (+haze, shafts) → motes → DOF → bloom → ACES/grade → screen
 */
export class Pipeline {
  constructor(renderer, scene, camera, { sun, ripples, hideInReflection = [] }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sun = sun;
    this.ripples = ripples;
    this.hideInReflection = hideInReflection;
    this.frame = 0;

    const depthTex = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.mainRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: QS.msaa, depthBuffer: true, depthTexture: depthTex });
    this.reflRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
    this.compRT = new THREE.WebGLRenderTarget(1, 1, hdrOpts);
    this.dofRT = new THREE.WebGLRenderTarget(1, 1, hdrOpts);
    this.reflCam = camera.clone();
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.03);

    this.ao = new AOPass(QS.aoSamples);
    this.god = new GodRaysPass();
    this.water = new WaterPass();
    this.bloom = new BloomPass();
    this.dof = new DOFPass();
    this.final = new FinalPass();
    this.fxaa = new FXAAPass();
    this.ldrRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.motes = new Motes(QS.motes);
    this.whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.whiteTex.needsUpdate = true;
    this.blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blackTex.needsUpdate = true;
    this.tmpC = new THREE.Color();
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.mainRT.setSize(w, h);
    this.reflRT.setSize(Math.round(w * QS.reflScale), Math.round(h * QS.reflScale));
    this.compRT.setSize(w, h);
    this.dofRT.setSize(w, h);
    this.ldrRT.setSize(w, h);
    this.fxaa.uniforms = this.fxaa.pass.uniforms;
    this.fxaa.pass.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.ao.setSize(Math.round(w * QS.aoScale), Math.round(h * QS.aoScale));
    this.god.setSize(Math.round(w / 4), Math.round(h / 4));
    this.bloom.setSize(w, h);
    this.motes.uniforms.uRes.value.set(w, h);
    this.motes.uniforms.uPixelRatio.value = h / 900;
    this.final.pass.uniforms.uRes.value.set(w, h);
    this.dof.pass.uniforms.uRes.value.set(w, h);
  }

  updateReflectionCamera() {
    const cam = this.camera, rc = this.reflCam;
    cam.updateMatrixWorld();
    const pos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(pos);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(rot);
    rc.position.set(pos.x, -pos.y, pos.z);
    rc.up.set(up.x, -up.y, up.z);
    rc.lookAt(fwd.x, -fwd.y, fwd.z);
    rc.fov = cam.fov; rc.aspect = cam.aspect; rc.near = cam.near; rc.far = cam.far;
    rc.updateProjectionMatrix();
    rc.updateMatrixWorld();
  }

  render(time, dt) {
    const r = this.renderer, scene = this.scene, cam = this.camera;
    const P = config.post, W = config.water;
    this.frame++;
    const gl = r.getContext();
    const prof = this.profile ? {} : null;
    let t0 = performance.now();
    const mark = (k) => { if (!prof) return; gl.finish(); const t = performance.now(); prof[k] = (prof[k] || 0) + t - t0; t0 = t; };

    // 1. ripple simulation
    this.ripples.update(r);
    mark('ripples');

    // 2. planar reflection (camera is fixed: refreshing every N frames is visually identical apart from wind)
    this.updateReflectionCamera();
    if (this.frame % QS.reflEvery === 0 || this.frame < 3) {
    r.shadowMap.needsUpdate = false;
    for (const o of this.hideInReflection) o.visible = false;
    r.clippingPlanes = [this.clipPlane];
    r.setRenderTarget(this.reflRT);
    r.clear();
    r.render(scene, this.reflCam);
    r.clippingPlanes = [];
    for (const o of this.hideInReflection) o.visible = true;
    }
    mark('reflection');

    // 3. opaque scene
    r.shadowMap.needsUpdate = this.frame % QS.shadowEvery === 0 || this.frame < 3;
    r.setRenderTarget(this.mainRT);
    r.clear();
    r.render(scene, cam);
    const depth = this.mainRT.depthTexture;
    mark('main+shadow');

    // shared camera / light uniforms
    const sun = this.sun;
    const sunColor = this.tmpC.copy(sun.color).multiplyScalar(sun.intensity);
    const sunV = new THREE.Vector3(sunColor.r, sunColor.g, sunColor.b);
    const sunDir = new THREE.Vector3().subVectors(sun.position, sun.target.position).normalize();
    const shadowTex = sun.shadow.map ? sun.shadow.map.depthTexture : null;

    // 4. AO
    let aoTex = this.whiteTex;
    if (P.ao > 0) {
      this.ao.ao.uniforms.uInvView.value.copy(cam.matrixWorld);
      aoTex = this.ao.render(r, depth, cam);
    }
    mark('ao');

    // 5. god rays
    let godTex = this.blackTex;
    if (P.godRays > 0 && shadowTex) {
      const g = this.god.march.uniforms;
      g.tDepth.value = depth;
      g.uCamPos.value.copy(cam.position);
      g.uSunDir.value.copy(sunDir);
      g.uTime.value = time;
      g.uInvProj.value.copy(cam.projectionMatrixInverse);
      g.uInvView.value.copy(cam.matrixWorld);
      g.uShadowMap.value = shadowTex;
      g.uShadowMatrix.value.copy(sun.shadow.matrix);
      godTex = this.god.render(r);
    }
    mark('godrays');

    // 6. water composite
    const u = this.water.uniforms;
    u.tScene.value = this.mainRT.texture;
    u.tDepth.value = depth;
    u.tAO.value = aoTex;
    u.tRefl.value = this.reflRT.texture;
    u.tRipple.value = this.ripples.texture;
    u.tShafts.value = godTex;
    u.uShadowMap.value = shadowTex;
    u.uShadowMatrix.value.copy(sun.shadow.matrix);
    u.uShadowTexel.value.set(1 / sun.shadow.mapSize.x, 1 / sun.shadow.mapSize.y);
    u.uInvProj.value.copy(cam.projectionMatrixInverse);
    u.uInvView.value.copy(cam.matrixWorld);
    u.uReflVP.value.multiplyMatrices(this.reflCam.projectionMatrix, this.reflCam.matrixWorldInverse);
    u.uCamPos.value.copy(cam.position);
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sunV);
    const sky = new THREE.Color(config.sky.hemiSky).multiplyScalar(config.sky.hemiIntensity);
    u.uSkyColor.value.set(sky.r, sky.g, sky.b);
    u.uTime.value = time;
    const deep = new THREE.Color(W.deepColor), sh = new THREE.Color(W.shallowTint);
    u.uDeep.value.set(deep.r, deep.g, deep.b);
    u.uShallow.value.set(sh.r, sh.g, sh.b);
    u.uAbsorb.value.set(...W.absorption);
    u.uScatter.value = W.scatter;
    u.uWaveSpeed.value = W.waveSpeed;
    u.uWaveStr.value = W.waveStrength;
    u.uReflStr.value = W.reflectionStrength;
    u.uRefr.value = W.refraction;
    u.uGlitter.value = W.glitter;
    u.uRippleStr.value = W.rippleStrength;
    u.uAOStr.value = P.ao;
    u.uHaze.value = P.haze;
    u.uShaftStr.value = P.godRays;
    u.uShaftColor.value.copy(sunV);
    const hz = new THREE.Color(0.42, 0.52, 0.5).multiplyScalar(config.sky.hemiIntensity * 0.9);
    u.uHazeColor.value.set(hz.r, hz.g, hz.b);
    this.water.render(r, this.compRT);
    mark('water');

    // 7. motes
    const mu = this.motes.uniforms;
    mu.uTime.value = time;
    mu.tDepth.value = depth;
    mu.uShadowMap.value = shadowTex;
    mu.uShadowMatrix.value.copy(sun.shadow.matrix);
    mu.uSunColor.value.copy(sunV);
    mu.uSunDir.value.copy(sunDir);
    mu.uNear.value = cam.near; mu.uFar.value = cam.far;
    if (shadowTex) {
      r.setRenderTarget(this.compRT);
      r.autoClear = false;
      r.render(this.motes.scene, cam);
      r.autoClear = true;
    }
    mark('motes');

    // 8. depth of field
    let src = this.compRT.texture;
    if (P.dof > 0) {
      const d = this.dof.pass.uniforms;
      d.tSrc.value = src; d.tDepth.value = depth; d.uFocusFar.value = P.focusFar; d.uAmount.value = P.dof;
      d.uInvProj.value.copy(cam.projectionMatrixInverse);
      d.uMaxPx.value = 4.5 * (this.h / 900);
      this.dof.pass.render(r, this.dofRT);
      src = this.dofRT.texture;
    }
    mark('dof');

    // 9. bloom + 10. final grade
    const bloomTex = this.bloom.render(r, src, P.bloomThreshold);
    mark('bloom');
    const f = this.final.pass.uniforms;
    f.tSrc.value = src; f.tBloom.value = bloomTex;
    f.uExposure.value = P.exposure; f.uBloom.value = P.bloom; f.uVignette.value = P.vignette;
    f.uSaturation.value = P.saturation; f.uContrast.value = P.contrast; f.uGrain.value = P.grain; f.uTime.value = time;
    this.final.pass.render(r, this.ldrRT);
    this.fxaa.pass.uniforms.tSrc.value = this.ldrRT.texture;
    this.fxaa.pass.render(r, null);
    mark('final');
    if (prof) { this.profAcc = this.profAcc || { n: 0 }; this.profAcc.n++; for (const k in prof) this.profAcc[k] = (this.profAcc[k] || 0) + prof[k]; }
  }
}
