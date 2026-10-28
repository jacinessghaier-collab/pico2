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
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 viewDir = normalize(cameraPosition - vW);
  float ndv = clamp(abs(dot(normalize(vN), viewDir)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 1.75);
  float rim = smoothstep(0.04, 0.72, fres);
  float shell = 0.045 + pow(1.0 - ndv, 0.8) * 0.16;
  float lift = clamp(uBoost, 0.7, 1.35);
  float alpha = (shell + rim * 0.7) * lift;
  if (alpha < 0.025) discard;
  vec3 col = mix(uColor, uCore, rim * 0.85);
  gl_FragColor = vec4(col, min(alpha, 0.9));
}
`;

const nerveVert = /* glsl */ `
attribute vec3 aDir;
attribute float aSide;
attribute float aAlong;
attribute float aRank;
attribute float aWidth;
uniform float uDensity;
varying float vAlong;
varying float vRank;
varying float vSide;
varying float vVisible;
void main() {
  vAlong = aAlong;
  vRank = aRank;
  vSide = aSide;
  vVisible = aRank <= uDensity ? 1.0 : 0.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 viewDir = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz);
  vec2 side = normalize(vec2(-viewDir.y, viewDir.x));
  if (length(viewDir.xy) < 0.001) side = vec2(1.0, 0.0);
  mv.xy += side * aSide * aWidth * 8.0;
  gl_Position = projectionMatrix * mv;
}
`;

const nerveFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uTime;
uniform float uSpeed;
varying float vAlong;
varying float vRank;
varying float vSide;
varying float vVisible;
void main() {
  if (vVisible < 0.5) discard;
  float edge = smoothstep(1.0, 0.08, abs(vSide));
  float wave = fract(vAlong * 1.7 - uTime * uSpeed);
  float head = smoothstep(0.0, 0.035, wave) * smoothstep(0.26, 0.02, wave);
  float core = smoothstep(0.0, 0.72, 1.0 - abs(vSide));
  float alpha = (0.22 + head * 0.72) * edge;
  vec3 col = mix(uColor, uCore, head * 0.8 + core * 0.22);
  gl_FragColor = vec4(col, alpha);
}
`;

const groundFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform vec3 uAder;
uniform float uBoost;
varying vec3 vW;
void main() {
  float h = vW.y - 0.03;
  float nx = vW.x / 0.46;
  float ny = h / 0.13;
  float r2 = nx * nx + ny * ny;
  float alpha = exp(-r2 * 1.35) * smoothstep(1.35, 0.2, r2) * uBoost;
  if (alpha < 0.025 || h < -0.01) discard;
  float pool = exp(-r2 * 2.4);
  vec3 col = mix(uColor, uCore, pool);
  col = mix(col, uAder, pool * 0.16);
  gl_FragColor = vec4(col, alpha * 0.72);
}
`;

type Ribbon = {
  positions: number[];
  dirs: number[];
  sides: number[];
  alongs: number[];
  ranks: number[];
  widths: number[];
};

function emptyRibbon(): Ribbon {
  return { positions: [], dirs: [], sides: [], alongs: [], ranks: [], widths: [] };
}

function addRibbon(target: Ribbon, pts: THREE.Vector3[], rank: number, width: number) {
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
    }
  }
}

function commitRibbon(parent: THREE.Object3D, ribbon: Ribbon, material: THREE.Material) {
  if (ribbon.positions.length === 0) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(ribbon.positions, 3));
  geo.setAttribute("aDir", new THREE.Float32BufferAttribute(ribbon.dirs, 3));
  geo.setAttribute("aSide", new THREE.Float32BufferAttribute(ribbon.sides, 1));
  geo.setAttribute("aAlong", new THREE.Float32BufferAttribute(ribbon.alongs, 1));
  geo.setAttribute("aRank", new THREE.Float32BufferAttribute(ribbon.ranks, 1));
  geo.setAttribute("aWidth", new THREE.Float32BufferAttribute(ribbon.widths, 1));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  parent.add(mesh);
}

function glassMaterial(boost: number, role: "glass" | "glass-bright") {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color(LOCK.strom) },
      uCore: { value: new THREE.Color(LOCK.kern) },
      uBoost: { value: boost },
    },
    vertexShader: glassVert,
    fragmentShader: glassFrag,
  });
  sealShaderChannels(material, ["uColor", "uCore", "uBoost"]);
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
      uCore: { value: new THREE.Color(color === LOCK.signal ? LOCK.signalKern : LOCK.aderKern) },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uDensity: { value: 1 },
    },
    vertexShader: nerveVert,
    fragmentShader: nerveFrag,
  });
  sealShaderChannels(material, ["uColor", "uCore", "uSpeed"]);
  markMaterial(material, color === LOCK.signal ? "signal" : "nerve");
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

function glowSprite(inner: string, outer: string, spikes: number, peak = 1) {
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
  grd.addColorStop(0.22, outer);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = peak;
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
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  markTint(tex, inner, outer);
  return tex;
}

function strand(
  ribbon: Ribbon,
  samples: number,
  rank: number,
  width: number,
  at: (u: number) => [number, number, number],
) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const [x, y, z] = at(u);
    const wob = Math.sin(u * 12.3 + rank * 17.0 + x * 8.0) * width * 1.4;
    pts.push(new THREE.Vector3(x + wob, y, z + wob * 0.65));
  }
  addRibbon(ribbon, pts, rank, width);
}

function alongBone(
  ribbon: Ribbon,
  length: number,
  offsets: Array<{ x: number; z: number; rank: number; width: number; seed: number }>,
) {
  for (const off of offsets) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      const wobble = Math.sin(u * 10 + off.seed) * 0.008;
      pts.push(new THREE.Vector3(off.x + wobble, -u * length, off.z + wobble * 0.6));
    }
    addRibbon(ribbon, pts, off.rank, off.width);
  }
}

function addFingers(wrist: THREE.Group, side: 1 | -1, material: THREE.Material) {
  const fingers: THREE.Group[] = [];
  const specs = [
    { x: -0.03 * side, z: 0.02, len: 0.052, rot: 0.5 * side },
    { x: -0.012 * side, z: 0.016, len: 0.074, rot: 0.08 * side },
    { x: 0.004 * side, z: 0.018, len: 0.082, rot: 0 },
    { x: 0.018 * side, z: 0.014, len: 0.076, rot: -0.08 * side },
    { x: 0.03 * side, z: 0.008, len: 0.062, rot: -0.16 * side },
  ];
  for (const spec of specs) {
    const finger = new THREE.Group();
    finger.position.set(spec.x, -0.02, spec.z);
    finger.rotation.z = spec.rot;
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
  const bright = glassMaterial(1.15, "glass-bright");
  const nerve = nerveMaterial(LOCK.ader, 0.34);
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
    new THREE.Vector2(0.001, -0.34),
    new THREE.Vector2(0.1, -0.28),
    new THREE.Vector2(0.128, -0.16),
    new THREE.Vector2(0.096, -0.04),
    new THREE.Vector2(0.112, 0.08),
    new THREE.Vector2(0.155, 0.18),
    new THREE.Vector2(0.178, 0.27),
    new THREE.Vector2(0.142, 0.35),
    new THREE.Vector2(0.058, 0.43),
    new THREE.Vector2(0.001, 0.5),
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
  jaw.position.set(0, -0.055, 0.02);
  jaw.scale.set(0.92, 0.62, 0.85);
  jaw.userData.restX = jaw.rotation.x;
  jaw.userData.restY = jaw.position.y;
  const nose = solid(head, capsule(0.012, 0.05), bright);
  nose.position.set(0, -0.005, P.headRadius * 0.92);
  nose.rotation.x = 0.4;
  const lips = solid(head, capsule(0.008, 0.045), glass);
  lips.position.set(0, -0.045, P.headRadius * 0.86);
  lips.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const ear = solid(head, new THREE.SphereGeometry(0.028, 10, 8), glass);
    ear.position.set(side * 0.1, -0.01, 0);
    ear.scale.set(0.45, 1, 0.7);
    const brow = solid(head, capsule(0.006, 0.04), bright);
    brow.position.set(side * 0.032, 0.03, P.headRadius * 0.86);
    brow.rotation.z = side * 0.4;
    brow.rotation.y = side * -0.3;
  }

  const starTex = glowSprite("#ffffff", LOCK.strom, 0, 0.28);
  const starMat = new THREE.SpriteMaterial({
    map: starTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  sealLookColor(starMat.color);
  markMaterial(starMat, "sprite");
  const star = new THREE.Sprite(starMat);
  star.position.set(0, 0.14, 0.1);
  star.scale.set(0.08, 0.08, 1);
  starMat.opacity = 0.45;
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
    eye.position.set(side * 0.032, 0.012, P.headRadius * 0.92);
    eye.scale.set(0.02, 0.02, 1);
    eye.renderOrder = 4;
    eye.userData.restX = eye.position.x;
    eye.userData.restY = eye.position.y;
    head.add(eye);
    eyes.push(eye);
  }
  const browTex = glowSprite("#ffffff", LOCK.kern, 0, 0.35);
  const browMat = new THREE.SpriteMaterial({
    map: browTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  sealLookColor(browMat.color);
  markMaterial(browMat, "sprite");
  const forehead = new THREE.Sprite(browMat);
  forehead.position.set(0, 0.055, P.headRadius * 0.9);
  forehead.scale.set(0.028, 0.028, 1);
  browMat.opacity = 0.4;
  forehead.renderOrder = 4;
  head.add(forehead);
  disposables.push(browTex, forehead.material);

  const headNerves = emptyRibbon();
  for (let i = 0; i < 16; i++) {
    const theta = (i / 16) * Math.PI * 2 + 0.3;
    const phi = 0.45 + (i % 6) * 0.2;
    strand(headNerves, 6, 0.08 + (i % 5) * 0.1, 0.00135, (u) => {
      const r = 0.028 + u * 0.07;
      const p = phi * (0.45 + u * 0.55);
      return [
        Math.cos(theta) * Math.sin(p) * r,
        Math.cos(p) * r * 0.9 - 0.008,
        Math.sin(theta) * Math.sin(p) * r * 0.75,
      ];
    });
  }
  strand(headNerves, 8, 0.1, 0.0018, (u) => [0, -0.02 + u * 0.1, 0.02 + Math.sin(u * Math.PI) * 0.02]);
  commitRibbon(head, headNerves, nerve);

  const torsoNerves = emptyRibbon();
  strand(torsoNerves, 14, 0.04, 0.0042, (u) => [
    Math.sin(u * 6.0) * 0.004,
    -0.28 + u * 0.82,
    -0.03 + Math.sin(u * Math.PI) * 0.02,
  ]);
  strand(torsoNerves, 12, 0.08, 0.0024, (u) => [0, -0.22 + u * 0.62, 0.07]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    strand(torsoNerves, 5, 0.14, 0.0016, (u) => [
      Math.cos(a) * (0.016 + u * 0.01),
      0.3 + u * 0.16,
      Math.sin(a) * 0.014,
    ]);
  }
  for (const side of [-1, 1] as const) {
    strand(torsoNerves, 12, 0.12, 0.0022, (u) => [
      side * (0.02 + Math.sin(u * Math.PI) * 0.012),
      -0.26 + u * 0.72,
      -0.04,
    ]);
    for (let rib = 0; rib < 8; rib++) {
      const t = rib / 7;
      const y = -0.06 + t * 0.34 + Math.sin(rib * 2.1) * 0.012;
      const reach = 0.055 + Math.sin(t * Math.PI) * 0.1;
      const bow = 0.02 + (rib % 3) * 0.012;
      strand(torsoNerves, 7, 0.18 + (rib % 5) * 0.07, 0.00145, (u) => [
        side * (0.02 + reach * Math.sin(u * Math.PI * (0.75 + (rib % 3) * 0.08))),
        y - u * bow + Math.sin(u * 6.5 + rib) * 0.008,
        -0.035 + u * (0.08 + (rib % 2) * 0.05),
      ]);
      if (rib % 2 === 0) {
        strand(torsoNerves, 4, 0.34 + rib * 0.04, 0.0012, (u) => [
          side * (0.04 + u * 0.07),
          y - 0.02 - u * 0.08,
          0.02 + u * 0.04,
        ]);
      }
    }
    strand(torsoNerves, 7, 0.1, 0.002, (u) => [
      side * (0.02 + u * 0.17),
      0.3 - u * 0.03,
      0.06 - u * 0.05,
    ]);
    strand(torsoNerves, 6, 0.42, 0.0015, (u) => [
      side * (0.05 + Math.sin(u * Math.PI) * 0.1),
      0.22 - u * 0.12,
      -0.07,
    ]);
    for (let i = 0; i < 6; i++) {
      const spread = (i - 2.5) * 0.018;
      strand(torsoNerves, 7, 0.2 + i * 0.06, 0.0015, (u) => [
        side * (0.012 + u * 0.05 + spread * 0.35),
        0.04 - u * 0.28,
        0.04 - u * 0.06,
      ]);
    }
  }
  commitRibbon(chest, torsoNerves, nerve);

  function makeArm(side: 1 | -1) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * P.shoulderX, P.shoulderLocalY, 0);
    chest.add(shoulder);
    const joint = solid(shoulder, new THREE.SphereGeometry(0.022, 12, 8), bright);
    joint.scale.set(1, 0.85, 0.75);
    const upperMesh = solid(shoulder, capsule(0.038, P.upperArm), glass);
    upperMesh.position.y = -P.upperArm / 2;
    const upperN = emptyRibbon();
    alongBone(upperN, P.upperArm, [
      { x: 0.008 * side, z: 0.01, rank: 0.1, width: 0.0024, seed: side },
      { x: -0.01 * side, z: -0.006, rank: 0.28, width: 0.0018, seed: side * 2 },
      { x: 0.0, z: 0.014, rank: 0.48, width: 0.0016, seed: side * 3 },
      { x: 0.014 * side, z: 0.0, rank: 0.66, width: 0.0014, seed: side * 4 },
    ]);
    commitRibbon(shoulder, upperN, nerve);

    const elbow = new THREE.Group();
    elbow.position.y = -P.upperArm;
    shoulder.add(elbow);
    solid(elbow, new THREE.SphereGeometry(0.016, 10, 8), bright);
    const foreMesh = solid(elbow, capsule(0.03, P.foreArm), glass);
    foreMesh.position.y = -P.foreArm / 2;
    const foreN = emptyRibbon();
    alongBone(foreN, P.foreArm, [
      { x: 0.006 * side, z: 0.008, rank: 0.14, width: 0.002, seed: 4 },
      { x: -0.007 * side, z: -0.004, rank: 0.36, width: 0.0016, seed: 5 },
      { x: 0.0, z: 0.01, rank: 0.58, width: 0.0014, seed: 6 },
    ]);
    commitRibbon(elbow, foreN, nerve);

    const wrist = new THREE.Group();
    wrist.position.y = -P.foreArm;
    elbow.add(wrist);
    solid(wrist, new THREE.SphereGeometry(0.012, 8, 6), bright);
    const palm = solid(wrist, new THREE.SphereGeometry(0.034, 12, 8), glass);
    palm.position.set(0, -0.03, 0.01);
    palm.scale.set(0.85, 1.15, 0.42);
    const fingers = addFingers(wrist, side, glass);
    const handN = emptyRibbon();
    for (let f = 0; f < 5; f++) {
      const x = (-0.028 + f * 0.014) * side;
      addRibbon(
        handN,
        [new THREE.Vector3(0, 0, 0.01), new THREE.Vector3(x, -0.085 - (f === 2 ? 0.01 : 0), 0.02)],
        0.25 + f * 0.08,
        0.0022,
      );
    }
    commitRibbon(wrist, handN, nerve);
    return { shoulder, elbow, wrist, fingers };
  }

  const left = makeArm(1);
  const right = makeArm(-1);

  const signalNerves = emptyRibbon();
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 5; s++) {
      const u = s / 5;
      pts.push(
        new THREE.Vector3(
          Math.cos(angle) * 0.02 * u,
          -0.04 - u * 0.08,
          Math.sin(angle) * 0.02 * u + 0.02,
        ),
      );
    }
    addRibbon(signalNerves, pts, 0.02, 0.003);
  }
  commitRibbon(right.shoulder, signalNerves, signal);

  const coreMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(LOCK.signal) },
      uCore: { value: new THREE.Color(LOCK.signalGlanz) },
      uBoost: { value: 1.2 },
    },
    vertexShader: glassVert,
    fragmentShader: glassFrag,
  });
  sealShaderChannels(coreMat, ["uColor", "uCore", "uBoost"]);
  markMaterial(coreMat, "core");
  disposables.push(coreMat);
  const core = solid(right.shoulder, new THREE.SphereGeometry(0.026, 16, 12), coreMat);
  core.position.set(-0.01, -0.05, 0.03);
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
    size: 0.012,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.22,
    sizeAttenuation: true,
  });
  sealLookColor(ringMat.color);
  markMaterial(ringMat, "ring");
  const ring = new THREE.Points(ringGeo, ringMat);
  ring.position.set(0, -0.04, 0.02);
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
    solid(hip, new THREE.SphereGeometry(0.028, 12, 8), bright);
    const thighMesh = solid(hip, capsule(0.056, P.thigh), glass);
    thighMesh.position.y = -P.thigh / 2;
    const hipN = emptyRibbon();
    alongBone(hipN, P.thigh, [
      { x: 0.008 * side, z: 0.012, rank: 0.1, width: 0.0022, seed: side * 6 },
      { x: -0.012 * side, z: -0.008, rank: 0.32, width: 0.0017, seed: 7 },
      { x: 0.002 * side, z: 0.018, rank: 0.55, width: 0.0014, seed: 11 },
    ]);
    const crest: THREE.Vector3[] = [];
    for (let s = 0; s <= 6; s++) {
      const u = s / 6;
      crest.push(
        new THREE.Vector3(
          side * (0.02 + u * 0.1),
          0.02 + Math.sin(u * Math.PI) * 0.02,
          -0.02 + u * 0.04,
        ),
      );
    }
    addRibbon(hipN, crest, 0.3, 0.003);
    commitRibbon(hip, hipN, nerve);

    const knee = new THREE.Group();
    knee.userData.lockKey = "knee";
    knee.position.y = -P.thigh;
    hip.add(knee);
    const cap = solid(knee, new THREE.SphereGeometry(0.02, 10, 8), bright);
    cap.position.z = 0.015;
    const shinMesh = solid(knee, capsule(0.038, P.shin), glass);
    shinMesh.position.y = -P.shin / 2;
    const shinN = emptyRibbon();
    alongBone(shinN, P.shin, [
      { x: 0.006 * side, z: 0.008, rank: 0.14, width: 0.0018, seed: 8 },
      { x: -0.006 * side, z: -0.006, rank: 0.4, width: 0.0015, seed: 9 },
      { x: 0.0, z: 0.012, rank: 0.62, width: 0.0013, seed: 12 },
    ]);
    commitRibbon(knee, shinN, nerve);

    const ankle = new THREE.Group();
    ankle.userData.lockKey = "ankle";
    ankle.position.y = -P.shin;
    knee.add(ankle);
    solid(ankle, new THREE.SphereGeometry(0.014, 8, 6), bright);
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
    for (let t = 0; t < 5; t++) {
      addRibbon(
        footN,
        [new THREE.Vector3(0, -0.01, 0.02), new THREE.Vector3((t - 2) * 0.014 * side, -0.02, 0.16)],
        0.35 + t * 0.08,
        0.002,
      );
    }
    commitRibbon(foot, footN, nerve);
  }

  makeLeg(1);
  makeLeg(-1);

  const pelvis = emptyRibbon();
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * 0.09, P.hipY + 0.015, Math.sin(a) * 0.05));
  }
  addRibbon(pelvis, ringPts, 0.12, 0.0022);
  commitRibbon(root, pelvis, nerve);

  const groundMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color(LOCK.strom) },
      uCore: { value: new THREE.Color(LOCK.kern) },
      uAder: { value: new THREE.Color(LOCK.ader) },
      uBoost: { value: 1 },
    },
    vertexShader: glassVert,
    fragmentShader: groundFrag,
  });
  sealShaderChannels(groundMat, ["uColor", "uCore", "uAder", "uBoost"]);
  markMaterial(groundMat, "ground");
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), groundMat);
  ground.position.set(0, 0.28, -0.06);
  ground.renderOrder = 0;
  ground.frustumCulled = false;
  root.add(ground);
  disposables.push(groundMat);

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
