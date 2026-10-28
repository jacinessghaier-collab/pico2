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

function radiusAt(radii: readonly number[], t: number) {
  if (radii.length <= 1) return radii[0] ?? 0.02;
  const x = Math.min(1, Math.max(0, t)) * (radii.length - 1);
  const i = Math.min(radii.length - 2, Math.floor(x));
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = radii[i] ?? 0.02;
  const b = radii[i + 1] ?? a;
  return a + (b - a) * s;
}

function shellRadius(localY: number) {
  const pts = SHELL_LATHE;
  const last = pts.length - 1;
  if (localY <= pts[0][1]) return pts[0][0];
  if (localY >= pts[last][1]) return pts[last][0];
  for (let i = 1; i < pts.length; i++) {
    if (localY <= pts[i][1]) {
      const [r0, y0] = pts[i - 1];
      const [r1, y1] = pts[i];
      const t = (localY - y0) / (y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return pts[last][0];
}

/** How far the upper-arm silhouette sits outside the torso. Small at the axilla. */
function armProtrusion(along: number) {
  const t = Math.min(1, Math.max(0, along));
  // No early cap. That bulge was the hard lateral edge on the deltoid.
  return 0.005 + t * t * 0.02;
}

/** Chest-local lateral center of the hugged upper arm. */
function hugCenter(chestLocalY: number, radius: number) {
  const along =
    (LOCK.proportions.shoulderLocalY - chestLocalY) / LOCK.proportions.upperArm;
  const half = shellRadius(chestLocalY) * SHELL_SX;
  return half + armProtrusion(along) - radius;
}

/**
 * Filament axis in chest space. The glass shell is `upperGlass`.
 * This center stays put so the nerve paths from #27 do not move.
 */
function upperCenter(t: number) {
  const u = Math.min(1, Math.max(0, t));
  const r = radiusAt(UPPER_RADII, u);
  const tubeY = BLEND.shoulder * (1 - u) - LOCK.proportions.upperArm * u;
  const y = LOCK.proportions.shoulderLocalY + tubeY;
  const hugged = hugCenter(y, r);
  const shoulderHalf = shellRadius(LOCK.proportions.shoulderLocalY) * SHELL_SX;
  // The old shell sat 0.034 outside the shoulder. Filaments still follow it.
  const line = shoulderHalf + 0.034;
  const free = line - r;
  const hold = 1 - hermite(0.12, 0.4, u);
  let center = hugged * hold + free * (1 - hold);
  const toElbow = hermite(0.62, 0.96, u);
  center = center * (1 - toElbow) + LOCK.proportions.shoulderX * toElbow;
  return { r, y, center };
}

/**
 * Glass upper arm. The outer rim stays on the shoulder line or inside it.
 * Where a full biceps would enter the ribs, the tube slims instead.
 */
function upperGlass(t: number) {
  const src = upperCenter(t);
  const u = Math.min(1, Math.max(0, t));
  const shoulderHalf = shellRadius(LOCK.proportions.shoulderLocalY) * SHELL_SX;
  const torsoHalf = shellRadius(src.y) * SHELL_SX;
  const gap = 0.008;
  const outerCap = shoulderHalf;
  const span = outerCap - (torsoHalf + gap);
  const free = hermite(0.18, 0.46, u) * (1 - hermite(0.72, 0.94, u));
  const room = Math.max(0, span * 0.5);
  const fitR = src.r * (1 - free) + Math.min(src.r, room) * free;
  const parked = outerCap - fitR;
  let center = src.center + (Math.min(src.center, parked) - src.center) * free;
  if (center + fitR > outerCap) center = outerCap - fitR;
  return { r: fitR, y: src.y, center };
}

/** Round upper arm. A flat ellipse puts a hard rim on the lateral pole. */
function upperSection(t: number, a: number, r: number) {
  const glass = upperGlass(t);
  const bone = Math.max(1e-4, radiusAt(UPPER_RADII, Math.min(1, Math.max(0, t))));
  const rad = glass.r * (r / bone);
  const belly = Math.exp(-((t - 0.5) ** 2) / 0.07);
  const s = Math.sin(a);
  const depth = 0.98 + (s > 0 ? 0.06 * belly : 0.03 * belly);
  return { x: Math.cos(a) * rad, z: s * rad * depth };
}

/**
 * Calf cross-section. Two gastrocnemius heads sit behind a flat tibia:
 * the lateral head higher, the medial head lower and fuller, with a
 * groove between them. The frontal width is inside the old spindle.
 * The posterior belly stays, so the side view keeps the gut.
 */
function shinSection(t: number, a: number, r: number, side: 1 | -1) {
  const s = Math.sin(a);
  const c = Math.cos(a);
  const outward = side * c;
  const front = Math.max(0, s);
  const back = Math.max(0, -s);
  const belly = Math.exp(-((t - 0.5) ** 2) / 0.04);
  const risen = hermite(0.22, 0.42, t) * (1 - hermite(0.7, 0.9, t));
  const mass = belly * risen;
  const latT = Math.exp(-((t - 0.38) ** 2) / 0.016);
  const medT = Math.exp(-((t - 0.58) ** 2) / 0.018);
  const live = hermite(0.14, 0.32, t) * (1 - hermite(0.78, 0.94, t));
  const lat = Math.exp(-((outward - 0.78) ** 2) / 0.05) * back;
  const med = Math.exp(-((outward + 0.82) ** 2) / 0.045) * back;
  const groove = Math.exp(-(outward * outward) / 0.16) * back;
  const xScale = 0.84 - 0.1 * Math.exp(-((t - 0.55) ** 2) / 0.03);
  const x =
    c * r * xScale + side * lat * latT * live * r * 0.9 - side * med * medT * live * r * 0.62;
  const zFront = front ** 1.7 * r * (0.36 - 0.12 * mass);
  const zBack = back ** 0.85 * r * (0.78 + 0.75 * mass);
  const z =
    zFront -
    zBack -
    lat * latT * live * r * 1.0 -
    med * medT * live * r * 1.2 +
    groove * Math.max(latT, medT) * live * mass * r * 1.15;
  return { x, z };
}

/** Frontal half-width of the calf glass. The aura wraps this, not the bone radius. */
function shinHalf(t: number) {
  const u = Math.min(1, Math.max(0, t));
  const r = radiusAt(SHIN_RADII, u);
  let reach = 0;
  for (let j = 0; j < 36; j++) {
    const p = shinSection(u, (j / 36) * Math.PI * 2, r, 1);
    reach = Math.max(reach, Math.abs(p.x));
  }
  return reach;
}

/** 0 inside the torso glass, 1 once the vertex clears the skin. */
function skinFade(x: number, y: number, z: number) {
  const rad = Math.max(0.02, shellRadius(y));
  const hx = rad * SHELL_SX;
  const hz = rad * 0.72;
  const e = (x * x) / (hx * hx) + (z * z) / (hz * hz);
  return hermite(0.62, 1.04, e);
}

type TubeOpts = {
  /** Extra radius at the hidden proximal tip so the child wraps the parent rim. */
  sleeve?: number;
  /** 2 tucks only the root. Lower keeps the limb against the torso longer. */
  tuckPower?: number;
  /** Drop the rim where the tube sits inside the torso. No second edge, no orb. */
  bury?: boolean;
  /** Child of a bend: stay clear of the joint so the bridge owns the seam. */
  join?: "child";
  /** Keep the outer rim against the torso through the axilla. */
  hug?: boolean;
  /** Local XZ of the ring. Default is the flat limb ellipse. */
  section?: (t: number, angle: number, radius: number) => { x: number; z: number };
  /** Ring segments. The calf needs a finer ring so the groove is a real valley. */
  seg?: number;
};

/**
 * Open tube. Proximal rings tuck into the parent and fade in.
 * Distal rings fade out over `dist`, which matches the child tube's `prox`.
 * A sleeve hides the cylinder rim. No end-cap and no sphere.
 */
function organicTube(
  radii: readonly number[],
  length: number,
  side: 1 | -1,
  inset: number,
  prox: number,
  dist: number,
  opts?: TubeOpts,
) {
  const seg = opts?.seg ?? 22;
  const rings = 24;
  const sleeve = opts?.sleeve ?? 0;
  const tuckPower = opts?.tuckPower ?? 2;
  const bury = opts?.bury ?? false;
  const shoulderX = LOCK.proportions.shoulderX;
  const shoulderY = LOCK.proportions.shoulderLocalY;
  const pos: number[] = [];
  const fade: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const y = prox * (1 - t) - length * t;
    let r = radiusAt(radii, t);
    if (sleeve > 0 && prox > 0) {
      const tip = 1 - hermite(prox, 0, y);
      r *= 1 + sleeve * tip;
    }
    let bias = -side * inset * Math.pow(1 - t, tuckPower);
    if (opts?.hug) bias = side * (upperGlass(t).center - shoulderX);
    let cover = 1;
    if (opts?.join === "child" && prox > 0) cover = Math.min(cover, hermite(0, -prox, y));
    else if (prox > 0) cover = Math.min(cover, hermite(prox, 0, y));
    if (dist > 0) cover = Math.min(cover, hermite(-length, -length + dist, y));
    if (opts?.join === "child" && prox > 0 && y > -prox) {
      const held = radii[0] ?? r;
      const u = hermite(0, -prox, y);
      r = held + (r - held) * u;
    }
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const local = opts?.section
        ? opts.section(t, a, r)
        : { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.8 };
      const x = local.x + bias;
      const z = local.z;
      let ring = cover;
      if (bury) ring *= skinFade(side * shoulderX + x, shoulderY + y, z);
      pos.push(x, y, z);
      fade.push(ring);
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

/**
 * Constant-radius lathe across a bend. Ends fade inside the two bones.
 * The joint itself is this tube, so the rim is not a second cylinder edge.
 */
function jointBridge(radius: number, span: number) {
  const rings = 18;
  const seg = 22;
  const pos: number[] = [];
  const fade: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const y = span * (1 - 2 * t);
    const cover = hermite(0, 0.32, t) * hermite(1, 0.68, t);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * radius, y, Math.sin(a) * radius * 0.8);
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

/** Drop the torso rim only where a limb already owns that silhouette. */
function fadeTorsoSides(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position");
  const fade = new Float32Array(pos.count);
  const P = LOCK.proportions;
  const yTop = P.shoulderLocalY;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * SHELL_SX;
    const y = pos.getY(i);
    const z = pos.getZ(i) * 0.72;
    let cover = 1;
    // Only the shell the arm already covers. The front of the chest stays,
    // so the pec rim does not invert.
    const yBot = yTop - P.upperArm;
    if (y < yTop + 0.04 && y > yBot + 0.05) {
      const tubeY = y - yTop;
      const t = (BLEND.shoulder - tubeY) / (BLEND.shoulder + P.upperArm);
      if (t > 0.02 && t < 0.9) {
        const arm = upperGlass(Math.min(1, Math.max(0, t)));
        if (Math.abs(z) < arm.r * 0.5) {
          for (const side of [1, -1] as const) {
            const ex = (x - side * arm.center) / (arm.r * 0.92);
            const ez = z / (arm.r * 0.9);
            const inside = ex * ex + ez * ez;
            if (inside < 1) cover = Math.min(cover, hermite(0.08, 0.62, inside));
          }
        }
      }
    }
    fade[i] = cover;
  }
  geo.setAttribute("aFade", new THREE.Float32BufferAttribute(fade, 1));
}

/**
 * Deltoid slope from the neck base out to the arm root.
 * A swept lathe, buried where it enters the torso. Not a joint sphere.
 */
function shoulderSlope(side: 1 | -1) {
  const samples = 16;
  const seg = 16;
  const pos: number[] = [];
  const fade: number[] = [];
  const idx: number[] = [];
  const p0 = new THREE.Vector3(side * 0.07, 0.44, 0);
  const p1 = new THREE.Vector3(side * 0.2, 0.33, 0.01);
  const p2 = new THREE.Vector3(side * 0.17, 0.18, 0.006);
  const c = new THREE.Vector3();
  const tang = new THREE.Vector3();
  const sideV = new THREE.Vector3();
  const bin = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const u = 1 - t;
    c.set(0, 0, 0)
      .addScaledVector(p0, u * u)
      .addScaledVector(p1, 2 * u * t)
      .addScaledVector(p2, t * t);
    tang.set(0, 0, 0)
      .addScaledVector(p0, -2 * u)
      .addScaledVector(p1, 2 * (u - t))
      .addScaledVector(p2, 2 * t);
    if (tang.lengthSq() < 1e-8) tang.set(side, -1, 0);
    tang.normalize();
    sideV.crossVectors(tang, up);
    if (sideV.lengthSq() < 1e-8) sideV.set(1, 0, 0);
    sideV.normalize();
    bin.crossVectors(sideV, tang).normalize();
    const rad = 0.016 + Math.sin(Math.PI * t) * 0.02;
    const end = hermite(0, 0.16, t) * hermite(1, 0.7, t);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const x = c.x + sideV.x * Math.cos(a) * rad + bin.x * Math.sin(a) * rad * 0.62;
      const y = c.y + sideV.y * Math.cos(a) * rad + bin.y * Math.sin(a) * rad * 0.62;
      const z = c.z + sideV.z * Math.cos(a) * rad + bin.z * Math.sin(a) * rad * 0.62;
      pos.push(x, y, z);
      fade.push(end * skinFade(x, y, z));
    }
  }
  const row = seg + 1;
  for (let i = 0; i < samples - 1; i++) {
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

/** Sole kiss in world Y. The ground pool stays the short oval under the ankle. */
const SOLE_KISS = 0.014;

/**
 * Foot as a lathe along its length. Heel and toe close (no open rim).
 * The sole dips at heel and ball and lifts through the arch.
 */
function footLathe() {
  const steps = 32;
  const seg = 20;
  const z0 = -0.046;
  const z1 = 0.168;
  const pos: number[] = [];
  const idx: number[] = [];
  let minY = Infinity;
  for (let i = 0; i < steps; i++) {
    const u = i / (steps - 1);
    const end = Math.min(hermite(0, 0.1, u), hermite(1, 0.58, u));
    const heel = Math.exp(-((u - 0.14) ** 2) / 0.012);
    const arch = Math.exp(-((u - 0.46) ** 2) / 0.016);
    const ball = Math.exp(-((u - 0.72) ** 2) / 0.011);
    const ankle = Math.exp(-((u - 0.24) ** 2) / 0.008);
    const width = (0.018 + 0.01 * heel + 0.018 * ball) * (0.18 + 0.82 * end);
    const height =
      (0.016 + 0.046 * heel + 0.014 * ball + 0.05 * ankle) * (0.12 + 0.88 * end);
    const toeLift = hermite(0.68, 1, u) * 0.016 * end;
    const sole = -0.03 + 0.024 * arch * end + toeLift;
    const z = z0 + (z1 - z0) * u;
    for (let j = 0; j <= seg; j++) {
      const ang = (j / seg) * Math.PI * 2;
      const cx = Math.cos(ang);
      const sy = Math.sin(ang);
      const yk = sy < 0 ? -Math.pow(-sy, 0.92) : sy;
      const y = sole + ((yk + 1) * 0.5) * height;
      const x = cx * width * (sy < 0 ? 0.92 : 1);
      if (y < minY) minY = y;
      pos.push(x, y, z);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < steps - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return { geo, minY };
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
/**
 * Athletic torso, same neck span as before. Radii are the lathe, before SHELL_SX.
 * Waist stays narrower than chest and iliac. Neck top is unchanged so the skull sits.
 */
const SHELL_LATHE: Array<[number, number]> = [
  [0.12, -0.34],
  [0.188, -0.29],
  [0.202, -0.22],
  [0.19, -0.15],
  [0.156, -0.06],
  [0.134, 0.02],
  [0.144, 0.08],
  [0.178, 0.14],
  [0.21, 0.19],
  [0.228, 0.24],
  [0.246, 0.29],
  [0.176, 0.35],
  [0.118, 0.39],
  [0.09, 0.43],
  [0.05, 0.5],
];
/** Crossfade length shared by a parent distal end and its child proximal end. */
const BLEND = { elbow: 0.14, knee: 0.14, shoulder: 0.02, hip: 0.05 };
/**
 * Soft biceps, not a deltoid spike. Root is buried; the last sample matches the elbow.
 */
const UPPER_RADII = [0.032, 0.04, 0.048, 0.054, 0.058, 0.052, 0.044, 0.038, 0.034];
/** Forearm belly sits past the elbow blend. Ends match the wrist. */
const FORE_RADII = [0.034, 0.036, 0.044, 0.046, 0.04, 0.03, 0.022];
/** Quad belly, then the knee radius so the bridge stays the same tube. */
const THIGH_RADII = [0.096, 0.104, 0.106, 0.088, 0.066, 0.048, 0.042, 0.042, 0.042];
/**
 * Knee, then the bone radius the filaments still follow.
 * The glass frontal width and the two heads live in shinSection.
 */
const SHIN_RADII = [0.042, 0.044, 0.05, 0.062, 0.074, 0.074, 0.05, 0.034, 0.026];
const LIMB = {
  upper: { r0: UPPER_RADII[0], r1: UPPER_RADII[UPPER_RADII.length - 1], inset: 0.06 },
  fore: { r0: FORE_RADII[0], r1: FORE_RADII[FORE_RADII.length - 1], inset: 0 },
  thigh: { r0: THIGH_RADII[0], r1: THIGH_RADII[THIGH_RADII.length - 1], inset: 0.004 },
  shin: { r0: SHIN_RADII[0], r1: SHIN_RADII[SHIN_RADII.length - 1], inset: 0 },
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
  const limb = (x: number, yTop: number, yBot: number, r0: number, r1: number, inset: number) =>
    `sdLimb(p, ${g4(x)}, ${g4(yTop)}, ${g4(yBot)}, ${g4(r0)}, ${g4(r1)}, ${g4(inset)})`;
  const link = (pts: Array<{ x: number; y: number; r: number }>) =>
    pts
      .slice(1)
      .map((p, i) => {
        const a = pts[i] ?? p;
        return `d = min(d, sdTaper(p, vec2(${g4(a.x)}, ${g4(a.y)}), vec2(${g4(p.x)}, ${g4(p.y)}), ${g4(a.r)}, ${g4(p.r)}));`;
      })
      .join("\n    ");
  const upperPts = (sign: 1 | -1) =>
    UPPER_RADII.map((_, i) => {
      const s = upperGlass(i / (UPPER_RADII.length - 1));
      return { x: sign * s.center, y: chestY + s.y, r: s.r };
    });
  const bonePts = (
    radii: readonly number[],
    sign: 1 | -1,
    x: number,
    yJoint: number,
    yEnd: number,
    inset: number,
    prox: number,
    length: number,
    halfAt?: (t: number) => number,
  ) => {
    const t0 = prox / (prox + length);
    return radii.map((_, i) => {
      const u = radii.length === 1 ? 0 : i / (radii.length - 1);
      const t = t0 + (1 - t0) * u;
      const lean = x - inset * (1 - t) * (1 - t);
      return {
        x: sign * lean,
        y: yJoint + (yEnd - yJoint) * u,
        r: halfAt ? halfAt(t) : radiusAt(radii, t),
      };
    });
  };
  const pair = (pos: string, neg: string) => `
  float d = 8.0;
  if (s > 0.0) {
    ${pos}
  } else {
    ${neg}
  }
  return d;`;
  const hugPair = pair(link(upperPts(1)), link(upperPts(-1)));
  const forePair = pair(
    link(bonePts(FORE_RADII, 1, P.shoulderX, elbowY, wristY, 0, BLEND.elbow, P.foreArm)),
    link(bonePts(FORE_RADII, -1, P.shoulderX, elbowY, wristY, 0, BLEND.elbow, P.foreArm)),
  );
  const thighPair = pair(
    link(bonePts(THIGH_RADII, 1, HIP_X, P.hipY, kneeY, LIMB.thigh.inset, BLEND.hip, P.thigh)),
    link(bonePts(THIGH_RADII, -1, HIP_X, P.hipY, kneeY, LIMB.thigh.inset, BLEND.hip, P.thigh)),
  );
  const shinPair = pair(
    link(bonePts(SHIN_RADII, 1, HIP_X, kneeY, ankleY, 0, BLEND.knee, P.shin, shinHalf)),
    link(bonePts(SHIN_RADII, -1, HIP_X, kneeY, ankleY, 0, BLEND.knee, P.shin, shinHalf)),
  );
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

float sdDeltoid(vec2 p, float s) {
  float neck = sdTaper(p, vec2(s * 0.08, 1.72), vec2(s * 0.21, 1.61), 0.018, 0.034);
  float cap = sdTaper(p, vec2(s * 0.21, 1.61), vec2(s * 0.17, 1.46), 0.034, 0.02);
  return smin(neck, cap, 0.03);
}

float sdHug(vec2 p, float s) {${hugPair}}
float sdFore(vec2 p, float s) {${forePair}}
float sdThigh(vec2 p, float s) {${thighPair}}
float sdShin(vec2 p, float s) {${shinPair}}

float sdBody(vec2 p) {
  float d = sdTorso(p);
  d = smin(d, sdEllipse(p, vec2(0.0, ${g4(headY)}), vec2(${g4(P.headRadius)}, ${g4(P.headRadius * SKULL_SY)})), 0.036);
  d = smin(d, sdDeltoid(p, 1.0), 0.032);
  d = smin(d, sdDeltoid(p, -1.0), 0.032);
  d = smin(d, sdHug(p, 1.0), 0.04);
  d = smin(d, sdHug(p, -1.0), 0.04);
  d = smin(d, sdFore(p, 1.0), 0.028);
  d = smin(d, sdFore(p, -1.0), 0.028);
  d = smin(d, ${limb(P.shoulderX, wristY, wristY - 0.06, 0.022, 0.016, 0)}, 0.018);
  d = smin(d, ${limb(-P.shoulderX, wristY, wristY - 0.06, 0.022, 0.016, 0)}, 0.018);
  d = smin(d, sdThigh(p, 1.0), 0.046);
  d = smin(d, sdThigh(p, -1.0), 0.046);
  d = smin(d, sdShin(p, 1.0), 0.032);
  d = smin(d, sdShin(p, -1.0), 0.032);
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

function fillTorso(ribbon: Ribbon) {
  // Forked plexus inside the current lathe. Radii are read, not retuned.
  // Chest is the fiber mass: short forks and local weaves. Inset. No sternum ball.
  const hair = 0.000175;
  const twigW = 0.00012;
  let seed = 11;
  const h = () => unitHash(seed++);
  const yLo = -0.32;
  const yHi = 0.4;
  const inset = 0.88;
  const box = (y: number) => {
    const r = shellRadius(Math.max(-0.34, Math.min(0.5, y)));
    return {
      x: Math.max(0.012, r * SHELL_SX * inset),
      z: Math.max(0.008, r * 0.72 * inset),
    };
  };
  const massAt = (y: number) => {
    const chest = Math.exp(-((y - 0.19) * (y - 0.19)) / (0.12 * 0.12));
    const column = 0.48 + 0.52 * Math.exp(-((y - 0.06) * (y - 0.06)) / (0.26 * 0.26));
    let m = Math.max(chest, column * 0.78);
    if (y > 0.34) m *= 0.42;
    return Math.min(1, m);
  };

  const nodes: Array<[number, number, number]> = [];
  const budget = { n: 0 };
  const cap = 3400;

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
    const yA = Math.max(yLo, Math.min(yHi, y0));
    const yB = Math.max(yLo, Math.min(yHi, y1));
    const fit = (x: number, z: number, y: number) => {
      const b = box(y);
      const e = (x * x) / (b.x * b.x) + (z * z) / (b.z * b.z);
      if (e <= 1) return [x, z] as const;
      const s = 0.98 / Math.sqrt(e);
      return [x * s, z * s] as const;
    };
    const [ax, az] = fit(x0, z0, yA);
    const [bx, bz] = fit(x1, z1, yB);
    if (Math.hypot(bx - ax, yB - yA) < 0.008) return null;
    arcBetween(
      ribbon,
      ax,
      yA,
      az,
      bx,
      yB,
      bz,
      (h() - 0.5) * 0.012,
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
  let sz = 0.01;
  const spine: Array<[number, number, number]> = [[sx, sy, sz]];
  for (let i = 0; i < 22; i++) {
    const end = strand(
      sx,
      sy,
      sz,
      sx + (h() - 0.5) * 0.014,
      sy - 0.032,
      sz + (h() - 0.5) * 0.01,
      0.04 + (i % 4) * 0.01,
      hair,
      0.4,
      0.58,
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
    room: { n: number },
  ) => {
    const roomCap = dense ? 16 : 9;
    if (depth > (dense ? 4 : 3) || len < 0.008 || budget.n >= cap || room.n >= roomCap) return;
    if (y > yHi || y < yLo) return;
    const sway = (h() - 0.5) * (depth === 0 ? 0.5 : 0.95);
    const a = ang + sway;
    const ny = y + Math.cos(a) * len;
    const nx = x + Math.sin(a) * len;
    const nz = z + (h() - 0.5) * len * 0.65;
    const end = strand(
      x,
      y,
      z,
      nx,
      ny,
      nz,
      0.06 + depth * 0.035,
      depth >= 2 ? twigW : width,
      gain,
      depth < 2 ? 0.4 : 0.22,
    );
    if (!end) return;
    room.n += 1;
    const spread = 0.65 + h() * 0.55;
    const keep = 0.7 + h() * 0.1;
    grow(end[0], end[1], end[2], a - spread, len * keep, depth + 1, width * 0.9, gain * 0.88, dense, room);
    const fork = dense ? h() > 0.22 : h() > 0.58;
    if (fork) {
      grow(
        end[0],
        end[1],
        end[2],
        a + spread * (0.55 + h() * 0.4),
        len * keep * 0.78,
        depth + 1,
        width * 0.8,
        gain * 0.84,
        dense,
        room,
      );
    }
  };

  const sow = (x: number, y: number, z: number) => {
    const dense = massAt(y) > 0.62;
    const room = { n: 0 };
    const len = (dense ? 0.03 : 0.034) + h() * 0.014;
    const lateral = h() < 0.28;
    const aim = lateral
      ? (h() < 0.5 ? -1 : 1) * (0.55 + h() * 1.15)
      : Math.PI + (h() - 0.5) * 1.7;
    grow(x, y, z, aim, len, 0, dense ? hair : twigW, dense ? 0.4 : 0.26, dense, room);
  };

  const bands: number[] = [];
  for (let band = 0; band < 18; band++) {
    bands.push(yLo + ((band + 0.5) / 18) * (yHi - yLo));
  }
  bands.sort((a, b) => massAt(b) - massAt(a));
  for (const y of bands) {
    const m = massAt(y);
    const b = box(y);
    const seeds = 4 + Math.round(m * 16);
    for (let k = 0; k < seeds; k++) {
      const ang = h() * Math.PI * 2;
      const rad = 0.16 + Math.sqrt(h()) * (0.55 + m * 0.25);
      sow(Math.cos(ang) * b.x * rad, y, Math.sin(ang) * b.z * rad * (0.4 + h() * 0.55));
    }
  }

  for (const [x, y, z] of spine) {
    if (budget.n >= cap || h() > 0.4) continue;
    const dense = massAt(y) > 0.62;
    const room = { n: 0 };
    const side = h() < 0.5 ? -1 : 1;
    grow(
      x,
      y,
      z,
      side * (0.85 + h() * 0.7),
      (dense ? 0.028 : 0.034) + h() * 0.01,
      0,
      hair,
      dense ? 0.26 : 0.16,
      dense,
      room,
    );
  }

  const cell = 0.034;
  const bins = new Map<string, Array<[number, number, number]>>();
  for (const p of nodes) {
    const k = `${Math.round(p[0] / cell)}:${Math.round(p[1] / cell)}:${Math.round(p[2] / cell)}`;
    const list = bins.get(k);
    if (list) list.push(p);
    else bins.set(k, [p]);
  }
  let links = 0;
  for (const pool of bins.values()) {
    if (links >= 720 || pool.length < 2) continue;
    let local = 0;
    for (let a = 0; a < pool.length && links < 720 && local < 5; a++) {
      const b = pool[(a * 3 + 1) % pool.length];
      if (b === pool[a]) continue;
      const [x, y, z] = pool[a];
      const [x2, y2, z2] = b;
      const chest = massAt((y + y2) * 0.5) > 0.55;
      if (!chest && h() > 0.5) continue;
      const d = Math.hypot(x2 - x, y2 - y, (z2 - z) * 1.4);
      if (d < 0.008 || d > (chest ? 0.05 : 0.038)) continue;
      arcBetween(
        ribbon,
        x,
        y,
        z,
        x2,
        y2,
        z2,
        (h() - 0.5) * 0.008,
        0.08 + (links % 5) * 0.015,
        twigW * 0.8,
        chest ? 0.24 : 0.14,
        chest ? 0.32 : 0.18,
      );
      links += 1;
      local += 1;
    }
  }
}

function upperAxis(side: 1 | -1) {
  const prox = BLEND.shoulder;
  const length = LOCK.proportions.upperArm;
  const pin = LOCK.proportions.shoulderX;
  return (u: number) => {
    const t = (prox + u * length) / (prox + length);
    return side * (upperCenter(Math.min(1, Math.max(0, t))).center - pin);
  };
}

function fillLimb(
  ribbon: Ribbon,
  length: number,
  radii: readonly number[],
  rank: number,
  width: number,
  gain: number,
  seed: number,
  side: number,
  axisX?: (u: number) => number,
) {
  // Thin trunks and short twigs inside the current tube. Not full-length lanes.
  let n = Math.round(seed * 19 + length * 80 + radii.length);
  const h = () => unitHash(n++);
  const flat = 0.8;
  const axis = axisX ?? (() => 0);
  const reachX = (u: number) => radiusAt(radii, u) * 0.76;
  const reachZ = (u: number) => radiusAt(radii, u) * flat * 0.76;
  const clamp = (v: number, reach: number) => Math.max(-reach, Math.min(reach, v));
  const mean = radii.reduce((sum, r) => sum + r, 0) / Math.max(1, radii.length);
  const laneCount = mean > 0.055 ? 3 : 2;
  const lanes = Array.from({ length: laneCount }, (_, i) => {
    const spread = laneCount === 2 ? (i === 0 ? -0.46 : 0.42) : (i - 1) * 0.4;
    return {
      x: spread + (h() - 0.5) * 0.1,
      z: (h() - 0.5) * 0.32,
      phase: h() * Math.PI * 2,
    };
  });
  const point = (t: number, lane: (typeof lanes)[number]) => {
    const u = Math.min(0.96, Math.max(0.06, t));
    const rx = reachX(u);
    const rz = reachZ(u);
    const wander = Math.min(rx, rz) * 0.24;
    return new THREE.Vector3(
      axis(u) +
        clamp(side * rx * 0.04 + lane.x * rx + Math.sin(u * Math.PI * 1.25 + lane.phase) * wander, rx),
      -u * length,
      clamp(lane.z * rz + Math.sin(u * Math.PI * 0.8 + lane.phase * 1.35) * wander * 0.85, rz),
    );
  };

  for (const lane of lanes) {
    pushCurve(ribbon, 14, (u) => point(u, lane), Math.min(0.8, rank), width, gain * 0.62, 0.3, 0.22);
  }

  const twigs = Math.round(36 + length * 96 + mean * 240);
  for (let s = 0; s < 5; s++) {
    const lane = lanes[s % lanes.length];
    const t0 = 0.06 + h() * 0.45;
    const span = 0.22 + h() * 0.28;
    const drift = (h() - 0.5) * 0.55;
    const zDrift = (h() - 0.5) * 0.35;
    pushCurve(
      ribbon,
      8,
      (u) => {
        const t = Math.min(0.96, t0 + u * span);
        const p = point(t, lane);
        const rx = reachX(t);
        const rz = reachZ(t);
        p.x = axis(t) + clamp(p.x - axis(t) + drift * rx * u, rx);
        p.z = clamp(p.z + zDrift * rz * u, rz);
        return p;
      },
      Math.min(0.8, rank + 0.05),
      Math.max(width * 0.7, 0.00009),
      gain * 0.46,
      0.22,
      0.35,
    );
  }
  for (let f = 0; f < twigs; f++) {
    const lane = lanes[f % lanes.length];
    const t0 = 0.07 + h() * 0.86;
    const origin = point(t0, lane);
    const rx = reachX(t0);
    const rz = reachZ(t0);
    const dir = h() < 0.72 ? (h() < 0.5 ? -1 : 1) * (0.35 + h() * 1.15) : h() * Math.PI * 2;
    const span = 0.62 + h() * 0.34;
    const tx = axis(t0) + clamp(Math.cos(dir) * rx * span, rx);
    const tz = clamp(Math.sin(dir) * rz * span * 0.65, rz);
    const tipY = Math.max(-length * 0.98, origin.y - (0.07 + h() * 0.14) * length);
    pushCurve(
      ribbon,
      3,
      (u) =>
        new THREE.Vector3(
          origin.x + (tx - origin.x) * u,
          origin.y + (tipY - origin.y) * u,
          origin.z + (tz - origin.z) * u,
        ),
      Math.min(0.8, rank + 0.03 + (f % 4) * 0.012),
      Math.max(width * 0.72, 0.00009),
      gain * 0.5,
      0.2,
      0.5,
    );
    if (h() < 0.42) {
      const fdir = dir + (h() < 0.5 ? 0.7 : -0.7);
      const fx = axis(t0) + clamp(Math.cos(fdir) * rx * span * 0.62, rx);
      const fz = clamp(Math.sin(fdir) * rz * span * 0.4, rz);
      const fy = Math.max(-length * 0.98, tipY - length * 0.03);
      pushCurve(
        ribbon,
        2,
        (u) => new THREE.Vector3(tx + (fx - tx) * u, tipY + (fy - tipY) * u, tz + (fz - tz) * u),
        Math.min(0.82, rank + 0.1),
        Math.max(width * 0.55, 0.000075),
        gain * 0.34,
        0.14,
        0.65,
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

  const torsoGeo = new THREE.LatheGeometry(
    SHELL_LATHE.map(([r, y]) => new THREE.Vector2(r, y)),
    28,
  );
  fadeTorsoSides(torsoGeo);
  const torso = solid(chest, torsoGeo, glass);
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
    solid(chest, shoulderSlope(side), glass);
    const upperMesh = solid(
      shoulder,
      organicTube(
        UPPER_RADII,
        P.upperArm,
        side,
        LIMB.upper.inset,
        BLEND.shoulder,
        BLEND.elbow,
        { bury: true, hug: true, section: upperSection },
      ),
      glass,
    );
    const upperN = emptyRibbon();
    fillLimb(upperN, P.upperArm, UPPER_RADII, 0.05, 0.00011, 0.5, side * 1.3, side, upperAxis(side));
    commitRibbon(shoulder, upperN, nerve);

    const elbow = new THREE.Group();
    elbow.position.y = -P.upperArm;
    shoulder.add(elbow);
    solid(elbow, jointBridge(LIMB.fore.r0, BLEND.elbow), glass);
    const foreMesh = solid(
      elbow,
      organicTube(FORE_RADII, P.foreArm, side, 0, BLEND.elbow, 0, {
        join: "child",
      }),
      glass,
    );
    const foreN = emptyRibbon();
    fillLimb(foreN, P.foreArm, FORE_RADII, 0.07, 0.00009, 0.42, side * 2.1, side);
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
        THIGH_RADII,
        P.thigh,
        side,
        LIMB.thigh.inset,
        BLEND.hip,
        BLEND.knee,
      ),
      glass,
    );
    const hipN = emptyRibbon();
    fillLimb(
      hipN,
      P.thigh,
      THIGH_RADII,
      0.05,
      0.00011,
      0.48,
      side * 2.4,
      side,
      (u) => -side * LIMB.thigh.inset * (1 - u) * (1 - u),
    );
    commitRibbon(hip, hipN, nerve);

    const knee = new THREE.Group();
    knee.userData.lockKey = "knee";
    knee.position.y = -P.thigh;
    hip.add(knee);
    solid(knee, jointBridge(LIMB.shin.r0, BLEND.knee), glass);
    const shinMesh = solid(
      knee,
      organicTube(SHIN_RADII, P.shin, side, 0, BLEND.knee, 0.035, {
        join: "child",
        seg: 36,
        section: (t, a, r) => shinSection(t, a, r, side),
      }),
      glass,
    );
    const shinN = emptyRibbon();
    fillLimb(shinN, P.shin, SHIN_RADII, 0.07, 0.000085, 0.4, 3.1 + side, side);
    commitRibbon(knee, shinN, nerve);

    const ankle = new THREE.Group();
    ankle.userData.lockKey = "ankle";
    ankle.position.y = -P.shin;
    knee.add(ankle);
    const foot = new THREE.Group();
    ankle.add(foot);
    const shaped = footLathe();
    const footMesh = solid(foot, shaped.geo, glass);
    const ankleY = P.hipY - P.thigh - P.shin;
    footMesh.position.y = SOLE_KISS - ankleY - shaped.minY;
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
