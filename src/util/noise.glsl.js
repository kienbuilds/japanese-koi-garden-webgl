// Shared GLSL noise helpers: hash, value noise, FBM, Voronoi, caustics.
export const NOISE = /* glsl */`
float hash11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float a = hash13(i), b = hash13(i+vec3(1,0,0)), c = hash13(i+vec3(0,1,0)), d = hash13(i+vec3(1,1,0));
  float e = hash13(i+vec3(0,0,1)), f1 = hash13(i+vec3(1,0,1)), g = hash13(i+vec3(0,1,1)), h = hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,f1,u.x), mix(g,h,u.x), u.y), u.z);
}
float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vnoise3(p); p=p*2.03+vec3(1.7,9.2,4.1); a*=.5; } return s; }
// returns (F1, F2)
vec2 voronoi(vec2 p){
  vec2 n = floor(p), f = fract(p); float f1 = 8., f2 = 8.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g = vec2(float(i), float(j)); vec2 o = hash22(n+g);
    vec2 r = g + o - f; float d = dot(r,r);
    if(d < f1){ f2 = f1; f1 = d; } else if(d < f2){ f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}
// Animated voronoi (cell points orbit) – used for caustics
vec2 voronoiAnim(vec2 p, float t){
  vec2 n = floor(p), f = fract(p); float f1 = 8., f2 = 8.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g = vec2(float(i), float(j)); vec2 o = hash22(n+g);
    o = 0.5 + 0.42*sin(t + 6.2831*o);
    vec2 r = g + o - f; float d = dot(r,r);
    if(d < f1){ f2 = f1; f1 = d; } else if(d < f2){ f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}
float causticLayer(vec2 p, float t){
  vec2 v = voronoiAnim(p, t);
  float e = v.y - v.x;               // distance to the cell edge
  return pow(1.0 - smoothstep(0.0, 0.3, e), 3.0);
}
// World-space caustics projected along the sun direction (pos.y < 0 under water)
float caustics(vec3 wp, vec3 sunDir, float t){
  vec2 p = wp.xz - sunDir.xz / max(sunDir.y, 0.2) * wp.y;
  float c = causticLayer(p*2.4 + vec2(0.0, t*0.05), t*0.9);
  c *= 0.45 + 1.0*causticLayer(p*1.75*mat2(0.8,-0.6,0.6,0.8) + vec2(t*0.04, 0.0), t*0.7 + 3.0);
  float depth = -wp.y;
  float focus = smoothstep(0.0, 0.2, depth) * exp(-depth*1.1);
  return c * focus;
}
`;

// Bump-mapping from an arbitrary scalar field (view-space derivative method)
export const PERTURB = /* glsl */`
vec3 perturbNormalH(vec3 surf_pos, vec3 surf_norm, float h, float scale){
  vec3 vSigmaX = dFdx(surf_pos); vec3 vSigmaY = dFdy(surf_pos);
  vec3 R1 = cross(vSigmaY, surf_norm); vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1);
  vec2 dH = vec2(dFdx(h), dFdy(h)) * scale;
  vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

// Underwater light: Beer–Lambert attenuation of the sun on its way down + caustics.
export const UNDERWATER = /* glsl */`
uniform vec3 uAbsorb;
uniform float uCaustic;
vec3 underwaterDirect(vec3 wp){
  if (wp.y >= 0.0) return vec3(1.0);
  float d = -wp.y;
  vec3 att = exp(-uAbsorb * 0.6 * d / max(uSunDir.y, 0.25));
  float c = caustics(wp, uSunDir, uTime);
  return att * (0.7 + uCaustic * 1.7 * c);
}
vec3 underwaterIndirect(vec3 wp){
  if (wp.y >= 0.0) return vec3(1.0);
  return exp(-uAbsorb * (-wp.y) * 0.8) * 0.85;
}
`;
