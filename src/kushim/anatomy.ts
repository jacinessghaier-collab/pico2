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
  dispose: () => void;
};

/**
 * Oblique-rear lobe. `uRimPower` stays the frontal exponent.
 * `open` is the exponent once the figure is yawed and the vertex is marked.
 * `view0`/`view1` are the smoothstep on |object-space view X|.
 * A frontal camera keeps viewX under view0, so the shell is unchanged.
 */
export const RIM_OBLIQUE = { open: 1.2, view0: 0.2, view1: 0.55 } as const;

/**
 * Body band. Frontal exponent stays above the calf's open lobe.
 * Oblique softens it a little more. Skull stays on `uRimPower`.
 */
export const RIM_BODY = { front: 2.85, oblique: 2.2 } as const;

/**
 * Transmission depth compiled into the shell. Not a LOCK uniform: the
 * #34/#35 Fresnel lobe stays `fres * uRim`, and these terms are zero at the
 * silhouette peak and on an unmarked calf. `farOpen` is the far-wall exponent.
 * `farGain` scales only the shoulder past the locked lobe. `wallGain` is the
 * near wall, in the grazing band where the locked lobe is still quiet.
 * `cap` keeps the added alpha under a hull.
 */
export const GLASS_TRANSMIT = {
  farOpen: 1.28,
  farGain: 0.55,
  wallLo: 0.08,
  wallMid: 0.28,
  wallHi: 0.55,
  wallGain: 0.22,
  cap: 0.34,
} as const;

const shellVert = /* glsl */ `
attribute float aFade;
attribute float aKante;
attribute float aBand;
attribute float aTransmit;
varying vec3 vN;
varying vec3 vW;
varying float vFade;
varying float vKante;
varying float vBand;
varying float vViewX;
varying float vTransmit;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  vec3 viewDir = normalize(cameraPosition - vW);
  vec3 viewObj = normalize(transpose(mat3(modelMatrix)) * viewDir);
  float k = clamp(aKante, 0.0, 1.0);
  float oblique = smoothstep(${RIM_OBLIQUE.view0.toFixed(2)}, ${RIM_OBLIQUE.view1.toFixed(2)}, abs(viewObj.x));
  // Posterior heads face away from a frontal camera. When the figure yaws,
  // bend each head onto the view plane so the far head grazes too.
  vec3 back = normalize(vec3(position.x * 5.5, 0.0, -1.0));
  vec3 grazed = back - viewObj * dot(back, viewObj);
  float gLen = length(grazed);
  grazed = gLen > 0.001 ? grazed / gLen : normal;
  vec3 nLocal = normalize(mix(normal, grazed, oblique * k * 0.82));
  vN = normalize(mat3(modelMatrix) * nLocal);
  vFade = aFade;
  vKante = aKante;
  vBand = aBand;
  vTransmit = aTransmit;
  vec3 ax = normalize(vec3(modelMatrix[0]));
  vViewX = abs(dot(ax, viewDir));
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
varying float vKante;
varying float vBand;
varying float vViewX;
varying float vTransmit;
void main() {
  vec3 viewDir = normalize(cameraPosition - vW);
  float ndv = abs(dot(normalize(vN), viewDir));
  float grazing = clamp(1.0 - ndv, 0.0, 1.0);
  float oblique = smoothstep(${RIM_OBLIQUE.view0.toFixed(2)}, ${RIM_OBLIQUE.view1.toFixed(2)}, vViewX);
  float k = clamp(vKante, 0.0, 1.0);
  float band = clamp(vBand, 0.0, 1.0);
  float calfOpen = mix(uRimPower, ${RIM_OBLIQUE.open.toFixed(2)}, oblique * k);
  float bodyOpen = mix(${RIM_BODY.front.toFixed(2)}, ${RIM_BODY.oblique.toFixed(2)}, oblique);
  // Calf mark keeps the #34 mix. Body widens only where that mark is off.
  float open = mix(calfOpen, bodyOpen, band * (1.0 - k));
  float fres = pow(grazing, open);
  // Two walls. The locked lobe above is unchanged. Depth is only the shoulder
  // past that lobe, on meshes marked aTransmit, and never on the calf mark.
  // Front: a near-wall band inside the rim. Back: the far wall, wider, so the
  // shell has thickness. Facing centers stay on uFill and read clear.
  float mask = clamp(vTransmit, 0.0, 1.0) * (1.0 - k);
  float depth = 0.0;
  if (mask > 0.001) {
    if (gl_FrontFacing) {
      float slopeIn = smoothstep(${GLASS_TRANSMIT.wallLo.toFixed(2)}, ${GLASS_TRANSMIT.wallMid.toFixed(2)}, grazing);
      float slopeOut = smoothstep(${GLASS_TRANSMIT.wallMid.toFixed(2)}, ${GLASS_TRANSMIT.wallHi.toFixed(2)}, grazing);
      depth = slopeIn * (1.0 - slopeOut) * uRim * ${GLASS_TRANSMIT.wallGain.toFixed(2)} * mask;
    } else {
      float farOpen = mix(open, ${GLASS_TRANSMIT.farOpen.toFixed(2)}, mask);
      float farFres = pow(grazing, farOpen);
      depth = max(0.0, farFres - fres) * uRim * ${GLASS_TRANSMIT.farGain.toFixed(2)} * mask;
    }
    depth = min(depth, ${GLASS_TRANSMIT.cap.toFixed(2)});
  }
  float spine = exp(-abs(vW.x) * uSpineTight)
    * smoothstep(0.62, 1.04, vW.y)
    * smoothstep(1.54, 1.26, vW.y);
  vec3 chest = vW - vec3(0.0, 1.32, 0.04);
  float star = exp(-dot(chest, chest) * uStarTight);
  float alpha = (fres * uRim * uBoost + uFill * uBoost + depth + spine * uSpine + star * uStar) * vFade;
  if (alpha < 0.012) discard;
  vec3 col = mix(uColor, uCore, clamp(fres * 0.38 + spine * 0.18, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
}
`;

function smoothstep01(edge0: number, edge1: number, x: number) {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / span));
  return t * t * (3 - 2 * t);
}

/** Same lobe as `glassFrag`. Spine, star, and transmission stay out. */
export function calfRimAlpha(
  ndot: number,
  kante: number,
  viewX: number,
  fade = 1,
  band = 0,
) {
  const grazing = Math.min(1, Math.max(0, 1 - Math.abs(ndot)));
  const oblique = smoothstep01(RIM_OBLIQUE.view0, RIM_OBLIQUE.view1, Math.abs(viewX));
  const k = Math.min(1, Math.max(0, kante));
  const b = Math.min(1, Math.max(0, band));
  const calfOpen =
    LOCK.glass.rimPower + (RIM_OBLIQUE.open - LOCK.glass.rimPower) * oblique * k;
  const bodyOpen = RIM_BODY.front + (RIM_BODY.oblique - RIM_BODY.front) * oblique;
  const open = calfOpen + (bodyOpen - calfOpen) * b * (1 - k);
  const fres = grazing ** open;
  return (fres * LOCK.glass.rim + LOCK.glass.fill) * fade;
}

/**
 * Added alpha from the far wall or the near-wall band.
 * Same curve as `glassFrag`. Zero at a facing center, at the rim peak,
 * and wherever the calf mark or the transmit mask is off.
 */
export function transmissionAlpha(
  grazing: number,
  open: number,
  kante: number,
  transmit: number,
  front: boolean,
  rim = LOCK.glass.rim,
) {
  const g = Math.min(1, Math.max(0, grazing));
  const mask = Math.min(1, Math.max(0, transmit)) * (1 - Math.min(1, Math.max(0, kante)));
  if (mask <= 0.001) return 0;
  const fres = g ** open;
  let depth = 0;
  if (front) {
    const slopeIn = smoothstep01(GLASS_TRANSMIT.wallLo, GLASS_TRANSMIT.wallMid, g);
    const slopeOut = smoothstep01(GLASS_TRANSMIT.wallMid, GLASS_TRANSMIT.wallHi, g);
    depth = slopeIn * (1 - slopeOut) * rim * GLASS_TRANSMIT.wallGain * mask;
  } else {
    const farOpen = open + (GLASS_TRANSMIT.farOpen - open) * mask;
    const farFres = g ** farOpen;
    depth = Math.max(0, farFres - fres) * rim * GLASS_TRANSMIT.farGain * mask;
  }
  return Math.min(depth, GLASS_TRANSMIT.cap);
}

/**
 * Object-space normal the glass vertex shader uses for a calf mark.
 * Frontal view keeps the authored normal. A yaw bends each head onto the
 * view plane so the far head grazes without lighting the front.
 */
export function bendCalfNormal(
  nx: number,
  ny: number,
  nz: number,
  x: number,
  viewX: number,
  viewY: number,
  viewZ: number,
  kante: number,
) {
  const k = Math.min(1, Math.max(0, kante));
  const vlen = Math.hypot(viewX, viewY, viewZ) || 1;
  const ox = viewX / vlen;
  const oy = viewY / vlen;
  const oz = viewZ / vlen;
  const oblique = smoothstep01(RIM_OBLIQUE.view0, RIM_OBLIQUE.view1, Math.abs(ox));
  const bl = Math.hypot(x * 5.5, 0, -1) || 1;
  const bnx = (x * 5.5) / bl;
  const bnz = -1 / bl;
  const dot = bnx * ox + bnz * oz;
  let gx = bnx - ox * dot;
  let gy = 0 - oy * dot;
  let gz = bnz - oz * dot;
  const gl = Math.hypot(gx, gy, gz);
  if (gl > 0.001) {
    gx /= gl;
    gy /= gl;
    gz /= gl;
  } else {
    gx = nx;
    gy = ny;
    gz = nz;
  }
  const w = oblique * k * 0.82;
  const mx = nx * (1 - w) + gx * w;
  const my = ny * (1 - w) + gy * w;
  const mz = nz * (1 - w) + gz * w;
  const ml = Math.hypot(mx, my, mz) || 1;
  return { x: mx / ml, y: my / ml, z: mz / ml };
}

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
  // Transmission depth is compiled into the fragment stage (`GLASS_TRANSMIT`).
  // A new uniform would break the seal. MeshTransmissionMaterial needs an
  // environment map, which the void lock rejects, and it would drop this lobe.
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
    vertexShader: shellVert,
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
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uCore: { value: new THREE.Color(LOCK.filamentKern) },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uDensity: { value: 1 },
      uShow: { value: 1 },
    },
    vertexShader: nerveVert,
    fragmentShader: nerveFrag,
  });
  sealShaderChannels(material, ["uColor", "uCore", "uSpeed", "uShow"]);
  markMaterial(material, "nerve");
  return material;
}

function solid(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material) {
  const count = geo.getAttribute("position").count;
  if (!geo.getAttribute("aFade")) {
    const fade = new Float32Array(count);
    fade.fill(1);
    geo.setAttribute("aFade", new THREE.Float32BufferAttribute(fade, 1));
  }
  // Shared glass shader. Zero keeps the frontal rim. The calf overwrites aKante.
  if (!geo.getAttribute("aKante")) {
    geo.setAttribute("aKante", new THREE.Float32BufferAttribute(new Float32Array(count), 1));
  }
  // Zero keeps the locked frontal exponent. Torso and limbs opt into the body band.
  if (!geo.getAttribute("aBand")) {
    geo.setAttribute("aBand", new THREE.Float32BufferAttribute(new Float32Array(count), 1));
  }
  // Zero keeps the shell on the locked Fresnel only. Volumes opt into transmission.
  if (!geo.getAttribute("aTransmit")) {
    geo.setAttribute("aTransmit", new THREE.Float32BufferAttribute(new Float32Array(count), 1));
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

/** Chest-local height where the arm leaves the ribcage. Above this it is the deltoid. */
export const ARMPIT_Y = 0.15;
/** Just off the skin so the disk is not inside the ellipse, and not a visible gap. */
const DELTOID_SKIN = 0.0015;

function armHeight(t: number) {
  return (
    LOCK.proportions.shoulderLocalY +
    BLEND.shoulder * (1 - t) -
    LOCK.proportions.upperArm * t
  );
}

function armSample(t: number) {
  const u = Math.min(1, Math.max(0, t));
  const r = radiusAt(UPPER_RADII, u);
  const y = armHeight(u);
  const torsoHalf = shellRadius(y) * SHELL_SX;
  return { r, y, torsoHalf, touch: torsoHalf + r + DELTOID_SKIN };
}

/** Center of the arm at the armpit. Held straight below that so the waist shows. */
let armpitCenter = 0;
function centerAtArmpit() {
  if (armpitCenter) return armpitCenter;
  const span = BLEND.shoulder + LOCK.proportions.upperArm;
  const t = (LOCK.proportions.shoulderLocalY + BLEND.shoulder - ARMPIT_Y) / span;
  armpitCenter = armSample(t).touch;
  return armpitCenter;
}

/**
 * Upper-arm station in chest space.
 * Through the deltoid the tube is seated on the shell. The fade ends at the
 * shell, so the crescent outside it stays drawn and the cap has no dark slot.
 * From the armpit down the center stays put, so the waist leaves a gap.
 */
export function upperArmStation(t: number) {
  const s = armSample(t);
  const join = hermite(ARMPIT_Y, ARMPIT_Y + 0.08, s.y);
  const seated = s.torsoHalf - s.r * 0.2;
  const clear = Math.max(s.torsoHalf + s.r + 0.002, centerAtArmpit());
  const center = seated * join + clear * (1 - join);
  return { r: s.r, y: s.y, torsoHalf: s.torsoHalf, center, outer: center + s.r };
}

/** Front and depth half-axes of the torso ellipse at a chest-local height. */
export function torsoShellAt(localY: number) {
  return { x: shellRadius(localY) * SHELL_SX, z: shellDepth(localY) };
}

/**
 * Glass upper arm. Slim tube, outside the torso, tapering toward the elbow.
 */
function upperGlass(t: number) {
  const arm = upperArmStation(t);
  return { r: arm.r, y: arm.y, center: arm.center };
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
 * Calf cross-section. One smooth gastrocnemius belly behind a tibia,
 * mirror-even in local X. No medial/lateral fins, no sulcus wings.
 * Glass and filaments share this section. `side` is unused: the hip
 * placement mirrors the two legs.
 */
function shinSection(t: number, a: number, r: number, _side: 1 | -1) {
  const s = Math.sin(a);
  const c = Math.cos(a);
  const front = Math.max(0, s);
  const back = Math.max(0, -s);
  const gastroc = Math.exp(-((t - 0.4) ** 2) / 0.05);
  const soleus = Math.exp(-((t - 0.62) ** 2) / 0.055);
  const live = hermite(0.1, 0.28, t) * (1 - hermite(0.72, 0.9, t));
  const mass = live * (gastroc * 0.7 + soleus * 0.38);
  const xRad = r * 0.92;
  const zFront = r * (0.72 - 0.06 * mass);
  const zBack = r * (0.94 + 0.5 * mass);
  return { x: c * xRad, z: front * zFront - back * zBack };
}

/**
 * Thigh cross-section. Outer belly in the upper third, inner edge tapering
 * toward the knee. `side` puts the belly on the lateral face so the pair mirrors.
 */
function thighSection(t: number, a: number, r: number, side: 1 | -1) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const vastus = Math.exp(-((t - 0.24) ** 2) / 0.035);
  const toKnee = hermite(0.42, 0.9, t);
  const lateral = Math.max(0, c * side);
  const medial = Math.max(0, -c * side);
  const xMul = 1 + 0.33 * vastus * lateral - 0.36 * toKnee * medial;
  return { x: c * r * xMul, z: s * r * 0.84 };
}

/** Wider Fresnel on torso and limbs. Skull and the unmarked glass stay at 0. */
function markBodyRim(mesh: THREE.Mesh) {
  const count = mesh.geometry.getAttribute("position").count;
  const band = new Float32Array(count);
  band.fill(1);
  mesh.geometry.setAttribute("aBand", new THREE.Float32BufferAttribute(band, 1));
  return mesh;
}

/**
 * Glass volume. The far wall and the near-wall band turn on.
 * The calf stays unmarked so the #34/#35 rear rim is the only lobe there.
 * Joint bridges stay unmarked so a seam does not read as a ball.
 */
function transmit(mesh: THREE.Mesh) {
  const count = mesh.geometry.getAttribute("position").count;
  const data = new Float32Array(count);
  data.fill(1);
  mesh.geometry.setAttribute("aTransmit", new THREE.Float32BufferAttribute(data, 1));
  return mesh;
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
  const hz = rad * SHELL_SZ;
  const e = (x * x) / (hx * hx) + (z * z) / (hz * hz);
  return hermite(0.62, 1.04, e);
}

/** Upper arm: a soft edge across the shell, not a hard cut that leaves a black notch. */
function armSkinFade(x: number, y: number, z: number) {
  const shell = torsoShellAt(y);
  const e = (x * x) / (shell.x * shell.x) + (z * z) / (shell.z * shell.z);
  return hermite(0.9, 1, e);
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
      if (bury) ring *= armSkinFade(side * shoulderX + x, shoulderY + y, z);
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
    const z = pos.getZ(i) * SHELL_SZ;
    let cover = 1;
    // The neck continues inside the skull. Fade it so the open lathe
    // does not draw a second ring under the jaw.
    if (y > 0.44) cover = Math.min(cover, hermite(0.52, 0.44, y));
    // Keep the crotch V. Fade only the open tip so it does not draw a hem.
    if (y < -0.36) cover = Math.min(cover, hermite(-0.405, -0.36, y));
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

/** Flip a mesh through X and its winding, so the other side is a true mirror. */
function mirrorGeometryX(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) pos.setX(i, -pos.getX(i));
  const idx = geo.getIndex();
  if (!idx) return;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    idx.setX(i, idx.getX(i + 1));
    idx.setX(i + 1, a);
  }
}

/**
 * Round deltoid from the neck base onto the arm.
 * Built on the positive side and mirrored, so the pair cannot drift.
 * Buried in the torso. Not a strap and not a joint sphere.
 */
function shoulderSlope(side: 1 | -1) {
  const samples = 16;
  const seg = 18;
  const pos: number[] = [];
  const fade: number[] = [];
  const idx: number[] = [];
  const p0 = new THREE.Vector3(0.05, 0.32, 0.012);
  const p1 = new THREE.Vector3(0.11, 0.28, 0.016);
  const p2 = new THREE.Vector3(0.1, 0.16, 0.008);
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
    if (tang.lengthSq() < 1e-8) tang.set(1, -1, 0);
    tang.normalize();
    sideV.crossVectors(tang, up);
    if (sideV.lengthSq() < 1e-8) sideV.set(1, 0, 0);
    sideV.normalize();
    bin.crossVectors(sideV, tang).normalize();
    const rad = 0.02 + Math.sin(Math.PI * t) * 0.028;
    const end = hermite(0, 0.18, t) * hermite(1, 0.72, t);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const x = c.x + sideV.x * Math.cos(a) * rad + bin.x * Math.sin(a) * rad * 0.92;
      const y = c.y + sideV.y * Math.cos(a) * rad + bin.y * Math.sin(a) * rad * 0.92;
      const z = c.z + sideV.z * Math.cos(a) * rad + bin.z * Math.sin(a) * rad * 0.92;
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
  if (side < 0) mirrorGeometryX(geo);
  return geo;
}

/** Sole kiss in world Y. The ground pool stays the short oval under the ankle. */
const SOLE_KISS = 0.014;

/** Smooth value through sorted [t, value] knots. */
function knot(u: number, pairs: Array<[number, number]>) {
  if (u <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    if (u <= pairs[i][0]) {
      const [u0, v0] = pairs[i - 1];
      const [u1, v1] = pairs[i];
      const t = (u - u0) / (u1 - u0);
      const s = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * s;
    }
  }
  return pairs[pairs.length - 1][1];
}

/** Stacked rings. The seam sine is snapped so the join does not pinch. */
function ellipseRings(
  rings: number,
  seg: number,
  at: (ring: number, j: number, cos: number, sin: number) => [number, number, number],
) {
  const position: number[] = [];
  const index: number[] = [];
  const row = seg + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j <= seg; j++) {
      const ang = (j / seg) * Math.PI * 2;
      let s = Math.sin(ang);
      if (j === 0 || j === seg || Math.abs(s) < 1e-7) s = 0;
      const [x, y, z] = at(i, j, Math.cos(ang), s);
      position.push(x, y, z);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * row + j;
      const b = a + row;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { position, index, row };
}

/**
 * Foot along its length. The ankle column meets the shin; the sole is a
 * heel, a small arch, a ball, and a low toe pad. Ends are capped.
 */
function footLathe() {
  const seg = 24;
  const samples = 42;
  let minY = Infinity;
  const widthK: Array<[number, number]> = [
    [0, 0.01],
    [0.1, 0.034],
    [0.28, 0.03],
    [0.55, 0.032],
    [0.78, 0.046],
    [0.92, 0.044],
    [1, 0.016],
  ];
  const instepK: Array<[number, number]> = [
    [0, 0.012],
    [0.1, 0.046],
    [0.22, 0.078],
    [0.32, 0.09],
    [0.48, 0.05],
    [0.68, 0.032],
    [0.86, 0.022],
    [1, 0.01],
  ];
  const soleK: Array<[number, number]> = [
    [0, 0],
    [0.2, 0],
    [0.48, 0.003],
    [0.78, 0],
    [1, 0],
  ];

  const built = ellipseRings(samples, seg, (i, j) => {
    const u = i / (samples - 1);
    const z = -0.06 + u * 0.245;
    const halfW = knot(u, widthK);
    const instep = knot(u, instepK);
    const sole = knot(u, soleK);
    const capH = Math.min(halfW, instep);
    const wall = instep - capH;
    const q = seg / 4;
    let x: number;
    let y: number;
    if (j <= q) {
      x = halfW;
      y = sole + (j / q) * wall;
    } else if (j <= 2 * q) {
      const a = ((j - q) / q) * Math.PI;
      x = Math.cos(a) * halfW;
      y = sole + wall + Math.sin(a) * capH;
    } else if (j <= 3 * q) {
      x = -halfW;
      y = sole + wall * (1 - (j - 2 * q) / q);
    } else {
      const s = (j - 3 * q) / (seg - 3 * q);
      x = -halfW + s * 2 * halfW;
      y = sole;
    }
    if (y < minY) minY = y;
    return [x, y, z];
  });
  const { position: pos, index: idx, row } = built;
  const cap = (ringIndex: number, dir: -1 | 1) => {
    const base = ringIndex * row;
    let yAvg = 0;
    let zAvg = 0;
    for (let j = 0; j < row; j++) {
      yAvg += pos[(base + j) * 3 + 1];
      zAvg += pos[(base + j) * 3 + 2];
    }
    yAvg /= row;
    zAvg = zAvg / row + dir * 0.003;
    const center = pos.length / 3;
    pos.push(0, yAvg, zAvg);
    for (let j = 0; j < seg; j++) {
      const a = base + j;
      const b = base + j + 1;
      if (dir < 0) idx.push(center, b, a);
      else idx.push(center, a, b);
    }
  };
  cap(0, -1);
  cap(samples - 1, 1);

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
/** Rounder than the old 0.72 panel, still an oval ribcage. */
const SHELL_SZ = 0.78;
const SKULL_SY = 1.16;
const HIP_X = 0.11;
/**
 * Human torso. Radii are the lathe, before SHELL_SX.
 * Neck to acromion is about 18°, sampled so no ring jumps out over a few
 * centimetres. Chest is at least as wide as the hip. Waist is narrower.
 */
const SHELL_LATHE: Array<[number, number]> = [
  [0.028, -0.46],
  [0.04, -0.4],
  [0.062, -0.34],
  [0.11, -0.3],
  [0.186, -0.24],
  [0.19, -0.2],
  [0.15, -0.12],
  [0.122, -0.04],
  [0.132, 0.04],
  [0.168, 0.1],
  [0.192, 0.15],
  [0.17, 0.2],
  [0.174, 0.24],
  [0.178, 0.258],
  [0.186, 0.276],
  [0.192, 0.298],
  [0.178, 0.308],
  [0.148, 0.318],
  [0.11, 0.328],
  [0.086, 0.336],
  [0.062, 0.346],
  [0.052, 0.356],
  [0.048, 0.366],
  [0.044, 0.44],
  [0.042, 0.52],
];
/**
 * Half-depth after the torso's Z scale. Matches the old ellipse, except the
 * acromion, which stays ribcage-deep so the side view is not a shelf.
 */
function shellDepth(y: number) {
  const classic = shellRadius(y) * SHELL_SZ;
  const rib = shellRadius(0.12) * SHELL_SZ;
  const shoulder = hermite(0.23, 0.29, y) * (1 - hermite(0.29, 0.34, y));
  return classic * (1 - shoulder) + Math.min(classic, rib * 1.2) * shoulder;
}

/** Elliptical torso. X is the front silhouette; Z is the ribcage depth. */
function ellipticTorso() {
  const { position, index } = ellipseRings(SHELL_LATHE.length, 28, (i, _j, c, s) => {
    const [r, y] = SHELL_LATHE[i];
    return [c * r, y, s * (shellDepth(y) / SHELL_SZ)];
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
/** Crossfade length shared by a parent distal end and its child proximal end. */
const BLEND = { elbow: 0.14, knee: 0.14, shoulder: 0.02, hip: 0.05 };
/**
 * Soft biceps, not a deltoid spike. Root is buried; the last sample matches the elbow.
 */
/** Deltoid through biceps to the elbow. Peak is about a third of the shoulder half-width. */
const UPPER_RADII = [0.056, 0.06, 0.058, 0.052, 0.046, 0.042, 0.038, 0.036, 0.034];
/** Elbow into a wrist narrow enough to enter the hand, not a ball. */
const FORE_RADII = [0.034, 0.032, 0.03, 0.028, 0.026, 0.024, 0.022];
/** Quad holds through the upper third, then narrows into the knee. */
const THIGH_RADII = [0.06, 0.066, 0.066, 0.06, 0.052, 0.046, 0.044, 0.042, 0.042];

/**
 * Front half-width the upper arm is allowed to reach.
 * Acromion plus the deltoid that hangs outside the torso.
 */
export const SHOULDER_LINE = (() => {
  let outer = 0;
  for (let i = 0; i <= 48; i++) outer = Math.max(outer, upperArmStation(i / 48).outer);
  return outer;
})();
/**
 * Knee, then the bone radius the calf section builds on.
 * Belly in the upper third, smooth taper to the ankle. No spindle.
 */
const SHIN_RADII = [0.044, 0.05, 0.058, 0.066, 0.07, 0.062, 0.05, 0.038, 0.03];
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

float sdHug(vec2 p, float s) {${hugPair}}
float sdFore(vec2 p, float s) {${forePair}}
float sdThigh(vec2 p, float s) {${thighPair}}
float sdShin(vec2 p, float s) {${shinPair}}

float sdBody(vec2 p) {
  float d = sdTorso(p);
  d = smin(d, sdEllipse(p, vec2(0.0, ${g4(headY)}), vec2(${g4(P.headRadius)}, ${g4(P.headRadius * SKULL_SY)})), 0.036);
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
  // Forked plexus inside the current lathe, plus a short fiber mass in the chest.
  // Radii are read, not retuned. Every sample is pulled onto an inset ellipse so
  // the bow cannot lay lime on the cyan rim. No sternum ball, no thicker strokes.
  const hair = 0.000175;
  const twigW = 0.00012;
  let seed = 11;
  const h = () => unitHash(seed++);
  const yLo = -0.32;
  const yHi = 0.4;
  const inset = 0.8;
  const box = (y: number) => {
    const r = shellRadius(Math.max(-0.34, Math.min(0.5, y)));
    return {
      x: Math.max(0.012, r * SHELL_SX * inset),
      z: Math.max(0.008, shellDepth(y) * inset),
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
    insideArc(ax, yA, az, bx, yB, bz, (h() - 0.5) * 0.012, rank, width, gain, warm);
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
      insideArc(
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

  layFiberMass();

  function fit(x: number, z: number, y: number) {
    const b = box(y);
    const e = (x * x) / (b.x * b.x) + (z * z) / (b.z * b.z);
    if (e <= 1) return [x, z] as const;
    const s = 0.98 / Math.sqrt(e);
    return [x * s, z * s] as const;
  }

  /** Bowed chord with every sample kept on the inset ellipse. */
  function insideArc(
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
        const y = Math.max(yLo, Math.min(yHi, ay + dy * u + py * o));
        const [x, z] = fit(ax + dx * u + px * o, az + (bz - az) * u, y);
        return new THREE.Vector3(x, y, z);
      },
      Math.min(0.82, Math.max(0.02, rank)),
      width,
      gain,
      warm,
      0.3,
      0,
    );
  }

  /**
   * Short lime fibers through the torso volume. The chest carries the solid
   * mass; the column below is the same web, thinner. Strokes stay hair-width.
   */
  function layFiberMass() {
    let n = 4400;
    const h2 = () => unitHash(n++);
    const chord = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      gain: number,
      warm: number,
    ) => {
      const yA = Math.max(yLo, Math.min(yHi, y0));
      const yB = Math.max(yLo, Math.min(yHi, y1));
      const [ax, az] = fit(x0, z0, yA);
      const [bx, bz] = fit(x1, z1, yB);
      if (Math.hypot(bx - ax, yB - yA) < 0.006) return;
      insideArc(
        ax,
        yA,
        az,
        bx,
        yB,
        bz,
        (h2() - 0.5) * 0.008,
        0.05 + (n % 6) * 0.012,
        hair,
        gain,
        warm,
      );
    };
    const scatter = (y: number, reach: number, len: number, gain: number, warm: number) => {
      const b = box(y);
      const ang = h2() * Math.PI * 2;
      const rad = Math.sqrt(h2()) * 0.96 * reach;
      const x = Math.cos(ang) * b.x * rad;
      const z = Math.sin(ang) * b.z * rad;
      const roll = h2();
      let dx: number;
      let dy: number;
      let dz: number;
      if (roll < 0.44) {
        const s = h2() < 0.5 ? -1 : 1;
        dx = (h2() - 0.5) * len * 0.65;
        dy = s * len;
        dz = (h2() - 0.5) * len * 0.32;
      } else if (roll < 0.76) {
        const a = (h2() - 0.5) * 2.6;
        dx = Math.sin(a) * len;
        dy = Math.cos(a) * len * (0.5 + h2() * 0.45);
        dz = (h2() - 0.5) * len * 0.36;
      } else {
        const s = h2() < 0.5 ? -1 : 1;
        dx = s * len;
        dy = (h2() - 0.5) * len * 0.4;
        dz = (h2() - 0.5) * len * 0.28;
      }
      chord(x, y, z, x + dx, y + dy, z + dz, gain, warm);
    };

    // Dim on purpose. Additive overlap is the solid; a hotter gain clips to a white block.
    for (let i = 0; i < 2800; i++) {
      const y = h2() < 0.78 ? 0.17 + (h2() + h2() - 1) * 0.12 : 0.03 + h2() * 0.28;
      const len = 0.016 + h2() * 0.028;
      scatter(y, 1, len, 0.1 + h2() * 0.08, 0.2 + h2() * 0.12);
    }
    for (let i = 0; i < 1600; i++) {
      const y = -0.22 + h2() * 0.28;
      const len = 0.016 + h2() * 0.024;
      scatter(y, 0.94, len, 0.09 + h2() * 0.07, 0.18 + h2() * 0.1);
    }
  }
}

function upperGlassT(u: number) {
  const prox = BLEND.shoulder;
  const length = LOCK.proportions.upperArm;
  return Math.min(1, Math.max(0, (prox + u * length) / (prox + length)));
}

/** Shoulder-local center of the post-fit upper-arm tube. */
function upperAxis(side: 1 | -1) {
  const pin = LOCK.proportions.shoulderX;
  return (u: number) => side * (upperGlass(upperGlassT(u)).center - pin);
}

/** Inset of the round upper-arm tube. Keeps lime off the glass rim. */
function upperFilamentBounds(u: number) {
  const rad = upperGlass(upperGlassT(u)).r * 0.66;
  return { rx: rad, rz: rad };
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
  bounds?: (u: number) => { rx: number; rz: number },
) {
  // Volume web inside the current tube. A few quiet cords keep a nerve
  // direction; the density is fine twigs spread through the inset, not a
  // thicker stroke and not a cord along two lanes. Every sample is clamped
  // to that inset, so a chord on the taper cannot touch the cyan rim.
  // Twig gain stays under the old lane twigs: additive overlap is the fill,
  // and a hotter gain clips the core to white.
  let n = Math.round(Math.abs(seed) * 19 + length * 80 + radii.length);
  const h = () => unitHash(n++);
  const flat = 0.8;
  const axis = axisX ?? (() => 0);
  const reachX = (u: number) => bounds?.(u).rx ?? radiusAt(radii, u) * 0.7;
  const reachZ = (u: number) => bounds?.(u).rz ?? radiusAt(radii, u) * flat * 0.7;
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
        clamp(
          side * (rx * 0.04 + lane.x * rx + Math.sin(u * Math.PI * 1.25 + lane.phase) * wander),
          rx,
        ),
      -u * length,
      clamp(lane.z * rz + Math.sin(u * Math.PI * 0.8 + lane.phase * 1.35) * wander * 0.85, rz),
    );
  };

  for (const lane of lanes) {
    pushCurve(ribbon, 14, (u) => point(u, lane), Math.min(0.8, rank), width, gain * 0.48, 0.24, 0.22);
  }

  // 0.92 of the existing inset. The bound is already inside the glass.
  const cap = 0.92;
  const at = (t: number, ang: number, rad: number) => {
    const u = Math.min(0.95, Math.max(0.06, t));
    const rx = reachX(u);
    const rz = reachZ(u);
    const k = Math.min(cap, Math.max(0, rad));
    return new THREE.Vector3(
      // Flip by side so the two limbs are mirror images, not one cloud shifted.
      axis(u) + clamp(side * Math.cos(ang) * rx * k, rx * cap),
      -u * length,
      clamp(Math.sin(ang) * rz * k, rz * cap),
    );
  };

  const web = Math.round(130 + length * 340 + mean * 2100);
  for (let f = 0; f < web; f++) {
    const roll = h();
    const u0 = 0.08 + h() * 0.76;
    // Long cords, then diagonals, then short crosses. A comb of parallel
    // strokes reads as air; the diagonals are what makes the lime a net.
    const span = roll < 0.28 ? 0.12 + h() * 0.12 : roll < 0.76 ? 0.05 + h() * 0.07 : 0.02 + h() * 0.03;
    const dir = h() < 0.5 ? 1 : -1;
    const u1 = Math.min(0.94, Math.max(0.07, u0 + dir * span));
    const a0 = h() * Math.PI * 2;
    const turn = roll < 0.28 ? 0.28 + h() * 0.35 : roll < 0.76 ? 0.7 + h() * 0.9 : 1.3 + h() * 1.1;
    const a1 = a0 + (h() - 0.5) * turn;
    const rad0 = Math.sqrt(h()) * cap;
    const drift = roll < 0.28 ? 0.12 : roll < 0.76 ? 0.34 : 0.5;
    const rad1 = Math.min(cap, Math.max(0.04, rad0 + (h() - 0.5) * drift));
    const twigGain = gain * (0.3 + h() * 0.12);
    const samples = roll < 0.28 ? 8 : roll < 0.76 ? 6 : 4;
    pushCurve(
      ribbon,
      samples,
      (u) => at(u0 + (u1 - u0) * u, a0 + (a1 - a0) * u, rad0 + (rad1 - rad0) * u),
      Math.min(0.4, rank + 0.03 + (f % 5) * 0.01),
      Math.max(width * 0.7, 0.00009),
      twigGain,
      0.16 + (f % 4) * 0.02,
      0.38,
    );
    if (h() < 0.3) {
      const tip = Math.min(0.95, Math.max(0.07, u1 + dir * (0.016 + h() * 0.03)));
      const fang = a1 + (h() < 0.5 ? 0.55 : -0.55);
      const fr = Math.min(cap, Math.max(0.04, rad1 + (h() - 0.5) * 0.22));
      pushCurve(
        ribbon,
        3,
        (u) => at(u1 + (tip - u1) * u, a1 + (fang - a1) * u, rad1 + (fr - rad1) * u),
        Math.min(0.46, rank + 0.08),
        Math.max(width * 0.55, 0.000075),
        twigGain * 0.66,
        0.13,
        0.52,
      );
    }
  }
}

type CalfLane = "lat" | "med" | "groove";

/**
 * Radius the calf tube actually meshes. The knee blend holds the first sample,
 * same as `organicTube` with `join: "child"`. Filaments have to follow that,
 * not the unblended bone radius.
 */
function shinTubeRadius(t: number) {
  const length = LOCK.proportions.shin;
  const prox = BLEND.knee;
  const y = prox * (1 - t) - length * t;
  let r = radiusAt(SHIN_RADII, t);
  if (y > -prox) {
    const held = SHIN_RADII[0] ?? r;
    const u = hermite(0, -prox, y);
    r = held + (r - held) * u;
  }
  return r;
}

/**
 * Filament stations inside the smooth calf. Lateral and medial are the
 * two sides of one belly; the center lane sits on that belly, not in a cut.
 */
function calfFrame(t: number, side: 1 | -1) {
  const r = shinTubeRadius(t);
  const samples = 72;
  const pts: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < samples; i++) {
    pts.push(shinSection(t, (i / samples) * Math.PI * 2, r, side));
  }
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.z;
  }
  cx /= samples;
  cz /= samples;

  const contain = (x: number, z: number, inset = 0.84) => {
    const dx = x - cx;
    const dz = z - cz;
    const rad = Math.hypot(dx, dz);
    if (rad < 1e-5) return { x: cx, z: cz };
    const ang = Math.atan2(dz, dx);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let ray = 1e-4;
    for (const q of pts) {
      const dot = (q.x - cx) * c + (q.z - cz) * s;
      if (dot > ray) ray = dot;
    }
    const limit = ray * inset;
    if (rad <= limit) return { x, z };
    const k = limit / rad;
    return { x: cx + dx * k, z: cz + dz * k };
  };

  let lat = { x: cx + side * r * 0.25, z: cz - r * 0.35 };
  let med = { x: cx - side * r * 0.22, z: cz - r * 0.4 };
  let latZ = Infinity;
  let medZ = Infinity;
  let grooveZ = -Infinity;
  for (const p of pts) {
    if (p.z > cz) continue;
    const outward = side * (p.x - cx);
    if (outward > 0.008 && p.z < latZ) {
      latZ = p.z;
      lat = p;
    }
    if (outward < -0.008 && p.z < medZ) {
      medZ = p.z;
      med = p;
    }
    if (Math.abs(p.x - cx) <= 0.014 && p.z > grooveZ) grooveZ = p.z;
  }
  // Mirrored candidates tie on z. Center the lane so both calves mirror.
  const groove = { x: cx, z: Number.isFinite(grooveZ) ? grooveZ : cz - r * 0.16 };

  return {
    cx,
    cz,
    r,
    lat: contain(lat.x, lat.z, 0.66),
    med: contain(med.x, med.z, 0.7),
    groove: contain(groove.x, groove.z, 0.6),
    contain,
  };
}

/**
 * Fine calf nerves through the belly. Same seed on both legs, offsets
 * flipped by side, so the pair is a mirror.
 */
function fillCalf(ribbon: Ribbon, side: 1 | -1) {
  const length = LOCK.proportions.shin;
  const prox = BLEND.knee;
  let seed = 900;
  const h = () => unitHash(seed++);
  const frameAt = (u: number) => {
    const t = Math.min(1, Math.max(0, (prox + u * length) / (prox + length)));
    return calfFrame(t, side);
  };
  const laneOf = (frame: ReturnType<typeof calfFrame>, lane: CalfLane) => frame[lane];

  const trunks: Array<{ lane: CalfLane; n: number; gain: number }> = [
    { lane: "lat", n: 2, gain: 0.58 },
    { lane: "med", n: 2, gain: 0.68 },
    { lane: "groove", n: 1, gain: 0.48 },
  ];
  for (const trunk of trunks) {
    for (let i = 0; i < trunk.n; i++) {
      const spread = (i - (trunk.n - 1) / 2) * 0.009;
      const phase = h() * Math.PI * 2;
      pushCurve(
        ribbon,
        16,
        (u) => {
          const uu = 0.07 + u * 0.88;
          const frame = frameAt(uu);
          const src = laneOf(frame, trunk.lane);
          const wobX = side * Math.sin(uu * Math.PI * 1.35 + phase) * 0.0035;
          const wobZ = Math.sin(uu * Math.PI + phase * 1.2) * 0.0025;
          const p = frame.contain(src.x + side * spread + wobX, src.z + wobZ, 0.72);
          return new THREE.Vector3(p.x, -uu * length, p.z);
        },
        0.07,
        0.000085,
        0.4 * trunk.gain,
        0.28,
        0.18,
      );
    }
  }

  // Fine twigs inside each head and the groove. Depth stays on the
  // section center side of the anchor, so the extra net does not climb
  // the cyan rim or bridge the sulcus into one mass.
  const twigs = 340;
  for (let i = 0; i < twigs; i++) {
    const roll = h();
    const lane: CalfLane = roll < 0.36 ? "lat" : roll < 0.78 ? "med" : "groove";
    const band =
      lane === "lat" ? 0.18 + h() * 0.4 : lane === "med" ? 0.38 + h() * 0.44 : 0.16 + h() * 0.66;
    const u0 = Math.min(0.9, Math.max(0.08, band));
    const span = roll < 0.62 ? 0.055 + h() * 0.07 : 0.022 + h() * 0.035;
    const u1 = Math.min(0.95, Math.max(0.07, u0 + (h() < 0.5 ? -span : span)));
    // Stay in the head, just inside the inset anchor. A jump in depth
    // kinks the stroke and a low depth sinks the net into the tibia.
    const depth0 = lane === "groove" ? 0.7 + h() * 0.22 : 0.68 + h() * 0.28;
    const depth1 = Math.min(0.98, Math.max(0.5, depth0 + (h() - 0.5) * 0.1));
    const tang0 = (h() - 0.5) * 2;
    const tang1 = tang0 + (h() - 0.5) * 0.28;
    const amp = lane === "groove" ? 0.1 : lane === "med" ? 0.38 : 0.34;
    pushCurve(
      ribbon,
      roll < 0.62 ? 7 : 4,
      (u) => {
        const uu = u0 + (u1 - u0) * u;
        const frame = frameAt(uu);
        const src = laneOf(frame, lane);
        const vx = src.x - frame.cx;
        const vz = src.z - frame.cz;
        const depth = depth0 + (depth1 - depth0) * u;
        const tang = (tang0 + (tang1 - tang0) * u) * frame.r * amp;
        const spanLen = Math.hypot(vx, vz) || 1;
        const p = frame.contain(
          frame.cx + vx * depth + side * (-vz / spanLen) * tang,
          frame.cz + vz * depth + (side * vx / spanLen) * tang,
          lane === "groove" ? 0.58 : 0.7,
        );
        return new THREE.Vector3(p.x, -uu * length, p.z);
      },
      0.08 + (i % 5) * 0.012,
      0.000072,
      0.46 * (lane === "med" ? 0.48 : lane === "lat" ? 0.42 : 0.34),
      0.17,
      0.4,
    );
  }
}

const HAND_FINGERS = [
  { x: -0.03, z: 0.002, len: 0.058 },
  { x: -0.014, z: 0.006, len: 0.082 },
  { x: 0.002, z: 0.008, len: 0.092 },
  { x: 0.018, z: 0.005, len: 0.084 },
  { x: 0.032, z: 0.0, len: 0.064 },
] as const;

function fillHand(ribbon: Ribbon, side: 1 | -1, ox: number) {
  for (let f = 0; f < HAND_FINGERS.length; f++) {
    const spec = HAND_FINGERS[f];
    pushCurve(
      ribbon,
      8,
      (u) => new THREE.Vector3(ox + side * spec.x, -0.09 - u * spec.len * 0.92, spec.z * u),
      0.12 + f * 0.03,
      0.00014,
      0.3,
      0.2,
      0.55,
    );
  }
  // Metacarpal bar. ±0.032 sat in the old wrist ball; without it the ends
  // leave the palm ellipse (inside about ±0.019 at this depth).
  pushCurve(
    ribbon,
    8,
    (u) => new THREE.Vector3(ox + (-0.018 + u * 0.036) * side, -0.05, 0.006),
    0.22,
    0.00014,
    0.24,
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

export function createKushim(): Rig {
  const P = LOCK.proportions;
  const root = new THREE.Group();
  const glass = glassMaterial(1, "glass");
  const nerve = nerveMaterial(LOCK.filament, 0.34);
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [glass, nerve];

  const chest = new THREE.Group();
  chest.position.y = P.chestY;
  root.add(chest);

  const torsoGeo = ellipticTorso();
  fadeTorsoSides(torsoGeo);
  const torso = transmit(markBodyRim(solid(chest, torsoGeo, glass)));
  torso.scale.set(SHELL_SX, 1, SHELL_SZ);
  torso.userData.lockKey = "torso";

  const head = new THREE.Group();
  head.position.y = P.headLocalY;
  chest.add(head);
  const skull = transmit(markBodyRim(solid(head, new THREE.SphereGeometry(P.headRadius, 24, 16), glass)));
  skull.scale.set(1, SKULL_SY, 1.02);
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
    transmit(markBodyRim(solid(chest, shoulderSlope(side), glass)));
    transmit(markBodyRim(solid(
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
    )));
    const upperN = emptyRibbon();
    fillLimb(
      upperN,
      P.upperArm,
      UPPER_RADII,
      0.05,
      0.00011,
      0.5,
      side * 1.3,
      side,
      upperAxis(side),
      upperFilamentBounds,
    );
    commitRibbon(shoulder, upperN, nerve);

    const elbow = new THREE.Group();
    elbow.position.y = -P.upperArm;
    shoulder.add(elbow);
    const foreInset = Math.max(0, P.shoulderX - upperGlass(1).center);
    const elbowBridge = markBodyRim(solid(elbow, jointBridge(LIMB.fore.r0, BLEND.elbow), glass));
    elbowBridge.position.x = side * -foreInset;
    transmit(markBodyRim(solid(
      elbow,
      organicTube(FORE_RADII, P.foreArm, side, foreInset, BLEND.elbow, 0, {
        join: "child",
        tuckPower: 0,
      }),
      glass,
    )));
    const foreN = emptyRibbon();
    fillLimb(foreN, P.foreArm, FORE_RADII, 0.07, 0.00009, 0.42, side * 2.1, side, () => -side * foreInset);
    commitRibbon(elbow, foreN, nerve);

    const wrist = new THREE.Group();
    wrist.position.y = -P.foreArm;
    elbow.add(wrist);
    const hand = new THREE.Group();
    hand.position.x = side * -foreInset;
    wrist.add(hand);
    const palmRings: Array<[number, number, number]> = [
      [0.022, 0.012, 0.008],
      [0.022, 0.011, -0.018],
      [0.025, 0.01, -0.042],
      [0.028, 0.009, -0.068],
      [0.022, 0.007, -0.09],
      [0.014, 0.005, -0.102],
    ];
    const palm = ellipseRings(palmRings.length, 16, (i, _j, c, s) => {
      const [rx, rz, y] = palmRings[i];
      return [c * rx, y, s * rz];
    });
    const palmGeo = new THREE.BufferGeometry();
    palmGeo.setAttribute("position", new THREE.Float32BufferAttribute(palm.position, 3));
    palmGeo.setIndex(palm.index);
    palmGeo.computeVertexNormals();
    transmit(markBodyRim(solid(hand, palmGeo, glass)));
    const fingers: THREE.Group[] = [];
    for (const spec of HAND_FINGERS) {
      const finger = new THREE.Group();
      finger.position.set(side * spec.x, -0.086, spec.z);
      hand.add(finger);
      transmit(markBodyRim(solid(
        finger,
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0.008, 0),
            new THREE.Vector2(0.009, -spec.len * 0.35),
            new THREE.Vector2(0.006, -spec.len * 0.78),
            new THREE.Vector2(0.001, -spec.len),
          ],
          6,
        ),
        glass,
      )));
      fingers.push(finger);
    }
    const handN = emptyRibbon();
    fillHand(handN, side, side * -foreInset);
    commitRibbon(wrist, handN, nerve);
    return { shoulder, elbow, wrist, fingers };
  }

  const left = makeArm(1);
  const right = makeArm(-1);

  function makeLeg(side: 1 | -1) {
    const hip = new THREE.Group();
    hip.userData.lockKey = "hip";
    hip.userData.lockSide = side;
    hip.position.set(side * HIP_X, P.hipY, 0);
    root.add(hip);
    transmit(markBodyRim(solid(
      hip,
      organicTube(
        THIGH_RADII,
        P.thigh,
        side,
        LIMB.thigh.inset,
        BLEND.hip,
        BLEND.knee,
        { section: (t, a, r) => thighSection(t, a, r, side) },
      ),
      glass,
    )));
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
    markBodyRim(solid(knee, jointBridge(LIMB.shin.r0, BLEND.knee), glass));
    const shinGeo = organicTube(SHIN_RADII, P.shin, side, 0, BLEND.knee, 0.06, {
      join: "child",
      seg: 40,
      section: (t, a, r) => shinSection(t, a, r, side),
    });
    markBodyRim(solid(knee, shinGeo, glass));
    const shinN = emptyRibbon();
    fillCalf(shinN, side);
    commitRibbon(knee, shinN, nerve);

    const ankle = new THREE.Group();
    ankle.userData.lockKey = "ankle";
    ankle.position.y = -P.shin;
    knee.add(ankle);
    const foot = new THREE.Group();
    ankle.add(foot);
    const shaped = footLathe();
    const footMesh = transmit(markBodyRim(solid(foot, shaped.geo, glass)));
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
  if (typeof location !== "undefined" && location.search.includes("view=side")) {
    root.rotation.y = -Math.PI / 2;
  } else if (typeof location !== "undefined" && location.search.includes("view=34")) {
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
