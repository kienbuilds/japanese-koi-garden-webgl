import GUI from 'lil-gui';
import { config, QUALITY } from './config.js';

/** Hidden tweak panel — press G to toggle. */
export function setupGui({ lighting }) {
  const gui = new GUI({ title: 'Hồ koi — tinh chỉnh (G)' });
  gui.hide();
  const state = { visible: false };

  const q = { quality: QUALITY };
  const qualityCtrl = gui.add(q, 'quality', ['low', 'medium', 'high']).name('QUALITY (tải lại)').onChange((v) => {
    const u = new URL(location.href); u.searchParams.set('q', v); location.href = u.toString();
  });

  // Reset every slider/colour to the values it had at load time (the defaults in config.js).
  const RESET_LABEL = '↺ Đặt về mặc định';
  const actions = {
    reset() {
      gui.controllersRecursive().forEach((c) => { if (c !== qualityCtrl && c !== resetCtrl) c.reset(); });
      lighting.update();
      resetCtrl.name('✓ Đã đặt lại');
      clearTimeout(actions._t);
      actions._t = setTimeout(() => resetCtrl.name(RESET_LABEL), 1500);
    },
  };
  const resetCtrl = gui.add(actions, 'reset').name(RESET_LABEL);
  resetCtrl.domElement.title = 'Đưa nắng, nước, cá, gió và hậu kỳ về giá trị ban đầu';

  const sun = gui.addFolder('Nắng');
  sun.add(config.sun, 'azimuth', 0, 180, 1).name('hướng (°)').onFinishChange(lighting.update);
  sun.add(config.sun, 'elevation', 8, 80, 1).name('độ cao (°)').onFinishChange(lighting.update);
  sun.add(config.sun, 'intensity', 0, 10, 0.05).name('cường độ').onChange(lighting.update);
  sun.addColor(config.sun, 'color').name('màu').onChange(lighting.update);
  sun.add(config.sky, 'hemiIntensity', 0, 3, 0.01).name('trời (hemi)').onChange(lighting.update);
  sun.add(config.sky, 'envIntensity', 0, 2, 0.01).name('env map').onFinishChange(lighting.update);

  const w = gui.addFolder('Nước');
  w.addColor(config.water, 'deepColor').name('màu sâu');
  w.addColor(config.water, 'shallowTint').name('màu nông');
  w.add(config.water.absorption, '0', 0, 4, 0.01).name('hấp thụ R');
  w.add(config.water.absorption, '1', 0, 4, 0.01).name('hấp thụ G');
  w.add(config.water.absorption, '2', 0, 4, 0.01).name('hấp thụ B');
  w.add(config.water, 'scatter', 0, 3, 0.01).name('tán xạ');
  w.add(config.water, 'waveSpeed', 0, 4, 0.01).name('tốc độ sóng');
  w.add(config.water, 'waveStrength', 0, 3, 0.01).name('độ gợn');
  w.add(config.water, 'reflectionStrength', 0, 2, 0.01).name('phản chiếu');
  w.add(config.water, 'refraction', 0, 0.15, 0.001).name('khúc xạ');
  w.add(config.water, 'glitter', 0, 4, 0.01).name('lấp lánh');
  w.add(config.water, 'rippleStrength', 0, 4, 0.01).name('vòng gợn');

  const k = gui.addFolder('Cá & gió');
  k.add(config.koi, 'speed', 0, 3, 0.01).name('tốc độ cá');
  k.add(config.wind, 'strength', 0, 4, 0.01).name('gió');
  k.add(config.wind, 'speed', 0, 4, 0.01).name('nhịp gió');

  const p = gui.addFolder('Hậu kỳ');
  p.add(config.post, 'exposure', 0.2, 3, 0.01).name('phơi sáng');
  p.add(config.post, 'bloom', 0, 1, 0.005).name('bloom');
  p.add(config.post, 'bloomThreshold', 0.2, 6, 0.01).name('ngưỡng bloom');
  p.add(config.post, 'ao', 0, 2, 0.01).name('AO');
  p.add(config.post, 'dof', 0, 2, 0.01).name('DOF');
  p.add(config.post, 'focusFar', 4, 30, 0.1).name('mốc nét');
  p.add(config.post, 'godRays', 0, 4, 0.01).name('god rays');
  p.add(config.post, 'haze', 0, 4, 0.01).name('khí quyển');
  p.add(config.post, 'vignette', 0, 1, 0.01).name('vignette');
  p.add(config.post, 'saturation', 0, 2, 0.01).name('bão hòa');
  p.add(config.post, 'contrast', 0.5, 1.6, 0.01).name('tương phản');
  p.add(config.post, 'grain', 0, 0.1, 0.001).name('hạt');
  gui.close();
  sun.close(); w.close(); k.close(); p.close();

  const fps = document.getElementById('fps');
  const hint = document.getElementById('hint');
  const toggle = () => {
    state.visible = !state.visible;
    if (state.visible) { gui.show(); gui.open(); } else gui.hide();
    fps.style.display = state.visible ? 'block' : 'none';
    if (hint) hint.style.display = state.visible ? 'none' : 'flex';
  };
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return; // typing into a lil-gui field
    if (e.key === 'g' || e.key === 'G') toggle();
  });
  if (hint) {
    hint.addEventListener('click', () => { toggle(); hint.blur(); });
    // stay prominent for a few seconds, then fade so it does not compete with the scene
    setTimeout(() => hint.classList.add('dim'), 6000);
  }
  // a close button inside the panel title so mouse users can get back out
  const close = document.createElement('span');
  close.textContent = '✕';
  close.title = 'Đóng (G)';
  close.style.cssText = 'float:right;cursor:pointer;opacity:.7;padding:0 4px';
  close.addEventListener('click', (e) => { e.stopPropagation(); if (state.visible) toggle(); });
  gui.$title.appendChild(close);
  window.__koiGui = gui; // debug / test hook
  return state;
}
