import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { config, QS } from '../config.js';
import { shared } from '../util/patch.js';

export function sunDirection(out = new THREE.Vector3()) {
  const az = THREE.MathUtils.degToRad(config.sun.azimuth);
  const el = THREE.MathUtils.degToRad(config.sun.elevation);
  return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az)).normalize();
}

export function createLighting(renderer, scene) {
  const sun = new THREE.DirectionalLight(config.sun.color, config.sun.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QS.shadowMap, QS.shadowMap);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2.5;
  sun.layers.enableAll();
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(config.sky.hemiSky, config.sky.hemiGround, config.sky.hemiIntensity);
  hemi.layers.enableAll();
  scene.add(hemi);

  // Physical sky: visible in the thin strip at the top and in the water reflections.
  const sky = new Sky();
  sky.scale.setScalar(900);
  const su = sky.material.uniforms;
  su.turbidity.value = 4.5;
  su.rayleigh.value = 1.4;
  su.mieCoefficient.value = 0.006;
  su.mieDirectionalG.value = 0.82;
  if (su.cloudCoverage) { su.cloudCoverage.value = 0.35; su.cloudDensity.value = 0.35; }
  if (su.showSunDisc) su.showSunDisc.value = 0;
  scene.add(sky);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const skyScene = new THREE.Scene();
  const skyForEnv = new Sky();
  skyForEnv.scale.setScalar(900);
  skyScene.add(skyForEnv);
  // a green "ground" hemisphere for the env so reflections below the horizon are foliage-coloured
  const ground = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16, 0, Math.PI * 2, Math.PI / 2 - 0.05, Math.PI / 2 + 0.05),
    new THREE.MeshBasicMaterial({ color: 0x18280f, side: THREE.BackSide }));
  skyScene.add(ground);

  function update() {
    const dir = sunDirection();
    shared.uSunDir.value.copy(dir);
    sun.color.set(config.sun.color);
    sun.intensity = config.sun.intensity;
    hemi.color.set(config.sky.hemiSky);
    hemi.groundColor.set(config.sky.hemiGround);
    hemi.intensity = config.sky.hemiIntensity;
    // fit an orthographic shadow frustum tightly around the garden
    const center = new THREE.Vector3(0.5, 0, -3);
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(dir, 30);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
    const view = new THREE.Matrix4().lookAt(sun.position, center, new THREE.Vector3(0, 1, 0));
    const inv = view.clone().invert();
    const box = new THREE.Box3(new THREE.Vector3(-11, -1.3, -14.5), new THREE.Vector3(10, 10, 8));
    const lb = new THREE.Box3();
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      p.sub(sun.position).applyMatrix4(inv.clone().setPosition(0, 0, 0));
      lb.expandByPoint(p);
    }
    const cam = sun.shadow.camera;
    cam.left = lb.min.x; cam.right = lb.max.x; cam.bottom = lb.min.y; cam.top = lb.max.y;
    cam.near = Math.max(0.1, -lb.max.z); cam.far = -lb.min.z + 1;
    cam.updateProjectionMatrix();

    const sp = dir.clone().multiplyScalar(100);
    su.sunPosition.value.copy(sp);
    const eu = skyForEnv.material.uniforms;
    eu.sunPosition.value.copy(sp);
    eu.turbidity.value = su.turbidity.value; eu.rayleigh.value = su.rayleigh.value;
    eu.mieCoefficient.value = su.mieCoefficient.value; eu.mieDirectionalG.value = su.mieDirectionalG.value;
    if (eu.cloudCoverage) { eu.cloudCoverage.value = su.cloudCoverage.value; eu.cloudDensity.value = su.cloudDensity.value; }
    if (eu.showSunDisc) eu.showSunDisc.value = 0;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(skyScene, 0.02);
    scene.environment = envRT.texture;
    scene.environmentIntensity = config.sky.envIntensity;
  }
  update();
  return { sun, hemi, sky, update };
}
