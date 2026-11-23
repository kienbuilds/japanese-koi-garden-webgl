import * as THREE from 'three';
import { config, QS, QUALITY, DEBUG } from './config.js';
import { shared } from './util/patch.js';
import { createLighting } from './scene/lighting.js';
import { createTerrain } from './scene/terrain.js';
import { createBackdrop } from './scene/backdrop.js';
import { createRocks } from './scene/rocks.js';
import { createBridge, createToro, createLamp, createHouse } from './scene/structures.js';
import { createVegetation } from './vegetation/plants.js';
import { FloatingLeaves } from './vegetation/floatingLeaves.js';
import { KoiSchool } from './koi/koi.js';
import { Ripples } from './water/ripples.js';
import { Pipeline } from './post/pipeline.js';
import { setupGui } from './gui.js';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(config.camera.fov, innerWidth / innerHeight, 0.1, 400);
camera.position.set(...config.camera.position);
camera.lookAt(new THREE.Vector3(...config.camera.target));

const lighting = createLighting(renderer, scene);
scene.add(createTerrain());
scene.add(createBackdrop());
const rocks = createRocks();
scene.add(rocks.mesh);
const bridge = createBridge();
scene.add(bridge.group);
scene.add(createToro());
scene.add(createLamp());
scene.add(createHouse());
const veg = createVegetation();
scene.add(veg.group);

const ripples = new Ripples(256);
const koi = new KoiSchool(config.koi.count, [...rocks.obstacles, ...bridge.obstacles], ripples);
scene.add(koi.mesh);
const leaves = new FloatingLeaves(12);
scene.add(leaves.mesh);

const pipeline = new Pipeline(renderer, scene, camera, { sun: lighting.sun, ripples, hideInReflection: [koi.mesh, leaves.mesh, veg.forest].filter(Boolean) });

let controls = null;
if (DEBUG) {
  import('three/addons/controls/OrbitControls.js').then(({ OrbitControls }) => {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...config.camera.target);
    controls.update();
  });
}

function resize() {
  const pr = Math.min(window.devicePixelRatio || 1, 2) * QS.pixelRatio;
  renderer.setPixelRatio(Math.min(pr, 3200 / innerWidth));
  renderer.setSize(innerWidth, innerHeight);
  const v = renderer.getDrawingBufferSize(new THREE.Vector2());
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipeline.setSize(v.x, v.y);
}
resize();
addEventListener('resize', resize);

const gui = setupGui({ lighting, pipeline });

// FPS meter
const fpsEl = document.getElementById('fps');
let frames = 0, acc = 0, fps = 0;
const stats = { fps: 0, frameMs: 0, quality: QUALITY };
window.__koi = { stats, config, renderer, scene, pipeline, veg, koi };

const timer = new THREE.Timer();
let time = 0;
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  time += dt;
  shared.uTime.value = time;
  shared.uWind.value = config.wind.strength;
  shared.uWindSpeed.value = config.wind.speed;
  shared.uAbsorb.value.set(...config.water.absorption);
  koi.update(dt);
  leaves.update(dt);
  if (controls) controls.update();
  pipeline.render(time, dt);
  frames++; acc += dt;
  if (acc >= 0.5) {
    fps = frames / acc; frames = 0; acc = 0;
    stats.fps = fps; stats.frameMs = 1000 / fps;
    if (gui.visible) fpsEl.textContent = `${fps.toFixed(0)} fps · ${QUALITY}`;
  }
  if (!window.__koiReady && time > 0.3) window.__koiReady = true;
});
