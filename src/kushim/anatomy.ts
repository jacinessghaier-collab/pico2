import * as THREE from "three";
import { LOCK } from "@/kushim/lock";
import {
  assertRigLock,
  markMaterial,
  markTint,
  rememberBaseline,
  sealLookColor,
  sealShaderChannels,
} from "@/kushim/lock-check";

export type Rig = {
  root: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Mesh;
  lips: THREE.Mesh;
  eyes: THREE.Sprite[];
  eyeMat: THREE.SpriteMaterial;
  shoulderL: THREE.Group;
  elbowL: THREE.Group;
  wristL: THREE.Group;
  shoulderR: THREE.Group;
  elbowR: THREE.Group;
  wristR: THREE.Group;
  fingersL: THREE.Group[];
  fingersR: THREE.Group[];
  glass: THREE.ShaderMaterial;
  nerve: THREE.ShaderMaterial;
  signal: THREE.ShaderMaterial;
  ring: THREE.Points;
  ringAngles: Float32Array;
  ringJitter: Float32Array;
  core: THREE.Mesh;
  dispose: () => void;
};

const glassVert = /* glsl */ `
attribute float aFade;
varying vec3 vN;
varying vec3 vW;
varying float vFade;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vFade = aFade;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const glassFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uBoost;
uniform float uFill;
uniform float uRim;
uniform float uRimPower;
uniform float uSpine;
uniform float uSpineTight;
uniform float uStar;
uniform float uStarTight;
varying vec3 vN;
varying vec3 vW;
varying float vFade;
void main() {
  vec3 viewDir = normalize(cameraPosition - vW);
  float ndv = abs(dot(normalize(vN), viewDir));
  float fres = pow(clamp(1.0 - ndv, 0.0, 1.0), uRimPower);
  float spine = exp(-abs(vW.x) * uSpineTight)
    * smoothstep(0.62, 1.04, vW.y)
    * smoothstep(1.54, 1.26, vW.y);
  vec3 chest = vW - vec3(0.0, 1.32, 0.04);
  float star = exp(-dot(chest, chest) * uStarTight);
  float alpha = (fres * uRim * uBoost + uFill * uBoost + spine * uSpine + star * uStar) * vFade;
  if (alpha < 0.012) discard;
  vec3 col = mix(uColor, uCore, clamp(fres * 0.38 + spine * 0.18, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
}
`;

const coreFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uBoost;
uniform float uShow;
varying vec3 vN;
varying vec3 vW;
varying float vFade;
void main() {
  vec3 viewDir = normalize(cameraPosition - vW);
  float fres = pow(1.0 - abs(dot(normalize(vN), viewDir)), 2.35);
  float spine = exp(-abs(vW.x) * 14.0) * smoothstep(0.35, 1.15, vW.y) * smoothstep(1.75, 1.35, vW.y);
  vec3 chest = vW - vec3(0.0, 1.34, 0.06);
  float star = exp(-dot(chest, chest) * 18.0);
  float alpha = (fres * 0.95 * uBoost + 0.07 * uBoost + spine * 0.55 + star * 0.7) * uShow * vFade;
  if (alpha < 0.015) discard;
  gl_FragColor = vec4(mix(uColor, uCore, fres), alpha);
}
`;

const nerveVert = /* glsl */ `
attribute vec3 aDir;
attribute float aSide;
attribute float aAlong;
attribute float aRank;
attribute float aWidth;
attribute float aGain;
attribute float aWarm;
attribute float aHaze;
uniform float uDensity;
varying float vAlong;
varying float vRank;
varying float vVisible;
varying float vGain;
varying float vWarm;
varying float vSide;
varying float vHaze;
void main() {
  vAlong = aAlong;
  vRank = aRank;
  vGain = aGain;
  vWarm = aWarm;
  vSide = aSide;
  vHaze = aHaze;
  vVisible = aRank <= uDensity ? 1.0 : 0.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 viewDir = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz);
  vec2 side = normalize(vec2(-viewDir.y, viewDir.x));
  if (length(viewDir.xy) < 0.001) side = vec2(1.0, 0.0);
  mv.xy += side * aSide * aWidth * 11.0;
  gl_Position = projectionMatrix * mv;
}
`;

const nerveFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uTime;
uniform float uSpeed;
uniform float uShow;
varying float vAlong;
varying float vRank;
varying float vVisible;
varying float vGain;
varying float vWarm;
varying float vSide;
varying float vHaze;
void main() {
  if (vVisible < 0.5 || uShow < 0.5) discard;
  float wave = fract(vAlong * 3.1 - uTime * uSpeed);
  float bead = smoothstep(0.0, 0.015, wave) * smoothstep(0.16, 0.02, wave);
  // Haze is a steady fill. aHaze 0 keeps the traveling bead used by line strands and the signal.
  float pulse = bead * (1.0 - vHaze);
  float lift = clamp(mix(0.16, 0.82, vWarm) + pulse * 0.45, 0.0, 1.0);
  float lineAlpha = (0.72 + pulse * 0.7) * vGain;
  // Round disc. A bar's hard edge is what striped the skull. vHaze 0 stays the line bead.
  float along = (vAlong - 0.5) * 2.0;
  float hazeDisc = exp(-(vSide * vSide + along * along) * 2.6);
  float hazeAlpha = hazeDisc * vGain;
  gl_FragColor = vec4(mix(uColor, uCore, lift), mix(lineAlpha, hazeAlpha, vHaze));
}
`;

type Ribbon = {
  positions: number[];
  dirs: number[];
  sides: number[];
  alongs: number[];
  ranks: number[];
  widths: number[];
  gains: number[];
  warms: number[];
  hazes: number[];
};

function emptyRibbon(): Ribbon {
  return {
    positions: [],
    dirs: [],
    sides: [],
    alongs: [],
    ranks: [],
    widths: [],
    gains: [],
    warms: [],
    hazes: [],
  };
}

function addRibbon(
  target: Ribbon,
  pts: THREE.Vector3[],
  rank: number,
  width: number,
  gain = 0.8,
  warm = 0.22,
  taper = 0,
  haze = 0,
) {
  let total = 0;
  const acc = [0];
  for (let i = 1; i < pts.length; i++) {
    total += pts[i].distanceTo(pts[i - 1]);
    acc.push(total);
  }
  if (total < 1e-4) return;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const t0 = acc[i] / total;
    const t1 = acc[i + 1] / total;
    const corners: Array<[THREE.Vector3, number, number]> = [
      [a, -1, t0],
      [a, 1, t0],
      [b, -1, t1],
      [a, 1, t0],
      [b, 1, t1],
      [b, -1, t1],
    ];
    for (const [p, side, t] of corners) {
      target.positions.push(p.x, p.y, p.z);
      target.dirs.push(dx, dy, dz);
      target.sides.push(side);
      target.alongs.push(t);
      target.ranks.push(rank);
      target.widths.push(width);
      target.gains.push(gain * (1 - taper * t * 0.62));
      target.warms.push(warm);
      target.hazes.push(haze);
    }
  }
}

function commitRibbon(
  parent: THREE.Object3D,
  ribbon: Ribbon,
  material: THREE.Material,
  renderOrder = 2,
) {
  if (ribbon.positions.length === 0) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(ribbon.positions, 3));
  geo.setAttribute("aDir", new THREE.Float32BufferAttribute(ribbon.dirs, 3));
  geo.setAttribute("aSide", new THREE.Float32BufferAttribute(ribbon.sides, 1));
  geo.setAttribute("aAlong", new THREE.Float32BufferAttribute(ribbon.alongs, 1));
  geo.setAttribute("aRank", new THREE.Float32BufferAttribute(ribbon.ranks, 1));
  geo.setAttribute("aWidth", new THREE.Float32BufferAttribute(ribbon.widths, 1));
  geo.setAttribute("aGain", new THREE.Float32BufferAttribute(ribbon.gains, 1));
  geo.setAttribute("aWarm", new THREE.Float32BufferAttribute(ribbon.warms, 1));
  geo.setAttribute("aHaze", new THREE.Float32BufferAttribute(ribbon.hazes, 1));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  parent.add(mesh);
}

function glassMaterial(boost: number, role: "glass" | "glass-bright") {
  const shell = LOCK.glass;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(LOCK.strom) },
      uCore: { value: new THREE.Color(LOCK.kern) },
      uBoost: { value: boost },
      uFill: { value: shell.fill },
      uRim: { value: shell.rim },
      uRimPower: { value: shell.rimPower },
      uSpine: { value: shell.spine },
      uSpineTight: { value: shell.spineTight },
      uStar: { value: shell.star },
      uStarTight: { value: shell.starTight },
    },
    vertexShader: glassVert,
    fragmentShader: glassFrag,
  });
  sealShaderChannels(material, [
    "uColor",
    "uCore",
    "uBoost",
    "uFill",
    "uRim",
    "uRimPower",
    "uSpine",
    "uSpineTight",
    "uStar",
    "uStarTight",
  ]);
  markMaterial(material, role);
  return material;
}

function nerveMaterial(color: string, speed: number) {
  const signal = color === LOCK.signal;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uCore: { value: new THREE.Color(signal ? "#FF8A2A" : LOCK.filamentKern) },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uDensity: { value: 1 },
      uShow: { value: signal ? 0 : 1 },
    },
    vertexShader: nerveVert,
    fragmentShader: nerveFrag,
  });
  sealShaderChannels(
    material,
    signal ? ["uColor", "uCore", "uSpeed"] : ["uColor", "uCore", "uSpeed", "uShow"],
  );
  markMaterial(material, signal ? "signal" : "nerve");
  return material;
}

function solid(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material) {
  if (!geo.getAttribute("aFade")) {
    const count = geo.getAttribute("position").count;
    const fade = new Float32Array(count);
    fade.fill(1);
    geo.setAttribute("aFade", new THREE.Float32BufferAttribute(fade, 1));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}

/** Hermite 0 at edge0, 1 at edge1. Parent distal and child proximal sum to 1. */
function hermite(edge0: number, edge1: number, x: number) {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / span));
  return t * t * (3 - 2 * t);
}

function taperRadii(r0: number, r1: number, n: number) {
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const s = t * t * (3 - 2 * t);
    radii.push(r0 + (r1 - r0) * s);
  }
  return radii;
}

/**
 * Open tube. Proximal rings tuck into the parent and fade in.
 * Distal rings fade out over `dist`, which matches the child tube's `prox`.
 * No end-cap and no sphere — the seam is a crossfade, not an orb.
 */
function organicTube(
  radii: readonly number[],
  length: number,
  side: 1 | -1,
  inset: number,
  prox: number,
  dist: number,
) {
  const seg = 22;
  const rings = radii.length;
  const pos: number[] = [];
  const fade: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    const t = rings === 1 ? 0 : i / (rings - 1);
    const y = prox * (1 - t) - length * t;
    const r = radii[i] ?? radii[radii.length - 1] ?? 0.02;
    const bias = -side * inset * (1 - t) * (1 - t);
    let cover = 1;
    if (prox > 0) cover = Math.min(cover, hermite(prox, 0, y));
    if (dist > 0) cover = Math.min(cover, hermite(-length, -length + dist, y));
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r + bias, y, Math.sin(a) * r * 0.8);
      fade.push(cover);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aFade", new THREE.Float32BufferAttribute(fade, 1));
  geo.setIndex(idx);
  return geo;
}

function glowSprite(inner: string, outer: string, spikes: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const empty = new THREE.CanvasTexture(canvas);
    markTint(empty, inner, outer);
    return empty;
  }
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, outer);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = inner;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < spikes; i++) {
    const angle = (i / spikes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64 + Math.cos(angle) * 60, 64 + Math.sin(angle) * 60);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  markTint(tex, inner, outer);
  return tex;
}

const SHELL_SX = 1.05;
const SKULL_SY = 1.16;
const HIP_X = 0.11;
/** Same lathe the glass torso uses. The aura zero-contour reads this profile. */
const SHELL_LATHE: Array<[number, number]> = [
  [0.06, -0.34],
  [0.108, -0.26],
  [0.14, -0.14],
  [0.11, -0.02],
  [0.098, 0.06],
  [0.112, 0.11],
  [0.142, 0.16],
  [0.172, 0.21],
  [0.196, 0.27],
  [0.172, 0.33],
  [0.118, 0.38],
  [0.09, 0.42],
  [0.05, 0.5],
];
/** Crossfade length shared by a parent distal end and its child proximal end. */
const BLEND = { elbow: 0.09, knee: 0.09, shoulder: 0.016, hip: 0.02 };
const LIMB = {
  upper: { r0: 0.056, r1: 0.032, inset: 0.01 },
  fore: { r0: 0.032, r1: 0.02, inset: 0 },
  thigh: { r0: 0.072, r1: 0.038, inset: 0.008 },
  shin: { r0: 0.038, r1: 0.024, inset: 0 },
} as const;

const auraVert = /* glsl */ `
uniform float uOriginY;
varying vec2 vBody;
void main() {
  vBody = vec2(position.x, position.y + uOriginY);
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

function g4(n: number) {
  return n.toFixed(4);
}

/** Veil whose peak sits on the glass silhouette and falls outward. */
function buildAuraFrag() {
  const P = LOCK.proportions;
  const chestY = P.chestY;
  const y0 = chestY + SHELL_LATHE[0][1];
  const yN = chestY + SHELL_LATHE[SHELL_LATHE.length - 1][1];
  const rows = SHELL_LATHE.map(
    ([r, y], i) => `  vec2 s${i} = vec2(${g4(r * SHELL_SX)}, ${g4(chestY + y)});`,
  ).join("\n");
  const chain = SHELL_LATHE.map((_, i) => {
    if (i === 0) return "  if (y <= s0.y) return s0.x;";
    return `  if (y <= s${i}.y) return mix(s${i - 1}.x, s${i}.x, (y - s${i - 1}.y) / (s${i}.y - s${i - 1}.y));`;
  }).join("\n");
  const last = SHELL_LATHE.length - 1;
  const shoulderY = P.chestY + P.shoulderLocalY;
  const elbowY = shoulderY - P.upperArm;
  const wristY = elbowY - P.foreArm;
  const kneeY = P.hipY - P.thigh;
  const ankleY = kneeY - P.shin;
  const headY = P.chestY + P.headLocalY;
  const L = LIMB;
  const limb = (x: number, yTop: number, yBot: number, r0: number, r1: number, inset: number) =>
    `sdLimb(p, ${g4(x)}, ${g4(yTop)}, ${g4(yBot)}, ${g4(r0)}, ${g4(r1)}, ${g4(inset)})`;
  return /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTight;
varying vec2 vBody;

float sdTaper(vec2 p, vec2 a, vec2 b, float r0, float r1) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  float s = h * h * (3.0 - 2.0 * h);
  float r = mix(r0, r1, s);
  return length(pa - ba * h) - r;
}

float sdEllipse(vec2 p, vec2 c, vec2 r) {
  vec2 q = (p - c) / r;
  return (length(q) - 1.0) * min(r.x, r.y);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float torsoR(float y) {
${rows}
${chain}
  return s${last}.x;
}

float sdTorso(vec2 p) {
  float y = clamp(p.y, ${g4(y0)}, ${g4(yN)});
  float d = abs(p.x) - torsoR(y);
  float cap = 0.0;
  if (p.y > ${g4(yN)}) cap = p.y - ${g4(yN)};
  if (p.y < ${g4(y0)}) cap = ${g4(y0)} - p.y;
  return max(d, cap);
}

float sdLimb(vec2 p, float x, float yTop, float yBot, float r0, float r1, float inset) {
  float lean = sign(x) * (abs(x) - inset);
  return sdTaper(p, vec2(lean, yTop), vec2(x, yBot), r0, r1);
}

float sdBody(vec2 p) {
  float d = sdTorso(p);
  d = smin(d, sdEllipse(p, vec2(0.0, ${g4(headY)}), vec2(${g4(P.headRadius)}, ${g4(P.headRadius * SKULL_SY)})), 0.036);
  d = smin(d, ${limb(P.shoulderX, shoulderY, elbowY, L.upper.r0, L.upper.r1, L.upper.inset)}, 0.036);
  d = smin(d, ${limb(-P.shoulderX, shoulderY, elbowY, L.upper.r0, L.upper.r1, L.upper.inset)}, 0.036);
  d = smin(d, ${limb(P.shoulderX, elbowY, wristY, L.fore.r0, L.fore.r1, 0)}, 0.024);
  d = smin(d, ${limb(-P.shoulderX, elbowY, wristY, L.fore.r0, L.fore.r1, 0)}, 0.024);
  d = smin(d, ${limb(P.shoulderX, wristY, wristY - 0.06, 0.02, 0.016, 0)}, 0.018);
  d = smin(d, ${limb(-P.shoulderX, wristY, wristY - 0.06, 0.02, 0.016, 0)}, 0.018);
  d = smin(d, ${limb(HIP_X, P.hipY, kneeY, L.thigh.r0, L.thigh.r1, L.thigh.inset)}, 0.034);
  d = smin(d, ${limb(-HIP_X, P.hipY, kneeY, L.thigh.r0, L.thigh.r1, L.thigh.inset)}, 0.034);
  d = smin(d, ${limb(HIP_X, kneeY, ankleY, L.shin.r0, L.shin.r1, 0)}, 0.028);
  d = smin(d, ${limb(-HIP_X, kneeY, ankleY, L.shin.r0, L.shin.r1, 0)}, 0.028);
  d = smin(d, ${limb(HIP_X, ankleY + 0.016, ankleY - 0.02, 0.038, 0.03, 0)}, 0.03);
  d = smin(d, ${limb(-HIP_X, ankleY + 0.016, ankleY - 0.02, 0.038, 0.03, 0)}, 0.03);
  return d;
}

void main() {
  float d = sdBody(vBody);
  float side = d >= 0.0 ? 1.0 : 2.6;
  float alpha = exp(-d * d * uTight * side) * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;
}

const groundVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const groundFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRadius;
uniform float uFoot;
uniform float uTight;
varying vec2 vUv;
void main() {
  vec2 world = (vUv * 2.0 - 1.0) * uRadius;
  vec2 qL = world - vec2(-uFoot, -0.03);
  vec2 qR = world - vec2(uFoot, -0.03);
  vec2 eL = vec2(qL.x / 0.07, qL.y / 0.05);
  vec2 eR = vec2(qR.x / 0.07, qR.y / 0.05);
  float alpha = (exp(-dot(eL, eL) * uTight) + exp(-dot(eR, eR) * uTight)) * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

function addShellLight(
  root: THREE.Object3D,
  disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>,
) {
  const spec = LOCK.aura;
  const auraMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(LOCK.strom) },
      uOpacity: { value: spec.opacity },
      uTight: { value: spec.tight },
      uOriginY: { value: spec.y },
    },
    vertexShader: auraVert,
    fragmentShader: buildAuraFrag(),
  });
  sealShaderChannels(auraMat, ["uColor", "uOpacity", "uTight", "uOriginY"]);
  markMaterial(auraMat, "aura");
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), auraMat);
  aura.position.set(0, spec.y, spec.z);
  aura.frustumCulled = false;
  aura.renderOrder = 0;
  aura.userData.lockKey = "aura";
  root.add(aura);
  disposables.push(auraMat);

  const pool = LOCK.ground;
  const groundMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(LOCK.strom) },
      uOpacity: { value: pool.opacity },
      uRadius: { value: pool.radius },
      uFoot: { value: pool.foot },
      uTight: { value: pool.tight },
    },
    vertexShader: groundVert,
    fragmentShader: groundFrag,
  });
  sealShaderChannels(groundMat, ["uColor", "uOpacity", "uRadius", "uFoot", "uTight"]);
  markMaterial(groundMat, "ground");
  const ground = new THREE.Mesh(new THREE.CircleGeometry(pool.radius, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, pool.y, pool.z);
  ground.renderOrder = 0;
  ground.userData.lockKey = "ground";
  root.add(ground);
  disposables.push(groundMat);
}

function pushCurve(
  ribbon: Ribbon,
  samples: number,
  at: (u: number) => THREE.Vector3,
  rank: number,
  width: number,
  gain: number,
  warm: number,
  taper = 0,
  haze = 0,
) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) pts.push(at(i / samples));
  addRibbon(ribbon, pts, rank, width, gain, warm, taper, haze);
}

function unitHash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** Bowed chord. Bend is perpendicular in the front plane so a run is not a ruler. */
function arcBetween(
  ribbon: Ribbon,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  bend: number,
  rank: number,
  width: number,
  gain: number,
  warm: number,
  haze = 0,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.004) return;
  const px = (-dy / len) * bend;
  const py = (dx / len) * bend;
  pushCurve(
    ribbon,
    5,
    (u) => {
      const o = Math.sin(u * Math.PI);
      return new THREE.Vector3(ax + dx * u + px * o, ay + dy * u + py * o, az + (bz - az) * u);
    },
    Math.min(0.82, Math.max(0.02, rank)),
    width,
    gain,
    warm,
    0.3,
    haze,
  );
}

const TORSO_PROFILE: Array<[number, number]> = [
  [0.055, -0.3],
  [0.12, -0.24],
  [0.15, -0.12],
  [0.125, 0],
  [0.15, 0.12],
  [0.175, 0.22],
  [0.15, 0.3],
  [0.075, 0.38],
  [0.048, 0.46],
];

function torsoRadius(y: number) {
  const pts = TORSO_PROFILE;
  if (y <= pts[0][1]) return pts[0][0];
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1];
    const [r1, y1] = pts[i];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return pts[pts.length - 1][0];
}

function fillTorso(ribbon: Ribbon) {
  // Forked plexus in chest space (current lathe).
  // Thin spine, uneven short forks, local weaves. Inset. No sternum ball.
  const hair = 0.00018;
  const twigW = 0.00014;
  let seed = 11;
  const h = () => unitHash(seed++);
  const limitX = (y: number) => torsoRadius(y) * 1.05 * 0.74;
  const limitZ = (y: number) => torsoRadius(y) * 0.72 * 0.56;
  const clampX = (x: number, y: number) => Math.max(-limitX(y), Math.min(limitX(y), x));
  const clampZ = (z: number, y: number) => Math.max(-limitZ(y), Math.min(limitZ(y), z));

  const nodes: Array<[number, number, number]> = [];
  const budget = { n: 0 };

  const strand = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    rank: number,
    width: number,
    gain: number,
    warm: number,
  ) => {
    const yA = Math.max(-0.3, Math.min(0.44, y0));
    const yB = Math.max(-0.3, Math.min(0.44, y1));
    const ax = clampX(x0, yA);
    const az = clampZ(z0, yA);
    const bx = clampX(x1, yB);
    const bz = clampZ(z1, yB);
    if (Math.hypot(bx - ax, yB - yA) < 0.011) return null;
    const slide = Math.hypot(bx - x1, bz - z1);
    if (slide > Math.hypot(x1 - x0, y1 - y0) * 0.45) return null;
    arcBetween(
      ribbon,
      ax,
      yA,
      az,
      bx,
      yB,
      bz,
      (h() - 0.5) * 0.01,
      rank,
      width,
      gain,
      warm,
    );
    const end: [number, number, number] = [bx, yB, bz];
    nodes.push(end);
    budget.n += 1;
    return end;
  };

  let sx = 0;
  let sy = 0.38;
  let sz = 0.012;
  const spine: Array<[number, number, number]> = [[sx, sy, sz]];
  for (let i = 0; i < 12; i++) {
    const end = strand(
      sx,
      sy,
      sz,
      sx + (h() - 0.5) * 0.012,
      sy - 0.05,
      sz + (h() - 0.5) * 0.008,
      0.04 + (i % 3) * 0.01,
      hair,
      0.42,
      0.48,
    );
    if (!end) break;
    [sx, sy, sz] = end;
    spine.push(end);
  }

  const grow = (
    x: number,
    y: number,
    z: number,
    ang: number,
    len: number,
    depth: number,
    width: number,
    gain: number,
    dense: boolean,
  ) => {
    if (depth > 4 || len < 0.013 || budget.n > 340) return;
    if (y > 0.44 || y < -0.3) return;
    const sway = (h() - 0.5) * (depth === 0 ? 0.4 : 0.75);
    const a = ang + sway;
    const ny = y + Math.cos(a) * len;
    const nx = x + Math.sin(a) * len;
    const nz = z + (h() - 0.5) * 0.016;
    const end = strand(
      x,
      y,
      z,
      nx,
      ny,
      nz,
      0.08 + depth * 0.045,
      depth >= 3 ? twigW : width,
      gain,
      depth < 2 ? 0.4 : 0.26,
    );
    if (!end) return;
    const spread = 0.55 + h() * 0.5;
    const keep = 0.58 + h() * 0.16;
    grow(end[0], end[1], end[2], a - spread, len * keep, depth + 1, width * 0.9, gain * 0.9, dense);
    const fork = dense ? depth < 2 || h() > 0.32 : h() > 0.62;
    if (fork) {
      grow(
        end[0],
        end[1],
        end[2],
        a + spread * (0.65 + h() * 0.35),
        len * keep * 0.82,
        depth + 1,
        width * 0.86,
        gain * 0.86,
        dense,
      );
    }
  };

  for (const [x, y, z] of spine) {
    const dense = y > -0.04 && y < 0.3;
    const len = (dense ? 0.04 : 0.048) + h() * 0.018;
    const tilt = (h() - 0.5) * 0.85;
    const base = dense ? 1.02 : 1.65;
    if (h() > 0.12) grow(x, y, z, -base + tilt, len, 0, hair, dense ? 0.4 : 0.28, dense);
    if (h() > (dense ? 0.22 : 0.58)) {
      grow(x, y, z, base + tilt * 0.5, len * (0.72 + h() * 0.25), 0, hair, dense ? 0.38 : 0.26, dense);
    }
  }

  const extras: Array<[number, number, number, number]> = [
    [-0.028, 0.18, 0.012, -0.55],
    [0.034, 0.14, 0.01, 0.85],
    [-0.05, 0.06, 0.006, -1.45],
    [0.046, 0.09, 0.008, 1.35],
    [-0.018, 0.24, 0.014, -0.25],
    [0.02, 0.02, 0.016, 1.7],
    [-0.038, -0.08, 0.004, -2.05],
    [0.032, -0.1, 0.002, 2.15],
  ];
  for (const [x, y, z, ang] of extras) {
    const dense = y > -0.02 && y < 0.28;
    grow(
      x,
      y,
      z,
      ang + (h() - 0.5) * 0.45,
      (dense ? 0.038 : 0.032) + h() * 0.014,
      0,
      twigW,
      dense ? 0.36 : 0.24,
      dense,
    );
  }

  let links = 0;
  for (let i = 0; i < nodes.length && links < 110; i++) {
    const j = (i * 7 + 3) % nodes.length;
    if (j === i) continue;
    const [x, y, z] = nodes[i];
    const [x2, y2, z2] = nodes[j];
    const d = Math.hypot(x2 - x, y2 - y, (z2 - z) * 2);
    if (d < 0.014 || d > 0.046) continue;
    const chest = y > -0.04 && y < 0.28 && y2 > -0.04 && y2 < 0.28;
    arcBetween(
      ribbon,
      x,
      y,
      z,
      x2,
      y2,
      z2,
      (h() - 0.5) * 0.006,
      0.16 + (links % 5) * 0.02,
      twigW,
      chest ? 0.26 : 0.16,
      chest ? 0.34 : 0.22,
    );
    links += 1;
  }
}

function fillLimb(
  ribbon: Ribbon,
  length: number,
  count: number,
  radius: number,
  rank: number,
  width: number,
  gain: number,
  seed: number,
  side: number,
  distal = radius * 0.62,
) {
  // One wandering trunk and short twigs on the current lathe. Not full-length lanes.
  let n = Math.round(seed * 19 + length * 80 + count);
  const h = () => unitHash(n++);
  const girth = (u: number) => radius + (distal - radius) * Math.min(1, Math.max(0, u));
  const phase = h() * Math.PI * 2;
  const bias = (h() - 0.5) * radius * 0.08 + side * radius * 0.03;
  const clampAt = (v: number, u: number) => {
    const reach = girth(u) * 0.78;
    return Math.max(-reach, Math.min(reach, v));
  };
  const trunk = (t: number) => {
    const u = Math.min(0.98, Math.max(0, t));
    const wander = girth(u) * 0.2;
    return new THREE.Vector3(
      clampAt(bias + Math.sin(u * Math.PI * 1.1 + phase) * wander, u),
      -u * length,
      clampAt(Math.sin(u * Math.PI * 0.7 + phase * 1.3) * wander * 0.8, u),
    );
  };

  pushCurve(ribbon, 16, (u) => trunk(u), Math.min(0.8, rank), width, gain * 0.72, 0.3, 0.1);

  const twigs = Math.round(9 + count * 0.2);
  for (let f = 0; f < twigs; f++) {
    const t0 = Math.min(0.9, 0.05 + ((f + 0.4) / twigs) * 0.84);
    const origin = trunk(t0);
    const reach = girth(t0) * 0.72;
    const dir = (f % 2 === 0 ? 1 : -1) * (0.55 + h() * 0.4);
    const along = 0.07 + h() * 0.08;
    const sideReach = reach * (0.48 + h() * 0.4);
    const tipX = Math.max(-reach, Math.min(reach, origin.x + dir * sideReach));
    const tipY = origin.y - along * length;
    const tipZ = Math.max(-reach, Math.min(reach, origin.z + (h() - 0.5) * reach * 0.65));
    pushCurve(
      ribbon,
      3,
      (u) =>
        new THREE.Vector3(
          origin.x + (tipX - origin.x) * u,
          origin.y + (tipY - origin.y) * u,
          origin.z + (tipZ - origin.z) * u,
        ),
      Math.min(0.8, rank + 0.05 + (f % 4) * 0.02),
      width * 0.62,
      gain * 0.42,
      0.22,
      0.65,
    );
    if (f % 3 === 1) {
      const zKick = (h() - 0.5) * reach * 0.25;
      const forkReach = reach * 0.35;
      pushCurve(
        ribbon,
        2,
        (u) =>
          new THREE.Vector3(
            Math.max(-reach, Math.min(reach, tipX + dir * forkReach * u)),
            tipY - u * length * 0.028,
            Math.max(-reach, Math.min(reach, tipZ + zKick * u)),
          ),
        Math.min(0.82, rank + 0.14),
        width * 0.5,
        gain * 0.28,
        0.18,
        0.7,
      );
    }
  }
}

const FINGER_SPECS = [
  { x: -0.03, z: 0.02, len: 0.052, rot: 0.5 },
  { x: -0.012, z: 0.016, len: 0.074, rot: 0.08 },
  { x: 0.004, z: 0.018, len: 0.082, rot: 0 },
  { x: 0.018, z: 0.014, len: 0.076, rot: -0.08 },
  { x: 0.03, z: 0.008, len: 0.062, rot: -0.16 },
];

function fillHand(ribbon: Ribbon, side: 1 | -1) {
  for (let f = 0; f < FINGER_SPECS.length; f++) {
    const spec = FINGER_SPECS[f];
    const rot = spec.rot * side;
    const reach = spec.len * 0.92;
    const tipX = spec.x * side + Math.sin(rot) * reach;
    const tipY = -0.02 - Math.cos(rot) * reach;
    pushCurve(
      ribbon,
      7,
      (u) => new THREE.Vector3(tipX * u, tipY * u, 0.006 + (spec.z - 0.006) * u),
      0.16 + f * 0.04,
      0.00016,
      0.34,
      0.22,
      0.7,
    );
  }
  pushCurve(
    ribbon,
    8,
    (u) => new THREE.Vector3((-0.032 + u * 0.064) * side, -0.028, 0.014),
    0.28,
    0.00015,
    0.26,
    0.16,
    0.2,
  );
}

function fillFoot(ribbon: Ribbon, side: 1 | -1) {
  for (let t = 0; t < 5; t++) {
    const x = (t - 2) * 0.014 * side;
    pushCurve(
      ribbon,
      6,
      (u) => new THREE.Vector3(x * u, -0.012 - u * 0.006, 0.02 + u * 0.145),
      0.22 + t * 0.04,
      0.00015,
      0.32,
      0.16,
      0.75,
    );
  }
  pushCurve(
    ribbon,
    6,
    (u) => new THREE.Vector3(side * 0.004, -0.02, 0.02 + u * 0.1),
    0.3,
    0.00015,
    0.24,
    0.14,
    0.4,
  );
}

function fillHead(ribbon: Ribbon, radius: number) {
  // Soft volume inside the current lathe skull. Discs, not rows.
  // A long bar stripes, and a thick curve fans. No brow, eyes, nose, or spark.
  // Inset so the cyan glass rim stays the silhouette and the void stays outside.
  const rx = radius * 0.9;
  const ry = radius * 1.16 * 0.9;
  const rz = radius * 1.02 * 0.86;
  let seed = 700;
  const h = () => unitHash(seed++);
  const ell = (x: number, y: number, z: number) =>
    (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz);

  const pick = (bias: number) => {
    for (let n = 0; n < 24; n++) {
      const x = (h() * 2 - 1) * rx;
      const y = (h() * 2 - 1) * ry;
      const z = (h() * 2 - 1) * rz;
      const e = ell(x, y, z);
      if (e >= 0.96) continue;
      if (bias > 0 && h() < e * bias) continue;
      return { x, y, z, e };
    }
    return null;
  };

  const disc = (span: number, gain: number, warm: number, rank: number, bias: number) => {
    const p = pick(bias);
    if (!p) return;
    const theta = h() * Math.PI * 2;
    const zDir = h() * 2 - 1;
    const ring = Math.sqrt(Math.max(0, 1 - zDir * zDir));
    const dx = ring * Math.cos(theta);
    const dy = ring * Math.sin(theta);
    const dz = zDir;
    const half = span * 0.5;
    const pull = (px: number, py: number, pz: number) => {
      const e = ell(px, py, pz);
      if (e <= 0.96) return { x: px, y: py, z: pz };
      const s = Math.sqrt(0.96 / e);
      return { x: px * s, y: py * s, z: pz * s };
    };
    const a = pull(p.x - dx * half, p.y - dy * half, p.z - dz * half);
    const b = pull(p.x + dx * half, p.y + dy * half, p.z + dz * half);
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (len < radius * 0.035) return;
    const fall = 1 - Math.min(1, p.e);
    pushCurve(
      ribbon,
      1,
      (u) => new THREE.Vector3(a.x, a.y, a.z).lerp(new THREE.Vector3(b.x, b.y, b.z), u),
      Math.min(0.4, rank),
      len / 22,
      gain * (0.7 + fall * 0.3) * (0.86 + h() * 0.28),
      warm,
      0,
      1,
    );
  };

  for (let i = 0; i < 22; i++) {
    disc(radius * (0.82 + h() * 0.24), 0.16, 0.3 + h() * 0.08, 0.02 + h() * 0.04, 0.15);
  }
  for (let i = 0; i < 34; i++) {
    disc(radius * (0.46 + h() * 0.18), 0.1, 0.36 + h() * 0.12, 0.05 + h() * 0.08, 0.35);
  }
}

function fillPelvis(ribbon: Ribbon, hipY: number) {
  for (const side of [-1, 1] as const) {
    const y = hipY + 0.008;
    arcBetween(ribbon, 0, y, 0, side * 0.04, y + 0.014, 0.008, side * 0.008, 0.14, 0.00012, 0.3, 0.28);
    arcBetween(
      ribbon,
      side * 0.04,
      y + 0.014,
      0.008,
      side * 0.086,
      y - 0.012,
      0.014,
      side * 0.006,
      0.2,
      0.00011,
      0.26,
      0.26,
    );
    arcBetween(
      ribbon,
      side * 0.028,
      y - 0.006,
      -0.006,
      side * 0.062,
      y + 0.028,
      0.01,
      -side * 0.008,
      0.24,
      0.00011,
      0.24,
      0.3,
    );
  }
}

function fillHotspot(ribbon: Ribbon) {
  const cx = -0.05;
  const cy = -0.04;
  const cz = 0.04;
  for (let i = 0; i < 16; i++) {
    const phase = i * 2.399963;
    const tilt = 0.35 + (i % 6) * 0.5;
    pushCurve(
      ribbon,
      12,
      (u) => {
        const a = phase + u * Math.PI * (1.15 + (i % 3) * 0.4);
        const rad = 0.032 + (i % 5) * 0.006;
        const wob = Math.sin(u * Math.PI * 3 + i) * 0.01;
        return new THREE.Vector3(
          cx + Math.cos(a) * rad + Math.sin(tilt + u * 4) * wob,
          cy + Math.sin(a * 0.85) * rad * 0.7 + Math.cos(u * 5 + phase) * 0.008,
          cz + Math.sin(a + tilt) * rad * 0.62,
        );
      },
      0.03 + (i % 5) * 0.02,
      0.00105,
      0.58,
      0.58 + (i % 4) * 0.1,
      0.08,
    );
  }
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.4;
    pushCurve(
      ribbon,
      8,
      (u) => {
        const rad = 0.03 + Math.sin(u * Math.PI) * 0.035;
        return new THREE.Vector3(
          cx + Math.cos(ang + u * 2.2) * rad * 0.85,
          cy - 0.01 - u * 0.07 + Math.sin(ang) * 0.01,
          cz + Math.sin(ang + u) * rad * 0.55,
        );
      },
      0.08,
      0.0009,
      0.5,
      0.78,
      0.35,
    );
  }
}

export function createKushim(): Rig {
  const P = LOCK.proportions;
  const root = new THREE.Group();
  const glass = glassMaterial(1, "glass");
  const nerve = nerveMaterial(LOCK.filament, 0.34);
  const signal = nerveMaterial(LOCK.signal, 0.2);
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [
    glass,
    nerve,
    signal,
  ];

  const chest = new THREE.Group();
  chest.position.y = P.chestY;
  root.add(chest);

  const torso = solid(
    chest,
    new THREE.LatheGeometry(
      SHELL_LATHE.map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ),
    glass,
  );
  torso.scale.set(SHELL_SX, 1, 0.72);
  torso.userData.lockKey = "torso";

  const head = new THREE.Group();
  head.position.y = P.headLocalY;
  chest.add(head);
  const skull = solid(head, new THREE.SphereGeometry(P.headRadius, 24, 16), glass);
  skull.scale.set(1, 1.16, 1.02);
  skull.userData.lockKey = "skull";
  const jaw = solid(head, new THREE.SphereGeometry(P.headRadius * 0.72, 16, 12), glass);
  jaw.position.set(0, 0, 0);
  jaw.scale.set(0.05, 0.05, 0.05);
  jaw.userData.restX = jaw.rotation.x;
  jaw.userData.restY = jaw.position.y;
  // Scale stays 1 so the viseme still drives it. The tube itself stays under a pixel,
  // otherwise the glass rim reads as a mouth in the middle of the haze.
  const lips = solid(head, new THREE.CapsuleGeometry(0.00035, 0.0008, 2, 6), glass);
  lips.position.set(0, 0, 0);
  lips.rotation.z = Math.PI / 2;
  for (const side of [-1, 1] as const) {
    const ear = solid(head, new THREE.SphereGeometry(0.028, 10, 8), glass);
    ear.position.set(side * 0.09, -0.008, -0.01);
    ear.scale.set(0.18, 0.48, 0.28);
  }
  const headNerves = emptyRibbon();
  fillHead(headNerves, P.headRadius);
  commitRibbon(head, headNerves, nerve);

  const starTex = glowSprite("#ffffff", LOCK.strom, 0);
  const starMat = new THREE.SpriteMaterial({
    map: starTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  sealLookColor(starMat.color);
  markMaterial(starMat, "sprite");
  const star = new THREE.Sprite(starMat);
  star.userData.lockKey = "chest-core";
  star.position.set(0, 0.14, 0.1);
  star.scale.set(LOCK.glass.sprite, LOCK.glass.sprite, 1);
  star.renderOrder = 3;
  chest.add(star);
  disposables.push(starTex, star.material);

  const eyeTex = glowSprite("#ffffff", LOCK.kern, 0);
  const eyeMat = new THREE.SpriteMaterial({
    map: eyeTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  sealLookColor(eyeMat.color);
  markMaterial(eyeMat, "sprite");
  disposables.push(eyeTex, eyeMat);
  const eyes: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Sprite(eyeMat);
    eye.position.set(side * 0.032, 0.012, P.headRadius * 0.2);
    eye.scale.set(0, 0, 0);
    eye.renderOrder = 4;
    eye.userData.restX = eye.position.x;
    eye.userData.restY = eye.position.y;
    head.add(eye);
    eyes.push(eye);
  }
  const browTex = glowSprite("#ffffff", LOCK.kern, 4);
  const browMat = new THREE.SpriteMaterial({
    map: browTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  sealLookColor(browMat.color);
  markMaterial(browMat, "sprite");
  const forehead = new THREE.Sprite(browMat);
  forehead.position.set(0, 0.02, 0);
  forehead.scale.set(0, 0, 0);
  forehead.renderOrder = 4;
  head.add(forehead);
  disposables.push(browTex, forehead.material);

  const torsoNerves = emptyRibbon();
  fillTorso(torsoNerves);
  commitRibbon(chest, torsoNerves, nerve);

  function makeArm(side: 1 | -1) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * P.shoulderX, P.shoulderLocalY, 0);
    chest.add(shoulder);
    const upperMesh = solid(
      shoulder,
      organicTube(
        taperRadii(LIMB.upper.r0, LIMB.upper.r1, 8),
        P.upperArm,
        side,
        LIMB.upper.inset,
        BLEND.shoulder,
        BLEND.elbow,
      ),
      glass,
    );
    const upperN = emptyRibbon();
    fillLimb(upperN, P.upperArm, 16, 0.058, 0.06, 0.00013, 0.6, side * 1.3, side, 0.026);
    commitRibbon(shoulder, upperN, nerve);

    const elbow = new THREE.Group();
    elbow.position.y = -P.upperArm;
    shoulder.add(elbow);
    const foreMesh = solid(
      elbow,
      organicTube(taperRadii(LIMB.fore.r0, LIMB.fore.r1, 7), P.foreArm, side, 0, BLEND.elbow, 0),
      glass,
    );
    const foreN = emptyRibbon();
    fillLimb(foreN, P.foreArm, 12, 0.026, 0.08, 0.00012, 0.55, side * 2.1, side, 0.017);
    commitRibbon(elbow, foreN, nerve);

    const wrist = new THREE.Group();
    wrist.position.y = -P.foreArm;
    elbow.add(wrist);
    const palm = solid(
      wrist,
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.01, 0),
          new THREE.Vector2(0.026, -0.012),
          new THREE.Vector2(0.024, -0.034),
          new THREE.Vector2(0.014, -0.05),
        ],
        10,
      ),
      glass,
    );
    palm.scale.set(1.15, 1, 0.42);
    palm.position.set(0, -0.01, 0.01);
    const fingers: THREE.Group[] = [];
    const handN = emptyRibbon();
    fillHand(handN, side);
    commitRibbon(wrist, handN, nerve);
    return { shoulder, elbow, wrist, fingers };
  }

  const left = makeArm(1);
  const right = makeArm(-1);

  const signalNerves = emptyRibbon();
  fillHotspot(signalNerves);
  commitRibbon(right.shoulder, signalNerves, signal, 6);

  const coreMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(LOCK.signal) },
      uCore: { value: new THREE.Color("#FFB15A") },
      uBoost: { value: 2.4 },
      uShow: { value: 0 },
    },
    vertexShader: glassVert,
    fragmentShader: coreFrag,
  });
  sealShaderChannels(coreMat, ["uColor", "uCore", "uBoost"]);
  markMaterial(coreMat, "core");
  disposables.push(coreMat);
  const core = solid(right.shoulder, new THREE.SphereGeometry(0.01, 16, 12), coreMat);
  core.position.set(-0.05, -0.042, 0.042);
  core.renderOrder = 4;

  const ringCount = 96;
  const ringAngles = new Float32Array(ringCount);
  const ringJitter = new Float32Array(ringCount);
  const ringPos = new Float32Array(ringCount * 3);
  for (let i = 0; i < ringCount; i++) {
    ringAngles[i] = (i / ringCount) * Math.PI * 2;
    ringJitter[i] = 0.75 + ((i * 37) % 10) / 25;
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPos, 3));
  const ringMat = new THREE.PointsMaterial({
    color: LOCK.signal,
    size: 0.028,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.8,
    sizeAttenuation: true,
  });
  sealLookColor(ringMat.color);
  markMaterial(ringMat, "ring");
  const ring = new THREE.Points(ringGeo, ringMat);
  ring.position.set(-0.042, -0.04, 0.034);
  ring.frustumCulled = false;
  ring.renderOrder = 5;
  right.shoulder.add(ring);
  disposables.push(ringGeo, ringMat);

  function makeLeg(side: 1 | -1) {
    const hip = new THREE.Group();
    hip.userData.lockKey = "hip";
    hip.userData.lockSide = side;
    hip.position.set(side * HIP_X, P.hipY, 0);
    root.add(hip);
    const thighMesh = solid(
      hip,
      organicTube(
        taperRadii(LIMB.thigh.r0, LIMB.thigh.r1, 8),
        P.thigh,
        side,
        LIMB.thigh.inset,
        BLEND.hip,
        BLEND.knee,
      ),
      glass,
    );
    const hipN = emptyRibbon();
    fillLimb(hipN, P.thigh, 18, 0.072, 0.05, 0.00014, 0.6, side * 2.4, side, 0.032);
    commitRibbon(hip, hipN, nerve);

    const knee = new THREE.Group();
    knee.userData.lockKey = "knee";
    knee.position.y = -P.thigh;
    hip.add(knee);
    const shinMesh = solid(
      knee,
      organicTube(taperRadii(LIMB.shin.r0, LIMB.shin.r1, 7), P.shin, side, 0, BLEND.knee, 0),
      glass,
    );
    const shinN = emptyRibbon();
    fillLimb(shinN, P.shin, 14, 0.032, 0.08, 0.00012, 0.55, 3.1 + side, side, 0.02);
    commitRibbon(knee, shinN, nerve);

    const ankle = new THREE.Group();
    ankle.userData.lockKey = "ankle";
    ankle.position.y = -P.shin;
    knee.add(ankle);
    const foot = new THREE.Group();
    ankle.add(foot);
    const footMesh = solid(
      foot,
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.012, -0.01),
          new THREE.Vector2(0.02, 0.02),
          new THREE.Vector2(0.022, 0.06),
          new THREE.Vector2(0.014, 0.1),
          new THREE.Vector2(0.007, 0.13),
        ],
        10,
      ),
      glass,
    );
    footMesh.rotation.x = Math.PI / 2;
    footMesh.scale.set(1.25, 1, 0.36);
    footMesh.position.set(0, -0.02, 0.024);
    const footN = emptyRibbon();
    fillFoot(footN, side);
    commitRibbon(foot, footN, nerve);
  }

  makeLeg(1);
  makeLeg(-1);

  const pelvis = emptyRibbon();
  fillPelvis(pelvis, P.hipY);
  commitRibbon(root, pelvis, nerve);
  addShellLight(root, disposables);
  if (typeof location !== "undefined" && location.search.includes("view=34")) {
    root.rotation.y = -0.68;
  }

  root.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) disposables.push(mesh.geometry);
  });

  const rig: Rig = {
    root,
    chest,
    head,
    jaw,
    lips,
    eyes,
    eyeMat,
    shoulderL: left.shoulder,
    elbowL: left.elbow,
    wristL: left.wrist,
    shoulderR: right.shoulder,
    elbowR: right.elbow,
    wristR: right.wrist,
    fingersL: left.fingers,
    fingersR: right.fingers,
    glass,
    nerve,
    signal,
    ring,
    ringAngles,
    ringJitter,
    core,
    dispose: () => {
      const seen = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
      for (const item of disposables) {
        if (seen.has(item)) continue;
        seen.add(item);
        item.dispose();
      }
    },
  };
  assertRigLock(rig, "build");
  rememberBaseline(rig);
  return rig;
}
