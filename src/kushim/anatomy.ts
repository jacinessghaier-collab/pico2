import * as THREE from "three";
import { LOCK } from "@/kushim/lock";

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
  float fres = pow(1.0 - abs(dot(normalize(vN), viewDir)), 2.35);
  float spine = exp(-abs(vW.x) * 14.0) * smoothstep(0.35, 1.15, vW.y) * smoothstep(1.75, 1.35, vW.y);
  vec3 chest = vW - vec3(0.0, 1.34, 0.06);
  float star = exp(-dot(chest, chest) * 18.0);
  float alpha = fres * 0.95 * uBoost + 0.07 * uBoost + spine * 0.55 + star * 0.7;
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
uniform float uDensity;
varying float vAlong;
varying float vRank;
varying float vVisible;
void main() {
  vAlong = aAlong;
  vRank = aRank;
  vVisible = aRank <= uDensity ? 1.0 : 0.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 viewDir = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz);
  vec2 side = normalize(vec2(-viewDir.y, viewDir.x));
  if (length(viewDir.xy) < 0.001) side = vec2(1.0, 0.0);
  mv.xy += side * aSide * aWidth * 18.0;
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
varying float vVisible;
void main() {
  if (vVisible < 0.5) discard;
  float wave = fract(vAlong * 2.4 - uTime * uSpeed);
  float head = smoothstep(0.0, 0.02, wave) * smoothstep(0.2, 0.03, wave);
  float alpha = 0.55 + head * 1.0;
  gl_FragColor = vec4(mix(uColor, uCore, head), alpha);
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

function glassMaterial(boost: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(LOCK.strom) },
      uCore: { value: new THREE.Color(LOCK.kern) },
      uBoost: { value: boost },
    },
    vertexShader: glassVert,
    fragmentShader: glassFrag,
  });
}

function nerveMaterial(color: string, speed: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uCore: { value: new THREE.Color(color === LOCK.signal ? "#ffd0d4" : LOCK.kern) },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uDensity: { value: 1 },
    },
    vertexShader: nerveVert,
    fragmentShader: nerveFrag,
  });
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
  if (!ctx) return new THREE.CanvasTexture(canvas);
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
  return tex;
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
      const wobble = Math.sin(u * 10 + off.seed) * 0.005;
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
  const glass = glassMaterial(1);
  const bright = glassMaterial(1.8);
  const nerve = nerveMaterial(LOCK.strom, 0.34);
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

  const head = new THREE.Group();
  head.position.y = P.headLocalY;
  chest.add(head);
  const skull = solid(head, new THREE.SphereGeometry(P.headRadius, 24, 16), glass);
  skull.scale.set(1, 1.16, 1.02);
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

  const starTex = glowSprite("#ffffff", LOCK.strom, 10);
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  star.position.set(0, 0.14, 0.1);
  star.scale.set(0.36, 0.36, 1);
  star.renderOrder = 3;
  chest.add(star);
  disposables.push(starTex, star.material);

  const eyeTex = glowSprite("#ffffff", LOCK.kern, 0);
  const eyeMat = new THREE.SpriteMaterial({ map: eyeTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  disposables.push(eyeTex, eyeMat);
  const eyes: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Sprite(eyeMat);
    eye.position.set(side * 0.032, 0.012, P.headRadius * 0.92);
    eye.scale.set(0.028, 0.028, 1);
    eye.renderOrder = 4;
    eye.userData.restX = eye.position.x;
    eye.userData.restY = eye.position.y;
    head.add(eye);
    eyes.push(eye);
  }
  const browTex = glowSprite("#ffffff", LOCK.kern, 4);
  const forehead = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: browTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  forehead.position.set(0, 0.055, P.headRadius * 0.9);
  forehead.scale.set(0.05, 0.05, 1);
  forehead.renderOrder = 4;
  head.add(forehead);
  disposables.push(browTex, forehead.material);

  const torsoNerves = emptyRibbon();
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    spine.push(new THREE.Vector3(0, -0.26 + u * 0.78, -0.02 + Math.sin(u * Math.PI) * 0.015));
  }
  addRibbon(torsoNerves, spine, 0.05, 0.01);
  for (const side of [-1, 1]) {
    const chain: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      chain.push(new THREE.Vector3(side * 0.028, -0.24 + u * 0.7, -0.03));
    }
    addRibbon(torsoNerves, chain, 0.2, 0.0035);
    for (let rib = 0; rib < 8; rib++) {
      const t = rib / 7;
      const y = -0.02 + t * 0.28;
      const reach = 0.09 + Math.sin(t * Math.PI) * 0.075;
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 8; s++) {
        const u = s / 8;
        pts.push(new THREE.Vector3(side * reach * Math.sin(u * Math.PI * 0.9), y - u * 0.035, -0.03 + u * 0.12));
      }
      addRibbon(torsoNerves, pts, 0.15 + rib * 0.02, 0.0032);
    }
    const clavicle: THREE.Vector3[] = [];
    for (let s = 0; s <= 6; s++) {
      const u = s / 6;
      clavicle.push(new THREE.Vector3(side * (0.02 + u * 0.18), 0.3 - u * 0.02, 0.07 - u * 0.04));
    }
    addRibbon(torsoNerves, clavicle, 0.1, 0.004);
    const scapula = [
      new THREE.Vector3(side * 0.06, 0.22, -0.08),
      new THREE.Vector3(side * 0.16, 0.26, -0.07),
      new THREE.Vector3(side * 0.12, 0.1, -0.07),
      new THREE.Vector3(side * 0.06, 0.22, -0.08),
    ];
    addRibbon(torsoNerves, scapula, 0.55, 0.0028);
  }
  const sternum: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) sternum.push(new THREE.Vector3(0, 0.02 + i * 0.045, 0.09));
  addRibbon(torsoNerves, sternum, 0.08, 0.0045);
  commitRibbon(chest, torsoNerves, nerve);

  function makeArm(side: 1 | -1) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * P.shoulderX, P.shoulderLocalY, 0);
    chest.add(shoulder);
    const joint = solid(shoulder, new THREE.SphereGeometry(0.048, 14, 10), bright);
    joint.scale.set(1.05, 1, 0.9);
    const upperMesh = solid(shoulder, capsule(0.046, P.upperArm), glass);
    upperMesh.position.y = -P.upperArm / 2;
    const upperN = emptyRibbon();
    alongBone(upperN, P.upperArm, [
      { x: 0.01 * side, z: 0.012, rank: 0.12, width: 0.0036, seed: side },
      { x: -0.012 * side, z: -0.006, rank: 0.4, width: 0.0026, seed: side * 2 },
      { x: 0.0, z: 0.02, rank: 0.7, width: 0.0022, seed: side * 3 },
    ]);
    commitRibbon(shoulder, upperN, nerve);

    const elbow = new THREE.Group();
    elbow.position.y = -P.upperArm;
    shoulder.add(elbow);
    solid(elbow, new THREE.SphereGeometry(0.032, 12, 8), bright);
    const foreMesh = solid(elbow, capsule(0.036, P.foreArm), glass);
    foreMesh.position.y = -P.foreArm / 2;
    const foreN = emptyRibbon();
    alongBone(foreN, P.foreArm, [
      { x: 0.008 * side, z: 0.01, rank: 0.18, width: 0.003, seed: 4 },
      { x: -0.008 * side, z: -0.004, rank: 0.5, width: 0.0024, seed: 5 },
    ]);
    commitRibbon(elbow, foreN, nerve);

    const wrist = new THREE.Group();
    wrist.position.y = -P.foreArm;
    elbow.add(wrist);
    solid(wrist, new THREE.SphereGeometry(0.022, 10, 8), bright);
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
      uCore: { value: new THREE.Color("#ffd5d8") },
      uBoost: { value: 2.4 },
    },
    vertexShader: glassVert,
    fragmentShader: glassFrag,
  });
  disposables.push(coreMat);
  const core = solid(right.shoulder, new THREE.SphereGeometry(0.045, 16, 12), coreMat);
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
    size: 0.028,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.8,
    sizeAttenuation: true,
  });
  const ring = new THREE.Points(ringGeo, ringMat);
  ring.position.set(0, -0.04, 0.02);
  ring.frustumCulled = false;
  ring.renderOrder = 5;
  right.shoulder.add(ring);
  disposables.push(ringGeo, ringMat);

  function makeLeg(side: 1 | -1) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, P.hipY, 0);
    root.add(hip);
    solid(hip, new THREE.SphereGeometry(0.055, 14, 10), bright);
    const thighMesh = solid(hip, capsule(0.068, P.thigh), glass);
    thighMesh.position.y = -P.thigh / 2;
    const hipN = emptyRibbon();
    alongBone(hipN, P.thigh, [
      { x: 0.01 * side, z: 0.015, rank: 0.1, width: 0.0034, seed: side * 6 },
      { x: -0.016 * side, z: -0.01, rank: 0.45, width: 0.0024, seed: 7 },
    ]);
    const crest: THREE.Vector3[] = [];
    for (let s = 0; s <= 6; s++) {
      const u = s / 6;
      crest.push(new THREE.Vector3(side * (0.02 + u * 0.1), 0.02 + Math.sin(u * Math.PI) * 0.02, -0.02 + u * 0.04));
    }
    addRibbon(hipN, crest, 0.3, 0.003);
    commitRibbon(hip, hipN, nerve);

    const knee = new THREE.Group();
    knee.position.y = -P.thigh;
    hip.add(knee);
    const cap = solid(knee, new THREE.SphereGeometry(0.04, 12, 8), bright);
    cap.position.z = 0.02;
    const shinMesh = solid(knee, capsule(0.046, P.shin), glass);
    shinMesh.position.y = -P.shin / 2;
    const shinN = emptyRibbon();
    alongBone(shinN, P.shin, [
      { x: 0.008 * side, z: 0.01, rank: 0.16, width: 0.0028, seed: 8 },
      { x: -0.006 * side, z: -0.008, rank: 0.6, width: 0.0022, seed: 9 },
    ]);
    commitRibbon(knee, shinN, nerve);

    const ankle = new THREE.Group();
    ankle.position.y = -P.shin;
    knee.add(ankle);
    solid(ankle, new THREE.SphereGeometry(0.026, 10, 8), bright);
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
    ringPts.push(new THREE.Vector3(Math.cos(a) * 0.13, P.hipY + 0.02, Math.sin(a) * 0.08));
  }
  addRibbon(pelvis, ringPts, 0.12, 0.0036);
  commitRibbon(root, pelvis, nerve);

  root.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) disposables.push(mesh.geometry);
  });

  return {
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
}
