// Central place for every important tunable. lil-gui (press G) edits these live.
const params = new URLSearchParams(location.search);

export const QUALITY = (params.get('q') || params.get('quality') || 'medium').toLowerCase();
export const DEBUG = params.has('debug');

const Q = {
  low:    { pixelRatio: 0.7,  shadowMap: 2048, reflScale: 0.35, aoScale: 0.5,  foliage: 0.45, koi: 24, shadowEvery: 3, reflEvery: 3, dof: false, motes: 150, aoSamples: 6,  msaa: 0 },
  medium: { pixelRatio: 0.85, shadowMap: 2048, reflScale: 0.45, aoScale: 0.5,  foliage: 0.6,  koi: 30, shadowEvery: 2, reflEvery: 2, dof: true,  motes: 250, aoSamples: 6,  msaa: 2 },
  high:   { pixelRatio: 1.0,  shadowMap: 4096, reflScale: 0.6,  aoScale: 0.75, foliage: 1.0,  koi: 34, shadowEvery: 1, reflEvery: 1, dof: true,  motes: 500, aoSamples: 12, msaa: 4 },
};
export const QS = Q[QUALITY] || Q.medium;

export const config = {
  camera: {
    position: [0.15, 1.85, 6.6],
    target: [0.25, 0.05, -1.4],
    fov: 52,
  },
  sun: {
    azimuth: 42,      // degrees from +x towards -z (55 => right side, behind the garden)
    elevation: 41,    // degrees above the horizon (morning)
    intensity: 5.2,
    color: '#ffe7c4',
  },
  sky: { hemiSky: '#bcd6ff', hemiGround: '#3c5a2a', hemiIntensity: 0.72, envIntensity: 0.35 },
  water: {
    deepColor: '#0c1c10',     // in-scattered colour of deep pond water
    shallowTint: '#3d5a34',
    absorption: [1.0, 0.86, 1.25], // Beer–Lambert sigma per channel (1/m)
    scatter: 0.55,
    waveSpeed: 1.0,
    waveStrength: 0.55,
    reflectionStrength: 1.0,
    refraction: 0.035,
    glitter: 1.0,
    rippleStrength: 1.0,
  },
  koi: { count: QS.koi, speed: 1.0 },
  wind: { strength: 1.0, speed: 1.0 },
  post: {
    exposure: 1.3,
    bloom: 0.1,
    bloomThreshold: 1.6,
    ao: 1.0,
    dof: QS.dof ? 1.0 : 0.0,
    focusFar: 11.0,
    vignette: 0.32,
    saturation: 1.02,
    contrast: 1.1,
    haze: 1.0,
    godRays: 0.6,
    grain: 0.025,
  },
};

// URL overrides for testing: ?msaa=0&pr=0.8
if (params.has('msaa')) QS.msaa = Number(params.get('msaa'));
if (params.has('pr')) QS.pixelRatio = Number(params.get('pr'));
// ?p_bloom=0&p_godRays=0 … override any config.post value
for (const [k, v] of params) if (k.startsWith('p_') && k.slice(2) in config.post) config.post[k.slice(2)] = Number(v);
