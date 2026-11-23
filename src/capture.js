import * as THREE from 'three';
import { config } from './config.js';

/*
 * Video capture mode (?capture&q=high): renders the intro film frame by frame at a fixed time step.
 * scripts/record.mjs calls window.__cap.frame(i) and receives a JPEG data URL per frame.
 *
 *  0–7 s    close-up: skimming the water surface
 *  7–14 s   close-up: wind in the pines and clipped bushes
 * 14–23 s   following a koi until it rises and rings the surface
 * 23–26 s   camera glides back to the fixed garden view
 * 26–46 s   colour "looks", hard cut on the loudest snare crack of every bar (every 3 s)
 * 50–52 s   title, fade to black
 */
export const FPS = Number(new URLSearchParams(location.search).get('fps')) || 60;
export const DURATION = 52;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (u) => u * u * (3 - 2 * u);

const FIXED = { pos: V(...config.camera.position), target: V(...config.camera.target), fov: config.camera.fov };

const SHOTS = [
  { from: 0, to: 7, fov: 48, p0: V(2.5, 0.34, 3.7), p1: V(1.1, 0.27, 2.1), t0: V(0.0, 0.02, -0.9), t1: V(-0.7, 0.12, -1.5) },
  { from: 7, to: 14, fov: 46, p0: V(1.7, 1.0, 0.7), p1: V(0.6, 1.25, 0.25), t0: V(2.5, 1.35, -2.8), t1: V(0.9, 2.6, -3.6), wind: 1.9 },
];
const FOLLOW = { from: 14, to: 23, fov: 50, surfaceAt: 15.0 };
const RETURN = { from: 23, to: 26 };
const GRADE_START = 26;
// Cuts land on the loudest snare "crack" of each bar in the soundtrack (zephiramusic "Lofi Focus", sped to 80 BPM, offset 0.84 s),
// measured from the muxed audio. LOOK_SEQ[i] is the look shown from CUTS[i] on (index into LOOKS).
const CUTS = [27.842, 30.85, 33.833, 36.851, 39.844, 42.843, 45.841];
const LOOK_SEQ = [1, 2, 3, 4, 5, 6, 0];
function lookAt(t) {
  if (t < GRADE_START) return -1;
  let k = 0;
  for (let i = 0; i < CUTS.length; i++) if (t >= CUTS[i]) k = LOOK_SEQ[i];
  return k;
}

// Each look starts from the defaults and overrides a few values.
const LOOKS = [
  { name: 'mặc định' },
  { name: 'trưa nắng', sun: { elevation: 70, azimuth: 70, intensity: 7.0, color: '#fff6e8' }, sky: { hemiSky: '#cfe2ff', hemiIntensity: 1.0 }, post: { exposure: 1.3, saturation: 1.12, contrast: 1.04, haze: 0.4 }, water: { absorption: [0.75, 0.55, 0.95] } },
  { name: 'hoàng hôn', sun: { elevation: 9, azimuth: 30, intensity: 4.6, color: '#ffa25a' }, sky: { hemiSky: '#ffc89a', hemiGround: '#4a3a1c', hemiIntensity: 0.5 }, post: { exposure: 1.45, saturation: 1.18, contrast: 1.12, godRays: 1.6 } },
  { name: 'âm u sương', sun: { intensity: 1.1, color: '#e8eef0' }, sky: { hemiSky: '#cdd8de', hemiIntensity: 1.35 }, post: { haze: 4.5, godRays: 0, saturation: 0.82, contrast: 0.94, exposure: 1.2 }, water: { glitter: 0.2 } },
  { name: 'chạng vạng', sun: { elevation: 7, azimuth: 40, intensity: 2.4, color: '#ff8a70' }, sky: { hemiSky: '#7f8fd8', hemiGround: '#2a3048', hemiIntensity: 1.25 }, post: { exposure: 2.6, saturation: 0.95, contrast: 1.06, vignette: 0.42, godRays: 1.4 } },
  { name: 'phim cổ', sun: { color: '#ffe2b8' }, post: { saturation: 0.58, contrast: 0.9, grain: 0.085, vignette: 0.72, exposure: 1.22 } },
  { name: 'rực rỡ', sun: { intensity: 6.0 }, sky: { hemiIntensity: 0.82 }, post: { saturation: 1.42, contrast: 1.18, exposure: 1.32, bloom: 0.16 } },
  { name: 'mặc định' },
];

const clone = (o) => JSON.parse(JSON.stringify(o));
function assignDeep(dst, src) {
  for (const k of Object.keys(src)) {
    if (Array.isArray(src[k])) src[k].forEach((v, i) => { dst[k][i] = v; });
    else if (src[k] && typeof src[k] === 'object') assignDeep(dst[k], src[k]);
    else dst[k] = src[k];
  }
}

export function setupCapture({ renderer, camera, koi, lighting, step }) {
  const defaults = clone(config);
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  const dt = 1 / FPS;
  let currentLook = -1;
  let followFish = null;
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  const returnFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };

  const applyLook = (i) => {
    if (i === currentLook) return;
    currentLook = i;
    assignDeep(config, defaults);
    if (i >= 0) assignDeep(config, LOOKS[i]);
    delete config.name;
    lighting.update();
  };
  const setCam = (pos, target, fov) => {
    camera.position.copy(pos);
    camera.lookAt(target);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  };

  function pose(t) {
    for (const s of SHOTS) {
      if (t >= s.from && t < s.to) {
        const u = ease((t - s.from) / (s.to - s.from));
        config.wind.strength = s.wind ?? defaults.wind.strength;
        return setCam(camPos.lerpVectors(s.p0, s.p1, u), camTgt.lerpVectors(s.t0, s.t1, u), s.fov);
      }
    }
    config.wind.strength = defaults.wind.strength;
    if (t >= FOLLOW.from && t < FOLLOW.to) {
      if (!followFish) {
        // a large red-and-white koi near the middle of the pond
        followFish = koi.fish.reduce((best, f) => {
          const score = Math.hypot(f.pos.x - 0.8, f.pos.z - 2.6) - f.len * 2;
          return !best || score < best.score ? { f, score } : best;
        }, null).f;
        camPos.copy(followFish.pos).addScaledVector(followFish.dir, -0.9).add(V(0, 1.15, 0));
        camTgt.copy(followFish.pos);
      }
      const f = followFish;
      if (t >= FOLLOW.surfaceAt && !f._surfTriggered) { f._surfTriggered = true; f.surf = 5.5; f.gulp = 0; }
      const wantPos = f.pos.clone().addScaledVector(f.dir, -0.85).add(V(0, 1.1, 0));
      wantPos.y = Math.max(wantPos.y, 0.9);
      const wantTgt = f.pos.clone().addScaledVector(f.dir, 0.35);
      camPos.lerp(wantPos, 0.035);
      camTgt.lerp(wantTgt, 0.08);
      setCam(camPos, camTgt, FOLLOW.fov);
      returnFrom.pos.copy(camPos); returnFrom.target.copy(camTgt); returnFrom.fov = FOLLOW.fov;
      return;
    }
    if (t >= RETURN.from && t < RETURN.to) {
      const u = ease((t - RETURN.from) / (RETURN.to - RETURN.from));
      return setCam(camPos.lerpVectors(returnFrom.pos, FIXED.pos, u), camTgt.lerpVectors(returnFrom.target, FIXED.target, u),
        THREE.MathUtils.lerp(returnFrom.fov, FIXED.fov, u));
    }
    setCam(FIXED.pos, FIXED.target, FIXED.fov);
  }

  function overlay(t) {
    // dip to black between the close-up shots
    let black = 0;
    for (const edge of [7, 14]) black = Math.max(black, 1 - Math.min(1, Math.abs(t - edge) / 0.3));
    black = Math.max(black, 1 - Math.min(1, t / 0.6));               // fade in
    black = Math.max(black, THREE.MathUtils.clamp((t - (DURATION - 1)) / 1, 0, 1)); // fade out
    // title
    const ta = THREE.MathUtils.clamp((t - 47.5) / 0.8, 0, 1) * (1 - THREE.MathUtils.clamp((t - (DURATION - 1)) / 1, 0, 1));
    if (ta > 0) {
      const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.55 * ta})`);
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(245,248,240,${ta})`;
      ctx.font = `600 ${Math.round(H * 0.058)}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText('Japanese Koi Garden', W / 2, H * 0.84);
      ctx.fillStyle = `rgba(220,232,214,${0.85 * ta})`;
      ctx.font = `400 ${Math.round(H * 0.024)}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText('WebGL  ·  Three.js  ·  procedural', W / 2, H * 0.89);
    }
    if (black > 0) { ctx.fillStyle = `rgba(0,0,0,${black})`; ctx.fillRect(0, 0, W, H); }
  }

  let frameIndex = -1;
  window.__cap = {
    fps: FPS,
    duration: DURATION,
    totalFrames: Math.round(DURATION * FPS),
    size: [W, H],
    /** let the koi settle and compile shaders before frame 0 */
    warmup(n = 240) { applyLook(-1); setCam(SHOTS[0].p0, SHOTS[0].t0, SHOTS[0].fov); for (let i = 0; i < n; i++) step(dt); return true; },
    /** render frame i (must be called in order) and return it as a JPEG data URL */
    frame(i, quality = 0.92) {
      if (i !== frameIndex + 1) throw new Error(`frames must be sequential (expected ${frameIndex + 1}, got ${i})`);
      frameIndex = i;
      const t = i / FPS;
      applyLook(lookAt(t));
      pose(t);
      step(dt);
      ctx.drawImage(renderer.domElement, 0, 0);
      overlay(t);
      return out.toDataURL('image/jpeg', quality);
    },
  };
  window.__koiReady = true;
}
