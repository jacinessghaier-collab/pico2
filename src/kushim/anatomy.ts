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
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
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
void main() {
  vec3 viewDir = normalize(cameraPosition - vW);
  float ndv = abs(dot(normalize(vN), viewDir));
  float fres = pow(clamp(1.0 - ndv, 0.0, 1.0), uRimPower);
  float spine = exp(-abs(vW.x) * uSpineTight)
    * smoothstep(0.62, 1.04, vW.y)
    * smoothstep(1.54, 1.26, vW.y);
  vec3 chest = vW - vec3(0.0, 1.32, 0.04);
  float star = exp(-dot(chest, chest) * uStarTight);
  float alpha = fres * uRim * uBoost + uFill * uBoost + spine * uSpine + star * uStar;
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
void main() {
  vec3 viewDir = normalize(cameraPosition - vW);
  float fres = pow(1.0 - abs(dot(normalize(vN), viewDir)), 2.35);
  float spine = exp(-abs(vW.x) * 14.0) * smoothstep(0.35, 1.15, vW.y) * smoothstep(1.75, 1.35, vW.y);
  vec3 chest = vW - vec3(0.0, 1.34, 0.06);
  float star = exp(-dot(chest, chest) * 18.0);
  float alpha = (fres * 0.95 * uBoost + 0.07 * uBoost + spine * 0.55 + star * 0.7) * uShow;
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
uniform float uDensity;
varying float vAlong;
varying float vRank;
varying float vVisible;
varying float vGain;
varying float vWarm;
void main() {
  vAlong = aAlong;
  vRank = aRank;
  vGain = aGain;
  vWarm = aWarm;
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
void main() {
  if (vVisible < 0.5 || uShow < 0.5) discard;
  float wave = fract(vAlong * 3.1 - uTime * uSpeed);
  float head = smoothstep(0.0, 0.015, wave) * smoothstep(0.16, 0.02, wave);
  float lift = clamp(mix(0.16, 0.82, vWarm) + head * 0.45, 0.0, 1.0);
  float alpha = (0.72 + head * 0.7) * vGain;
  gl_FragColor = vec4(mix(uColor, uCore, lift), alpha);
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
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}

function capsule(radius: number, length: number) {
  const cyl = Math.max(0.012, length - radius * 2);
  return new THREE.CapsuleGeometry(radius, cyl, 4, 8);
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

const auraVert = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const auraFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTight;
varying vec3 vW;

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
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
  if (y < 0.98) return mix(0.062, 0.132, clamp((y - 0.92) / 0.06, 0.0, 1.0));
  if (y < 1.10) return mix(0.132, 0.162, clamp((y - 0.98) / 0.12, 0.0, 1.0));
  if (y < 1.22) return mix(0.162, 0.138, clamp((y - 1.10) / 0.12, 0.0, 1.0));
  if (y < 1.34) return mix(0.138, 0.164, clamp((y - 1.22) / 0.12, 0.0, 1.0));
  if (y < 1.44) return mix(0.164, 0.190, clamp((y - 1.34) / 0.10, 0.0, 1.0));
  if (y < 1.52) return mix(0.190, 0.150, clamp((y - 1.44) / 0.08, 0.0, 1.0));
  return mix(0.150, 0.055, clamp((y - 1.52) / 0.10, 0.0, 1.0));
}

float sdTorso(vec2 p) {
  float y = clamp(p.y, 0.92, 1.60);
  return length(p - vec2(0.0, y)) - torsoR(y);
}

float sdBody(vec2 p) {
  float d = sdTorso(p);
  d = smin(d, sdEllipse(p, vec2(0.0, 1.66), vec2(0.108, 0.126)), 0.04);
  vec2 sL = vec2(0.20, 1.50);
  vec2 eL = vec2(0.240, 1.102);
  vec2 wL = vec2(0.271, 0.794);
  vec2 hL = vec2(0.285, 0.68);
  d = smin(d, sdCapsule(p, sL, eL, 0.046), 0.035);
  d = smin(d, sdCapsule(p, eL, wL, 0.036), 0.03);
  d = smin(d, sdCapsule(p, wL, hL, 0.028), 0.025);
  d = smin(d, sdCapsule(p, vec2(-0.20, 1.50), vec2(-0.240, 1.102), 0.046), 0.035);
  d = smin(d, sdCapsule(p, vec2(-0.240, 1.102), vec2(-0.271, 0.794), 0.036), 0.03);
  d = smin(d, sdCapsule(p, vec2(-0.271, 0.794), vec2(-0.285, 0.68), 0.028), 0.025);
  d = smin(d, sdCapsule(p, vec2(0.11, 0.96), vec2(0.11, 0.50), 0.068), 0.04);
  d = smin(d, sdCapsule(p, vec2(0.11, 0.50), vec2(0.11, 0.10), 0.046), 0.03);
  d = smin(d, sdCapsule(p, vec2(0.11, 0.10), vec2(0.11, 0.04), 0.032), 0.025);
  d = smin(d, sdCapsule(p, vec2(-0.11, 0.96), vec2(-0.11, 0.50), 0.068), 0.04);
  d = smin(d, sdCapsule(p, vec2(-0.11, 0.50), vec2(-0.11, 0.10), 0.046), 0.03);
  d = smin(d, sdCapsule(p, vec2(-0.11, 0.10), vec2(-0.11, 0.04), 0.032), 0.025);
  return d;
}

void main() {
  float d = sdBody(vW.xy);
  float outer = max(d, 0.0);
  float gate = smoothstep(-0.002, 0.008, d);
  float alpha = exp(-outer * outer * uTight) * gate * uOpacity;
  if (alpha < 0.016) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

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
  float dL = length(world - vec2(-uFoot, 0.0));
  float dR = length(world - vec2(uFoot, 0.0));
  float alpha = (exp(-dL * dL * uTight) + exp(-dR * dR * uTight)) * uOpacity;
  if (alpha < 0.025) discard;
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
    },
    vertexShader: auraVert,
    fragmentShader: auraFrag,
  });
  sealShaderChannels(auraMat, ["uColor", "uOpacity", "uTight"]);
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
) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) pts.push(at(i / samples));
  addRibbon(ribbon, pts, rank, width, gain, warm, taper);
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
  // Branching web. Ranks stay under the idle filament gate (0.86).
  // The sternum is a crossing plexus, not a stack of vertical hairlines,
  // so the chest beam sits in yellow-green fill.
  const hair = 0.00013;
  let seed = 11;
  const h = () => unitHash(seed++);
  const clampX = (x: number, y: number) => {
    const rad = torsoRadius(y) * 0.96;
    return Math.max(-rad, Math.min(rad, x));
  };

  const trunks: Array<Array<[number, number, number]>> = [];
  for (const side of [-1, 1] as const) {
    trunks.push([
      [side * 0.018, -0.28, 0],
      [side * 0.07, -0.16, 0.012],
      [side * 0.112, -0.02, -0.01],
      [side * 0.07, 0.1, 0.018],
      [side * 0.12, 0.2, 0],
      [side * 0.155, 0.3, 0.01],
    ]);
    trunks.push([
      [side * 0.012, -0.22, -0.016],
      [side * 0.048, -0.08, 0.016],
      [side * 0.028, 0.05, 0.008],
      [side * 0.062, 0.16, -0.012],
      [side * 0.034, 0.28, 0.014],
      [side * 0.016, 0.39, 0],
    ]);
  }
  trunks.push([
    [-0.022, -0.26, 0.02],
    [0.028, -0.12, -0.012],
    [-0.034, 0.0, 0.02],
    [0.02, 0.12, 0.028],
    [-0.018, 0.24, 0.01],
    [0.012, 0.37, 0],
  ]);

  for (let p = 0; p < trunks.length; p++) {
    const path = trunks[p];
    for (let i = 0; i < path.length - 1; i++) {
      const [x, y, z] = path[i];
      const [x2, y2, z2] = path[i + 1];
      const jx = (h() - 0.5) * 0.014;
      const jy = (h() - 0.5) * 0.01;
      const ex = clampX(x2 + jx, y2 + jy);
      const ey = y2 + jy;
      arcBetween(ribbon, x, y, z, ex, ey, z2, (h() - 0.5) * 0.03, 0.05 + i * 0.02, hair, 0.48, 0.44);
      if (i === 0) continue;
      const side = ex >= 0 ? 1 : -1;
      const inward = i % 2 === 0 ? -side : side;
      const len = 0.032 + h() * 0.05;
      const fy = ey + (h() - 0.4) * 0.05;
      const fx = clampX(ex + inward * len, fy);
      arcBetween(
        ribbon,
        ex,
        ey,
        z2,
        fx,
        fy,
        z2 + (h() - 0.5) * 0.02,
        (h() - 0.5) * 0.02,
        0.12 + (i % 4) * 0.03,
        hair * 0.9,
        0.4,
        0.5,
      );
      if (ey > -0.08 && ey < 0.26) {
        const tx = clampX(fx + -Math.sign(fx || side) * (0.018 + h() * 0.04), fy + 0.028);
        arcBetween(
          ribbon,
          fx,
          fy,
          z2,
          tx,
          fy + 0.02 + h() * 0.03,
          z2 + (h() - 0.5) * 0.016,
          (h() - 0.5) * 0.016,
          0.08 + (p % 5) * 0.02,
          hair,
          0.55,
          0.58,
        );
      }
    }
  }

  for (let i = 0; i < 128; i++) {
    const sternum = i < 56;
    const y = sternum ? 0.0 + h() * 0.22 : -0.24 + h() * 0.5;
    const x = (h() - 0.5) * (sternum ? 0.1 : 0.16);
    const ang = (h() - 0.5) * Math.PI * (sternum ? 0.85 : 1);
    const len = (sternum ? 0.03 : 0.024) + h() * 0.04;
    const y2 = y + Math.sin(ang) * len;
    const x2 = clampX(x + Math.cos(ang) * len, y2);
    const z = (h() - 0.5) * (sternum ? 0.04 : 0.05);
    const chest = sternum || (Math.abs(x) < 0.05 && y > -0.04 && y < 0.24);
    arcBetween(
      ribbon,
      x,
      y,
      z,
      x2,
      y2,
      z + (h() - 0.5) * 0.018,
      (h() - 0.5) * 0.014,
      0.04 + (i % 8) * 0.02,
      chest ? 0.0003 : hair * 0.9,
      chest ? 0.46 + h() * 0.12 : 0.28,
      chest ? 0.52 + h() * 0.1 : 0.36,
    );
  }

  for (let i = 0; i < 9; i++) {
    const y = -0.22 + i * 0.058;
    const rad = torsoRadius(y) * (0.42 + h() * 0.28);
    const rise = (h() - 0.45) * 0.04;
    arcBetween(
      ribbon,
      -rad,
      y,
      (h() - 0.5) * 0.02,
      rad * (0.55 + h() * 0.4),
      y + rise,
      (h() - 0.5) * 0.02,
      (h() - 0.5) * 0.035,
      0.18 + (i % 4) * 0.04,
      hair * 0.85,
      0.28,
      0.34,
    );
  }

  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 4; i++) {
      const y = 0.16 + h() * 0.1;
      const x = side * (0.04 + h() * 0.05);
      arcBetween(
        ribbon,
        x,
        y,
        0.01,
        clampX(side * (0.12 + h() * 0.04), y + 0.08),
        0.26 + h() * 0.06,
        0.012,
        side * (0.01 + h() * 0.012),
        0.14 + i * 0.04,
        hair * 0.9,
        0.36,
        0.42,
      );
    }
    for (let i = 0; i < 4; i++) {
      const x = side * (0.004 + h() * 0.03);
      arcBetween(
        ribbon,
        x,
        0.24 + h() * 0.04,
        (h() - 0.5) * 0.016,
        x + side * (h() - 0.2) * 0.02,
        0.36 + h() * 0.05,
        (h() - 0.5) * 0.012,
        (h() - 0.5) * 0.01,
        0.1 + i * 0.03,
        hair * 0.8,
        0.3,
        0.4,
      );
    }
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
) {
  // Long hairlines along the bone. A fork peels off and keeps going;
  // it does not double back into a knot. Everything stays inside the glass.
  let n = Math.round(seed * 19 + length * 80 + count);
  const h = () => unitHash(n++);
  const inset = radius * 0.48;
  const strands = count >= 16 ? 4 : 3;
  for (let s = 0; s < strands; s++) {
    const lane = (s - (strands - 1) / 2) * inset * 0.62;
    const depth = ((s % 2) - 0.5) * inset * 0.4;
    const forkAt = s < 2 ? 0 : 0.18 + (s - 2) * 0.16;
    const peel = (s - (strands - 1) / 2) * inset * 0.28;
    pushCurve(
      ribbon,
      16,
      (u) => {
        const t = forkAt + (1 - forkAt) * u;
        const drift = Math.sin(t * Math.PI * 1.35 + seed + s * 1.7) * inset * 0.16;
        const open = Math.sin(u * Math.PI) * peel;
        return new THREE.Vector3(
          lane + drift + open + side * 0.001,
          -t * length,
          depth + Math.sin(t * Math.PI * 0.8 + s) * inset * 0.1,
        );
      },
      Math.min(0.8, rank + s * 0.04),
      width,
      s < 2 ? gain : gain * 0.62,
      0.38,
      0.12,
    );
  }
  const crossZ = (h() - 0.5) * inset * 0.15;
  pushCurve(
    ribbon,
    12,
    (u) =>
      new THREE.Vector3(
        (u - 0.5) * inset * 0.9 + Math.sin(u * Math.PI) * inset * 0.08,
        -(0.08 + u * 0.84) * length,
        crossZ,
      ),
    Math.min(0.78, rank + 0.12),
    width * 0.75,
    gain * 0.4,
    0.3,
    0.2,
  );
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
    const tipZ = spec.z;
    for (let strand = 0; strand < 2; strand++) {
      const spread = (strand - 0.5) * 0.005;
      pushCurve(
        ribbon,
        7,
        (u) =>
          new THREE.Vector3(
            tipX * u + spread * Math.sin(u * Math.PI),
            tipY * u,
            0.006 + (tipZ - 0.006) * u,
          ),
        0.16 + f * 0.04,
        0.0002,
        0.4,
        0.22,
        0.78,
      );
    }
  }
  pushCurve(
    ribbon,
    8,
    (u) => new THREE.Vector3((-0.032 + u * 0.064) * side, -0.028, 0.014),
    0.28,
    0.00018,
    0.28,
    0.16,
    0.2,
  );
}

function fillFoot(ribbon: Ribbon, side: 1 | -1) {
  for (let t = 0; t < 5; t++) {
    const x = (t - 2) * 0.014 * side;
    for (let strand = 0; strand < 2; strand++) {
      const spread = (strand - 0.5) * 0.0035;
      pushCurve(
        ribbon,
        6,
        (u) => new THREE.Vector3(x * u + spread, -0.012 - u * 0.006, 0.02 + u * 0.145),
        0.22 + t * 0.04,
        0.00018,
        0.36,
        0.16,
        0.82,
      );
    }
  }
  pushCurve(
    ribbon,
    6,
    (u) => new THREE.Vector3(side * 0.004, -0.02, 0.02 + u * 0.1),
    0.3,
    0.00018,
    0.26,
    0.14,
    0.4,
  );
}

function fillHead(ribbon: Ribbon, radius: number) {
  const ry = radius * 1.16;
  const rx = radius;
  const rz = radius * 1.02;
  let seed = 700;
  const h = () => unitHash(seed++);

  const wisp = (
    theta0: number,
    dTheta: number,
    phi: number,
    lift: number,
    gain: number,
    width: number,
    rank: number,
  ) => {
    pushCurve(
      ribbon,
      5,
      (u) => {
        const theta = theta0 + dTheta * u;
        const wob = Math.sin(u * Math.PI) * 0.22;
        const L = lift * (0.94 + u * 0.08);
        return new THREE.Vector3(
          Math.sin(theta) * Math.cos(phi + wob) * rx * L,
          Math.cos(theta) * ry * L,
          Math.sin(theta) * Math.sin(phi + wob) * rz * L,
        );
      },
      Math.min(0.8, rank),
      width,
      gain,
      0.5,
      0.06,
    );
  };

  // Quiet crown so the oval is not bare above the ears. No brow arc, no spark.
  for (let ring = 0; ring < 4; ring++) {
    const theta = 0.38 + ring * 0.28;
    for (let a = 0; a < 8; a++) {
      const phi = (a / 8) * Math.PI * 2 + ring * 0.41 + (h() - 0.5) * 0.2;
      wisp(theta, 0.16, phi, 0.6 + h() * 0.22, 0.09, 0.00065, 0.22 + ring * 0.03);
    }
  }

  // Lower half of the oval: interior haze, stronger than the crown, still inside the skull.
  // No shell on the glass, and front-center stays dim so it cannot read as a face.
  for (let ring = 0; ring < 6; ring++) {
    const theta = 1.55 + (ring / 5) * 1.05;
    for (let a = 0; a < 10; a++) {
      const phi = (a / 10) * Math.PI * 2 + ring * 0.37 + (h() - 0.5) * 0.2;
      const face = Math.abs(Math.cos(phi)) < 0.3 && Math.sin(phi) > 0.72 && theta < 2.05;
      const lift = face ? 0.42 + h() * 0.06 : 0.5 + h() * 0.22;
      wisp(
        theta,
        0.22,
        phi,
        Math.min(0.74, lift),
        face ? 0.06 : 0.1 + (ring > 2 ? 0.03 : 0),
        0.00048,
        0.06 + (ring % 4) * 0.03,
      );
    }
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

function addFingers(wrist: THREE.Group, side: 1 | -1, material: THREE.Material) {
  const fingers: THREE.Group[] = [];
  for (const spec of FINGER_SPECS) {
    const finger = new THREE.Group();
    finger.position.set(spec.x * side, -0.02, spec.z);
    finger.rotation.z = spec.rot * side;
    const seg = solid(finger, capsule(0.008, spec.len), material);
    seg.position.y = -spec.len * 0.45;
    wrist.add(finger);
    fingers.push(finger);
  }
  return fingers;
}

export function createKushim(): Rig {
  const P = LOCK.proportions;
  const root = new THREE.Group();
  const glass = glassMaterial(1, "glass");
  const bright = glassMaterial(0.42, "glass-bright");
  const nerve = nerveMaterial(LOCK.filament, 0.34);
  const signal = nerveMaterial(LOCK.signal, 0.2);
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [
    glass,
    bright,
    nerve,
    signal,
  ];

  const chest = new THREE.Group();
  chest.position.y = P.chestY;
  root.add(chest);

  const torsoPts = [
    new THREE.Vector2(0.055, -0.3),
    new THREE.Vector2(0.12, -0.24),
    new THREE.Vector2(0.15, -0.12),
    new THREE.Vector2(0.125, 0.0),
    new THREE.Vector2(0.15, 0.12),
    new THREE.Vector2(0.175, 0.22),
    new THREE.Vector2(0.15, 0.3),
    new THREE.Vector2(0.075, 0.38),
    new THREE.Vector2(0.048, 0.46),
  ];
  const torso = solid(chest, new THREE.LatheGeometry(torsoPts, 28), glass);
  torso.scale.set(1.05, 1, 0.72);
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
  const lips = solid(head, capsule(0.0015, 0.012), glass);
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
    const joint = solid(shoulder, new THREE.SphereGeometry(0.032, 12, 8), bright);
    joint.scale.set(0.78, 0.62, 0.5);
    const upperMesh = solid(shoulder, capsule(0.046, P.upperArm), glass);
    upperMesh.position.y = -P.upperArm / 2;
    const upperN = emptyRibbon();
    fillLimb(upperN, P.upperArm, 16, 0.032, 0.06, 0.00013, 0.6, side * 1.3, side);
    commitRibbon(shoulder, upperN, nerve);

    const elbow = new THREE.Group();
    elbow.position.y = -P.upperArm;
    shoulder.add(elbow);
    const elbowJoint = solid(elbow, new THREE.SphereGeometry(0.022, 10, 8), bright);
    elbowJoint.scale.set(0.72, 0.58, 0.48);
    const foreMesh = solid(elbow, capsule(0.036, P.foreArm), glass);
    foreMesh.position.y = -P.foreArm / 2;
    const foreN = emptyRibbon();
    fillLimb(foreN, P.foreArm, 12, 0.022, 0.08, 0.00012, 0.55, side * 2.1, side);
    commitRibbon(elbow, foreN, nerve);

    const wrist = new THREE.Group();
    wrist.position.y = -P.foreArm;
    elbow.add(wrist);
    const wristJoint = solid(wrist, new THREE.SphereGeometry(0.016, 10, 8), bright);
    wristJoint.scale.set(0.7, 0.55, 0.46);
    const palm = solid(wrist, new THREE.SphereGeometry(0.034, 12, 8), glass);
    palm.position.set(0, -0.03, 0.01);
    palm.scale.set(0.85, 1.15, 0.42);
    const fingers = addFingers(wrist, side, glass);
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
    hip.position.set(side * 0.11, P.hipY, 0);
    root.add(hip);
    const hipJoint = solid(hip, new THREE.SphereGeometry(0.038, 12, 8), bright);
    hipJoint.scale.set(0.78, 0.62, 0.52);
    const thighMesh = solid(hip, capsule(0.068, P.thigh), glass);
    thighMesh.position.y = -P.thigh / 2;
    const hipN = emptyRibbon();
    fillLimb(hipN, P.thigh, 18, 0.048, 0.05, 0.00014, 0.6, side * 2.4, side);
    pushCurve(
      hipN,
      7,
      (u) =>
        new THREE.Vector3(
          side * (0.008 + u * 0.036),
          0.01 + Math.sin(u * Math.PI) * 0.01,
          -0.01 + u * 0.02,
        ),
      0.26,
      0.0002,
      0.32,
      0.16,
      0.2,
    );
    commitRibbon(hip, hipN, nerve);

    const knee = new THREE.Group();
    knee.userData.lockKey = "knee";
    knee.position.y = -P.thigh;
    hip.add(knee);
    const cap = solid(knee, new THREE.SphereGeometry(0.024, 10, 8), bright);
    cap.scale.set(0.74, 0.58, 0.48);
    cap.position.z = 0.008;
    const shinMesh = solid(knee, capsule(0.046, P.shin), glass);
    shinMesh.position.y = -P.shin / 2;
    const shinN = emptyRibbon();
    fillLimb(shinN, P.shin, 14, 0.03, 0.08, 0.00012, 0.55, 3.1 + side, side);
    commitRibbon(knee, shinN, nerve);

    const ankle = new THREE.Group();
    ankle.userData.lockKey = "ankle";
    ankle.position.y = -P.shin;
    knee.add(ankle);
    const ankleJoint = solid(ankle, new THREE.SphereGeometry(0.016, 10, 8), bright);
    ankleJoint.scale.set(0.7, 0.55, 0.46);
    const foot = new THREE.Group();
    ankle.add(foot);
    const footMesh = solid(foot, capsule(0.028, 0.16), glass);
    footMesh.rotation.x = Math.PI / 2;
    footMesh.position.set(0, -0.028, 0.05);
    for (let t = 0; t < 5; t++) {
      const toe = solid(foot, capsule(0.008, 0.028), glass);
      toe.rotation.x = Math.PI / 2;
      toe.position.set((t - 2) * 0.014 * side, -0.02, 0.145);
    }
    const footN = emptyRibbon();
    fillFoot(footN, side);
    commitRibbon(foot, footN, nerve);
  }

  makeLeg(1);
  makeLeg(-1);

  const pelvis = emptyRibbon();
  for (const side of [-1, 1] as const) {
    for (let n = 0; n < 5; n++) {
      const y0 = P.hipY - 0.012 + n * 0.012;
      const y1 = y0 + 0.018 + (n % 2) * 0.016;
      arcBetween(
        pelvis,
        side * 0.02,
        y0,
        -0.012,
        side * (0.07 + (n % 3) * 0.022),
        y1,
        0.018,
        side * 0.012,
        0.12 + n * 0.04,
        0.00012,
        0.34,
        0.3,
      );
      if (n % 2 === 0) {
        arcBetween(
          pelvis,
          side * 0.055,
          y1,
          0.01,
          side * 0.018,
          y1 + 0.028,
          0.02,
          -side * 0.01,
          0.22,
          0.00011,
          0.28,
          0.36,
        );
      }
    }
  }
  commitRibbon(root, pelvis, nerve);
  addShellLight(root, disposables);

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
