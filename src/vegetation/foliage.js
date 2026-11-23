import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial, patchedDepthMaterial } from '../util/patch.js';
import { makeRng, fbm3 } from '../util/rng.js';
import { QS } from '../config.js';

// Wind: world-space sway converted back to object space so shadows & depth stay consistent.
const WIND_PARS = /* glsl */`
attribute vec3 aBlobN;
attribute vec3 aTint;
attribute vec3 aWindP;   // x: phase, y: amplitude, z: flutter
attribute float aTransl;
varying vec3 vTint;
varying float vAO;
varying float vTransl;
attribute float aAO;
`;
const WIND_BEGIN = /* glsl */`
{
  vec3 ipos = instanceMatrix[3].xyz;
  float t = uTime * uWindSpeed;
  float ph = aWindP.x;
  vec3 wdir = normalize(vec3(1.0, 0.0, 0.3));
  float gust = 0.6 + 0.4 * sin(t * 0.21 + ipos.x * 0.08);
  float sway = (sin(t * 0.85 + ph) * 0.6 + sin(t * 1.9 + ph * 1.7) * 0.25) * gust;
  float flutter = sin(t * 6.0 + ph * 11.0 + position.x * 5.0 + position.y * 3.0);
  vec3 off = wdir * sway * aWindP.y + (aBlobN * 0.6 + vec3(0.0, 0.5, 0.0)) * flutter * aWindP.z;
  off *= uWind;
  mat3 im = mat3(instanceMatrix);
  float s2 = dot(im[0], im[0]);
  transformed += (transpose(im) * off) / s2;
}
`;

const cardGeo = (() => {
  // gently cupped card (3x3 verts) — gives leaf clusters a little volume
  // a single quad (2 triangles): foliage is vertex/draw bound on integrated GPUs
  const g = new THREE.PlaneGeometry(1, 1, 1, 1);
  return g;
})();

export class FoliageBuilder {
  constructor({ texture, wrap = 0.45, transl = 0.7, name = 'foliage', coreColor = 0x1a2a10, castShadow = true, alphaTest = 0.5, sizeMul = 1 }) {
    this.texture = texture;
    this.wrap = wrap;
    this.transl = transl;
    this.name = name;
    this.coreColor = new THREE.Color(coreColor);
    this.castShadow = castShadow;
    this.alphaTest = alphaTest;
    this.sizeMul = sizeMul;
    this.inst = [];
    this.cores = [];
    this.rng = makeRng(name.length * 977 + 13);
  }

  /**
   * Fill an ellipsoid with leaf cards concentrated near its surface.
   * o: { center:Vector3, radii:[rx,ry,rz], density (cards per m^2 of surface), size:[a,b],
   *      colors:[Color...], colorVar, flatBottom (0..1), shellMin, ao, wind, flutter, upBias, core, transl }
   */
  addBlob(o) {
    const rng = this.rng;
    const c = o.center, [rx, ry, rz] = o.radii;
    const area = 4 * Math.PI * Math.pow((Math.pow(rx * ry, 1.6) + Math.pow(rx * rz, 1.6) + Math.pow(ry * rz, 1.6)) / 3, 1 / 1.6);
    const count = Math.max(8, Math.round(area * (o.density ?? 60) * QS.foliage));
    const shellMin = o.shellMin ?? 0.72;
    const flat = o.flatBottom ?? 0;
    const phase = rng() * 100;
    const colors = o.colors || [new THREE.Color(0.5, 0.75, 0.35)];
    const tmpC = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      // direction on sphere, biased upward for pads
      let d = new THREE.Vector3(rng.gauss(), rng.gauss(), rng.gauss()).normalize();
      if (flat > 0 && d.y < 0 && rng() < flat) d.y *= 0.25;
      if (o.upBias) { d.y += o.upBias; d.normalize(); }
      const r = shellMin + (1 - shellMin) * Math.pow(rng(), 0.6);
      const p = new THREE.Vector3(d.x * rx * r, d.y * ry * r, d.z * rz * r);
      if (flat > 0 && p.y < -ry * 0.35) p.y = -ry * 0.35 - (p.y + ry * 0.35) * 0.2;
      // irregular silhouette: push outward by low-frequency noise
      const bump = 1 + (o.lumpy ?? 0.12) * fbm3(d.x * 2.2 + phase, d.y * 2.2, d.z * 2.2, 3);
      p.multiplyScalar(bump).add(c);
      const n = new THREE.Vector3(d.x / rx, d.y / ry, d.z / rz).normalize();
      // card orientation
      const cardN = n.clone().lerp(up, o.upBias ? 0.5 : 0.2)
        .add(new THREE.Vector3(rng.gauss(), rng.gauss(), rng.gauss()).multiplyScalar(o.jitter ?? 0.55)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), cardN);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rng() * Math.PI * 2));
      const s = rng.range(o.size[0], o.size[1]) * this.sizeMul;
      // colour
      tmpC.copy(colors[Math.floor(rng() * colors.length)]);
      const cv = o.colorVar ?? 0.12;
      tmpC.offsetHSL(rng.range(-0.02, 0.02) * cv * 8, rng.range(-cv, cv), rng.range(-cv, cv) * 0.8);
      // ambient occlusion: deeper & lower = darker
      const depthAO = THREE.MathUtils.smoothstep(r, shellMin - 0.05, 1.0);
      const heightAO = 0.55 + 0.45 * THREE.MathUtils.smoothstep(d.y, -0.9, 0.7);
      const ao = (o.ao ?? 1) * (0.42 + 0.58 * depthAO) * heightAO;
      this.inst.push({ p, q, s, n, color: tmpC.clone(), ao, wind: [phase + rng() * 0.6, o.wind ?? 0.03, (o.flutter ?? 0.012) * rng.range(0.5, 1.5)], transl: o.transl ?? 1 });
    }
    if (o.core !== false) {
      let g = new THREE.IcosahedronGeometry(1, 3);
      g.deleteAttribute('normal'); g.deleteAttribute('uv');
      g = mergeVertices(g);
      const pp = g.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
        const b = 1 + (o.lumpy ?? 0.12) * fbm3(x * 2.2 + phase, y * 2.2, z * 2.2, 3);
        let yy = y;
        if (flat > 0 && yy < -0.35) yy = -0.35 - (yy + 0.35) * 0.2;
        pp.setXYZ(i, x * rx * shellMin * 0.98 * b + c.x, yy * ry * shellMin * 0.98 * b + c.y, z * rz * shellMin * 0.98 * b + c.z);
      }
      g.computeVertexNormals();
      this.cores.push(g);
    }
    return count;
  }

  build() {
    const group = new THREE.Group();
    const n = this.inst.length;
    if (!n) return group;
    const geo = cardGeo.clone();
    const aBlobN = new Float32Array(n * 3), aTint = new Float32Array(n * 3), aWindP = new Float32Array(n * 3);
    const aAO = new Float32Array(n), aTransl = new Float32Array(n);
    const mat = this.material();
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const sv = new THREE.Vector3();
    this.inst.forEach((it, i) => {
      m.compose(it.p, it.q, sv.set(it.s, it.s, it.s));
      mesh.setMatrixAt(i, m);
      aBlobN.set([it.n.x, it.n.y, it.n.z], i * 3);
      aTint.set([it.color.r, it.color.g, it.color.b], i * 3);
      aWindP.set(it.wind, i * 3);
      aAO[i] = it.ao;
      aTransl[i] = it.transl;
    });
    geo.setAttribute('aBlobN', new THREE.InstancedBufferAttribute(aBlobN, 3));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
    geo.setAttribute('aWindP', new THREE.InstancedBufferAttribute(aWindP, 3));
    geo.setAttribute('aAO', new THREE.InstancedBufferAttribute(aAO, 1));
    geo.setAttribute('aTransl', new THREE.InstancedBufferAttribute(aTransl, 1));
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = patchedDepthMaterial(
      { key: this.name, vertexPars: WIND_PARS, vertexBegin: WIND_BEGIN },
      { map: this.texture, alphaTest: this.alphaTest, side: THREE.DoubleSide }
    );
    mesh.name = this.name;
    group.add(mesh);
    if (this.cores.length) {
      const cg = mergeGeometries(this.cores);
      const cm = new THREE.MeshLambertMaterial({ color: this.coreColor });
      const core = new THREE.Mesh(cg, cm);
      core.castShadow = this.castShadow;
      core.receiveShadow = true;
      group.add(core);
    }
    this.mesh = mesh;
    return group;
  }

  material() {
    const mat = new THREE.MeshLambertMaterial({ map: this.texture, alphaTest: this.alphaTest, side: THREE.DoubleSide });
    patchMaterial(mat, {
      key: this.name,
      lambertWrap: true,
      uniforms: { uWrap: { value: this.wrap }, uTransl: { value: this.transl } },
      vertexPars: WIND_PARS,
      vertexBegin: WIND_BEGIN + 'vTint = aTint; vAO = aAO; vTransl = aTransl;',
      vertexNormal: /* glsl */`
        {
          vec3 cn = normalize(mat3(instanceMatrix) * objectNormal);
          vec3 bn = normalize(mix(aBlobN, cn, 0.22));
          transformedNormal = normalize((viewMatrix * vec4(bn, 0.0)).xyz);
        }
      `,
      fragPars: 'varying vec3 vTint; varying float vAO;',
      fragColor: /* glsl */`
        {
          vec2 tsz = vec2(256.0);
          vec2 ddx = dFdx(vMapUv * tsz), ddy = dFdy(vMapUv * tsz);
          float lod = max(0.0, 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy))));
          diffuseColor.a *= 1.0 + lod * 0.45;
          diffuseColor.rgb *= vTint * vAO;
        }
      `,
      fragNormal: 'normal = normalize(vNormal);',
    });
    this.mat = mat;
    return mat;
  }
}

/** Tube with a radius function — trunks & branches. */
export function taperedTube(points, radiusFn, tubular = 24, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos = [], nor = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    const r = radiusFn(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const s = Math.sin(a), c = -Math.cos(a);
      N.set(0, 0, 0).addScaledVector(frames.normals[i], c).addScaledVector(frames.binormals[i], s).normalize();
      pos.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z);
      nor.push(N.x, N.y, N.z);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function barkMaterial(tone = [0.06, 0.047, 0.036]) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  patchMaterial(mat, {
    key: 'bark' + tone.join(','),
    uniforms: { uBark: { value: new THREE.Vector3(...tone) } },
    fragPars: /* glsl */`
      uniform vec3 uBark;
      float barkH(vec3 p){ return fbm3(vec3(p.x * 9.0, p.y * 3.0, p.z * 9.0)) + 0.4 * vnoise3(p * 30.0); }
    `,
    fragColor: /* glsl */`
      float h = barkH(vWPos);
      vec3 c = uBark * (0.6 + 0.7 * h);
      c = mix(c, vec3(0.13, 0.13, 0.11), smoothstep(0.62, 0.75, fbm3(vWPos * 5.0)) * 0.4); // lichen
      c = mix(c, vec3(0.1, 0.17, 0.05), smoothstep(0.5, 0.9, vWNormal.y) * 0.5);         // moss on top of limbs
      diffuseColor.rgb = c;
    `,
    fragNormal: 'normal = perturbNormalH(-vViewPosition, normal, barkH(vWPos), 0.03);',
  });
  return mat;
}
