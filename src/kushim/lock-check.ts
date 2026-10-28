/**
 * Appearance lock-check. Fails loud when the frozen figure drifts.
 * Legal motion (breath, gestures, filament 0.86–1, shoulder spark, viseme,
 * jaw drop, gaze, blink) is the envelope from tickKushim and lipsync —
 * update those constants in the same change.
 * Silhouette, palette, the single red site, void, and the straight-on camera stay put.
 * The re-read also rejects a swapped shader or geometry, a reparented or hidden
 * part, a yawed or upside-down camera, and a scene that covers the void.
 * The live scene re-reads on LOCK_READ_SEC. There is no second checker and no post-pass.
 */
import * as THREE from "three";
import { LOCK } from "@/kushim/lock";

export class LockBreach extends Error {
  readonly de: string;
  readonly en: string;

  constructor(de: string, en: string) {
    super(`Lock-Bruch: ${de} / Lock breach: ${en}`);
    this.name = "LockBreach";
    this.de = de;
    this.en = en;
  }
}

/** Independent copy of the locked look. lock.ts must match; the test repeats the palette. */
export const LOCK_CANON = {
  void: "#000000",
  strom: "#3AD7FF",
  kern: "#E7FBFF",
  signal: "#FF3B4E",
  filament: "#D4F04A",
  filamentKern: "#F7FFC2",
  glass: {
    fill: 0.004,
    rim: 0.95,
    rimPower: 4.2,
    spine: 0.08,
    spineTight: 110,
    star: 0.04,
    starTight: 160,
    sprite: 0.04,
  },
  aura: {
    opacity: 0.5,
    tight: 680,
    width: 1.15,
    height: 2.16,
    y: 1,
    z: 0.2,
  },
  ground: {
    opacity: 0.5,
    y: 0.012,
    z: 0.05,
    radius: 0.22,
    foot: 0.11,
    tight: 520,
  },
  signalNerveCore: "#FF8A2A",
  signalCore: "#FFB15A",
  spriteInner: "#FFFFFF",
  proportions: {
    hipY: 0.96,
    chestY: 1.22,
    shoulderX: 0.2,
    shoulderLocalY: 0.28,
    upperArm: 0.4,
    foreArm: 0.31,
    thigh: 0.46,
    shin: 0.4,
    headRadius: 0.105,
    headLocalY: 0.44,
  },
  hipX: 0.11,
  torsoScale: [1.05, 1, 0.72],
  skullScale: [1, 1.16, 1.02],
  glassBoost: 1,
  brightBoost: 0.42,
  coreBoost: 2.4,
  nerveSpeed: 0.34,
  signalSpeed: 0.2,
  ringSize: 0.028,
  ringOpacity: 0.8,
  ringPoints: 96,
  corePos: [-0.05, -0.042, 0.042],
  ringPos: [-0.042, -0.04, 0.034],
  breathX: 0.008,
  breathY: 0.012,
  breathZ: 0.01,
  breathLift: 0.008,
  corePulse: 0.08,
  coreListen: 1.15,
  filamentMin: 0.86,
  filamentMax: 1,
  sparkRadius: 0.35,
  fov: 26,
  /** Viseme scale slack around the rest lips. Matches mouthTransform gain. */
  lipScaleX: 0.6,
  lipScaleY: 0.42,
  lipScaleZ: 0.32,
  /** jaw.position.y drop: mouth.jaw * 0.05. */
  jawDrop: 0.01,
  /** Eye offset from rest. Matches gaze * 0.006 / 0.004. */
  gazeX: 0.006,
  gazeY: 0.004,
  /** Blink opacity. Matches BLINK.eyeGain. */
  eyeOpacityMin: 0.15,
} as const;

function freezeCanon(value: object) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) freezeCanon(child);
  }
}

freezeCanon(LOCK_CANON);

export type MaterialRole =
  | "glass"
  | "glass-bright"
  | "nerve"
  | "signal"
  | "core"
  | "sprite"
  | "ring"
  | "aura"
  | "ground";

export type LockedRig = {
  root: THREE.Object3D;
  chest: THREE.Object3D;
  head: THREE.Object3D;
  shoulderL: THREE.Object3D;
  shoulderR: THREE.Object3D;
  elbowL: THREE.Object3D;
  elbowR: THREE.Object3D;
  wristL: THREE.Object3D;
  wristR: THREE.Object3D;
  fingersL: readonly THREE.Object3D[];
  fingersR: readonly THREE.Object3D[];
  jaw?: THREE.Object3D;
  lips?: THREE.Object3D;
  eyes?: readonly THREE.Object3D[];
  glass: THREE.ShaderMaterial;
  nerve: THREE.ShaderMaterial;
  signal: THREE.ShaderMaterial;
  ring: THREE.Points;
  core: THREE.Object3D;
};

type Phase = "build" | "live";

type Xform = {
  p: [number, number, number];
  r: [number, number, number];
  s: [number, number, number];
  parent: THREE.Object3D | null;
  geometry: THREE.BufferGeometry | null;
};

type SealedShader = {
  vertex: string;
  fragment: string;
  keys: string;
};

type Baseline = {
  nodes: Set<THREE.Object3D>;
  xform: Map<THREE.Object3D, Xform>;
};

type Mark = { lockKey?: string; lockSide?: number };
type Tint = { inner: string; outer: string };

const roles = new WeakMap<THREE.Material, MaterialRole>();
const tints = new WeakMap<THREE.Texture, Tint>();
const shaders = new WeakMap<THREE.Material, SealedShader>();
const baselines = new WeakMap<THREE.Object3D, Baseline>();

const EPS = 1e-4;

function breach(de: string, en: string): never {
  throw new LockBreach(de, en);
}

function finite(n: number, de: string, en: string): number {
  if (!Number.isFinite(n)) breach(de, en);
  return n;
}

function mustClose(actual: number, expected: number, de: string, en: string, tol = EPS) {
  const value = finite(actual, de, en);
  if (Math.abs(value - expected) > tol) {
    breach(`${de} (${value} ≠ ${expected})`, `${en} (${value} !== ${expected})`);
  }
}

function mustWithin(actual: number, expected: number, slack: number, de: string, en: string) {
  mustClose(actual, expected, de, en, slack + EPS);
}

function hexOf(color: THREE.Color): string {
  return `#${color.getHexString().toUpperCase()}`;
}

function mustHex(color: THREE.Color, expected: string, de: string, en: string) {
  if (!color?.isColor) breach(`${de} fehlt.`, `${en} is missing.`);
  if (!Object.isFrozen(color)) breach(`${de} ist nicht eingefroren.`, `${en} is not frozen.`);
  const actual = hexOf(color);
  if (actual !== expected.toUpperCase()) {
    breach(
      `${de} ist ${actual}, erwartet ${expected}.`,
      `${en} is ${actual}, expected ${expected}.`,
    );
  }
}

function markData(obj: THREE.Object3D): Mark {
  return obj.userData as Mark;
}

function materialsOf(obj: THREE.Object3D): THREE.Material[] {
  const material = (obj as THREE.Mesh).material;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function colorSlot(material: THREE.ShaderMaterial, name: string): THREE.Color {
  const slot = material.uniforms?.[name] as { value?: THREE.Color } | undefined;
  if (!slot || !Object.isFrozen(slot)) {
    breach(`Uniform ${name} ist nicht versiegelt.`, `Uniform ${name} is not sealed.`);
  }
  return slot.value as THREE.Color;
}

function numberSlot(material: THREE.ShaderMaterial, name: string, sealed: boolean): number {
  const slot = material.uniforms?.[name] as { value?: unknown } | undefined;
  if (!slot || typeof slot.value !== "number") {
    breach(`Uniform ${name} fehlt.`, `Uniform ${name} is missing.`);
  }
  if (sealed && !Object.isFrozen(slot)) {
    breach(`Uniform ${name} ist nicht versiegelt.`, `Uniform ${name} is not sealed.`);
  }
  if (!sealed && Object.isFrozen(slot)) {
    breach(
      `Uniform ${name} ist versehentlich versiegelt.`,
      `Uniform ${name} was sealed by mistake.`,
    );
  }
  return finite(slot.value, `Uniform ${name} ist ungültig.`, `Uniform ${name} is invalid.`);
}

function expectGlassLook(material: THREE.Material, de: string, en: string, side?: THREE.Side) {
  if (!material.transparent || material.depthWrite) {
    breach(`${de} ist nicht mehr durchscheinend.`, `${en} is no longer translucent.`);
  }
  if (material.blending !== THREE.AdditiveBlending) {
    breach(`${de} mischt nicht mehr additiv.`, `${en} no longer uses additive blending.`);
  }
  if (material.premultipliedAlpha) {
    breach(`${de} mischt vormultipliziert.`, `${en} uses premultiplied alpha.`);
  }
  const shader = material as THREE.ShaderMaterial;
  if (side !== undefined && shader.isShaderMaterial && shader.side !== side) {
    breach(
      `${de} hat die gesperrte Flächenseite verlassen.`,
      `${en} left its locked material side.`,
    );
  }
}

export function assertLockTable() {
  if (!Object.isFrozen(LOCK) || !Object.isFrozen(LOCK.proportions)) {
    breach("LOCK ist nicht eingefroren.", "LOCK is not frozen.");
  }
  if (!Object.isFrozen(LOCK_CANON) || !Object.isFrozen(LOCK_CANON.proportions)) {
    breach("Die Vergleichstabelle ist nicht eingefroren.", "The comparison table is not frozen.");
  }
  if (
    !Object.isFrozen(LOCK.glass) ||
    !Object.isFrozen(LOCK.aura) ||
    !Object.isFrozen(LOCK.ground) ||
    !Object.isFrozen(LOCK_CANON.glass) ||
    !Object.isFrozen(LOCK_CANON.aura) ||
    !Object.isFrozen(LOCK_CANON.ground)
  ) {
    breach("Die Hüllenwerte sind nicht eingefroren.", "The shell values are not frozen.");
  }
  const top = Object.keys(LOCK).sort().join(",");
  if (top !== "aura,filament,filamentKern,glass,ground,kern,proportions,signal,strom,void") {
    breach("LOCK hat andere Schlüssel.", "LOCK has different keys.");
  }
  const colors = ["void", "strom", "kern", "signal", "filament", "filamentKern"] as const;
  for (const key of colors) {
    if (LOCK[key].toUpperCase() !== LOCK_CANON[key]) {
      breach(
        `LOCK.${key} ist ${LOCK[key]}, erwartet ${LOCK_CANON[key]}.`,
        `LOCK.${key} is ${LOCK[key]}, expected ${LOCK_CANON[key]}.`,
      );
    }
  }
  const liveKeys = Object.keys(LOCK.proportions).sort().join(",");
  const canonKeys = Object.keys(LOCK_CANON.proportions).sort().join(",");
  if (liveKeys !== canonKeys) {
    breach(
      "Die Proportionstabelle hat andere Schlüssel.",
      "The proportion table has different keys.",
    );
  }
  const keys = Object.keys(LOCK_CANON.proportions) as (keyof typeof LOCK_CANON.proportions)[];
  for (const key of keys) {
    if (LOCK.proportions[key] !== LOCK_CANON.proportions[key]) {
      breach(
        `Proportion ${key} ist ${LOCK.proportions[key]}, erwartet ${LOCK_CANON.proportions[key]}.`,
        `Proportion ${key} is ${LOCK.proportions[key]}, expected ${LOCK_CANON.proportions[key]}.`,
      );
    }
  }
  expectNest(LOCK.glass, LOCK_CANON.glass, "glass");
  expectNest(LOCK.aura, LOCK_CANON.aura, "aura");
  expectNest(LOCK.ground, LOCK_CANON.ground, "ground");
}

function expectNest(
  live: { readonly [key: string]: number },
  canon: { readonly [key: string]: number },
  nest: string,
) {
  const liveKeys = Object.keys(live).sort().join(",");
  const canonKeys = Object.keys(canon).sort().join(",");
  if (liveKeys !== canonKeys) {
    breach(`LOCK.${nest} hat andere Schlüssel.`, `LOCK.${nest} has different keys.`);
  }
  for (const key of Object.keys(canon)) {
    if (live[key] !== canon[key]) {
      breach(
        `LOCK.${nest}.${key} ist ${live[key]}, erwartet ${canon[key]}.`,
        `LOCK.${nest}.${key} is ${live[key]}, expected ${canon[key]}.`,
      );
    }
  }
}

function expectShell(material: THREE.ShaderMaterial, de: string, en: string) {
  const shell = LOCK_CANON.glass;
  mustClose(numberSlot(material, "uFill", true), shell.fill, `${de}-Füllung`, `${en} fill`);
  mustClose(numberSlot(material, "uRim", true), shell.rim, `${de}-Rand`, `${en} rim`);
  mustClose(
    numberSlot(material, "uRimPower", true),
    shell.rimPower,
    `${de}-Randschärfe`,
    `${en} rim power`,
  );
  mustClose(numberSlot(material, "uSpine", true), shell.spine, `${de}-Strahl`, `${en} beam`);
  mustClose(
    numberSlot(material, "uSpineTight", true),
    shell.spineTight,
    `${de}-Strahlbreite`,
    `${en} beam width`,
  );
  mustClose(numberSlot(material, "uStar", true), shell.star, `${de}-Brustkern`, `${en} chest core`);
  mustClose(
    numberSlot(material, "uStarTight", true),
    shell.starTight,
    `${de}-Brustkern-Enge`,
    `${en} chest-core tightness`,
  );
}

export function markMaterial(material: THREE.Material, role: MaterialRole) {
  roles.set(material, role);
  const shader = material as THREE.ShaderMaterial;
  if (!shader.isShaderMaterial) return;
  shaders.set(material, {
    vertex: shader.vertexShader,
    fragment: shader.fragmentShader,
    keys: Object.keys(shader.uniforms ?? {}).sort().join(","),
  });
}

function auditShader(material: THREE.Material) {
  const shader = material as THREE.ShaderMaterial;
  if (!shader.isShaderMaterial) return;
  const sealed = shaders.get(material);
  if (!sealed) breach("Shader ohne Siegel.", "Shader is missing its seal.");
  if (shader.vertexShader !== sealed.vertex || shader.fragmentShader !== sealed.fragment) {
    breach("Der Shader der Figur wurde ausgetauscht.", "The figure shader was replaced.");
  }
  const keys = Object.keys(shader.uniforms ?? {}).sort().join(",");
  if (keys !== sealed.keys) {
    breach("Die Shader-Uniforms wurden erweitert.", "Shader uniforms were extended.");
  }
}

export function markTint(texture: THREE.Texture, inner: string, outer: string) {
  tints.set(texture, { inner, outer });
}

export function sealShaderChannels(material: THREE.ShaderMaterial, names: readonly string[]) {
  for (const name of names) {
    const slot = material.uniforms?.[name];
    if (!slot) {
      breach(`Uniform ${name} fehlt beim Versiegeln.`, `Uniform ${name} is missing while sealing.`);
    }
    const value = slot.value as { isColor?: boolean } | undefined;
    if (value && typeof value === "object" && value.isColor) Object.freeze(value);
    Object.freeze(slot);
  }
}

export function sealLookColor(color: THREE.Color) {
  Object.freeze(color);
}

function geometryOf(obj: THREE.Object3D): THREE.BufferGeometry | null {
  const geo = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  if (!geo || !geo.isBufferGeometry) return null;
  return geo;
}

function readXform(obj: THREE.Object3D): Xform {
  return {
    p: [obj.position.x, obj.position.y, obj.position.z],
    r: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    s: [obj.scale.x, obj.scale.y, obj.scale.z],
    parent: obj.parent,
    geometry: geometryOf(obj),
  };
}

export function rememberBaseline(rig: LockedRig) {
  const nodes = new Set<THREE.Object3D>();
  const xform = new Map<THREE.Object3D, Xform>();
  rig.root.traverse((obj) => {
    nodes.add(obj);
    xform.set(obj, readXform(obj));
  });
  baselines.set(rig.root, { nodes, xform });
}

function under(obj: THREE.Object3D, ancestor: THREE.Object3D) {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function auditChain(rig: LockedRig) {
  if (rig.chest.parent !== rig.root) {
    breach("Der Brustkorb hängt nicht mehr am Körper.", "The chest is no longer on the body.");
  }
  if (rig.head.parent !== rig.chest) {
    breach("Der Kopf hängt nicht mehr am Brustkorb.", "The head is no longer on the chest.");
  }
  const arms = [
    [
      rig.shoulderL,
      rig.elbowL,
      rig.wristL,
      "Der linke Arm ist auseinander.",
      "The left arm came apart.",
    ],
    [
      rig.shoulderR,
      rig.elbowR,
      rig.wristR,
      "Der rechte Arm ist auseinander.",
      "The right arm came apart.",
    ],
  ] as const;
  for (const [shoulder, elbow, wrist, de, en] of arms) {
    if (shoulder.parent !== rig.chest || elbow.parent !== shoulder || wrist.parent !== elbow)
      breach(de, en);
  }
  if (rig.core.parent !== rig.shoulderR || rig.ring.parent !== rig.shoulderR) {
    breach(
      "Rotes Signal sitzt nicht auf Kushims rechter Schulter.",
      "Red signal is not on Kushim's right shoulder.",
    );
  }
}

function auditSkeleton(rig: LockedRig, phase: Phase) {
  const P = LOCK.proportions;
  if (phase === "build") {
    mustClose(rig.chest.position.y, P.chestY, "Brusthöhe", "Chest height");
    mustClose(rig.chest.scale.x, 1, "Brustbreite", "Chest width");
    mustClose(rig.chest.scale.y, 1, "Brusthöhe in der Skalierung", "Chest scale height");
    mustClose(rig.chest.scale.z, 1, "Brusttiefe", "Chest depth");
  } else {
    mustWithin(rig.chest.position.y, P.chestY, LOCK_CANON.breathLift, "Brusthöhe", "Chest height");
    mustWithin(rig.chest.scale.x, 1, LOCK_CANON.breathX, "Brustbreite", "Chest width");
    mustWithin(rig.chest.scale.y, 1, LOCK_CANON.breathY, "Brustrhythmus", "Chest rhythm");
    mustWithin(rig.chest.scale.z, 1, LOCK_CANON.breathZ, "Brusttiefe", "Chest depth");
  }
  mustClose(rig.chest.position.x, 0, "Brustkorb seitlich", "Chest lateral position");
  mustClose(rig.chest.position.z, 0, "Brustkorb in der Tiefe", "Chest depth position");
  mustClose(rig.chest.rotation.x, 0, "Brustkorb-Neigung", "Chest pitch");
  mustClose(rig.chest.rotation.y, 0, "Brustkorb-Drehung", "Chest yaw");
  mustClose(rig.chest.rotation.z, 0, "Brustkorb-Rolle", "Chest roll");

  mustClose(rig.head.position.x, 0, "Kopf seitlich", "Head lateral position");
  mustClose(rig.head.position.y, P.headLocalY, "Kopfhöhe", "Head height");
  mustClose(rig.head.position.z, 0, "Kopftiefe", "Head depth");
  mustClose(rig.head.scale.x, 1, "Kopfskalierung", "Head scale");
  mustClose(rig.head.scale.y, 1, "Kopfskalierung", "Head scale");
  mustClose(rig.head.scale.z, 1, "Kopfskalierung", "Head scale");

  const shoulders = [
    [rig.shoulderL, P.shoulderX],
    [rig.shoulderR, -P.shoulderX],
  ] as const;
  for (const [shoulder, x] of shoulders) {
    mustClose(shoulder.position.x, x, "Schulterbreite", "Shoulder width");
    mustClose(shoulder.position.y, P.shoulderLocalY, "Schulterhöhe", "Shoulder height");
    mustClose(shoulder.position.z, 0, "Schultertiefe", "Shoulder depth");
    mustClose(shoulder.scale.x, 1, "Schulterskalierung", "Shoulder scale");
    mustClose(shoulder.scale.y, 1, "Schulterskalierung", "Shoulder scale");
    mustClose(shoulder.scale.z, 1, "Schulterskalierung", "Shoulder scale");
  }
  if (!(rig.shoulderR.position.x < 0) || !(rig.shoulderL.position.x > 0)) {
    breach(
      "Die rechte Schulter muss links im Bild liegen.",
      "The figure's right shoulder must sit on the left of the frame.",
    );
  }

  for (const elbow of [rig.elbowL, rig.elbowR]) {
    mustClose(elbow.position.x, 0, "Oberarmlänge, seitlich", "Upper-arm length, lateral");
    mustClose(elbow.position.y, -P.upperArm, "Oberarmlänge", "Upper-arm length");
    mustClose(elbow.position.z, 0, "Oberarmlänge, Tiefe", "Upper-arm length, depth");
  }
  for (const wrist of [rig.wristL, rig.wristR]) {
    mustClose(wrist.position.x, 0, "Unterarmlänge, seitlich", "Forearm length, lateral");
    mustClose(wrist.position.y, -P.foreArm, "Unterarmlänge", "Forearm length");
    mustClose(wrist.position.z, 0, "Unterarmlänge, Tiefe", "Forearm length, depth");
  }

  const found = {
    hip: [] as THREE.Object3D[],
    knee: [] as THREE.Object3D[],
    ankle: [] as THREE.Object3D[],
    skull: [] as THREE.Object3D[],
    torso: [] as THREE.Object3D[],
  };
  rig.root.traverse((obj) => {
    const key = markData(obj).lockKey;
    if (key && key in found) found[key as keyof typeof found].push(obj);
  });
  if (found.torso.length !== 1 || found.skull.length !== 1) {
    breach("Rumpf oder Schädel fehlt.", "Torso or skull is missing.");
  }
  if (found.hip.length !== 2 || found.knee.length !== 2 || found.ankle.length !== 2) {
    breach("Beine sind nicht mehr vollständig.", "The legs are no longer complete.");
  }

  const torso = found.torso[0];
  const skull = found.skull[0];
  if (torso.parent !== rig.chest || skull.parent !== rig.head) {
    breach("Rumpf oder Schädel wurde umgehängt.", "Torso or skull was reparented.");
  }
  mustClose(torso.scale.x, LOCK_CANON.torsoScale[0], "Rumpfbreite", "Torso width");
  mustClose(torso.scale.y, LOCK_CANON.torsoScale[1], "Rumpfhöhe", "Torso height");
  mustClose(torso.scale.z, LOCK_CANON.torsoScale[2], "Rumpftiefe", "Torso depth");
  mustClose(skull.scale.x, LOCK_CANON.skullScale[0], "Schädelbreite", "Skull width");
  mustClose(skull.scale.y, LOCK_CANON.skullScale[1], "Schädellänge", "Skull length");
  mustClose(skull.scale.z, LOCK_CANON.skullScale[2], "Schädeltiefe", "Skull depth");
  const skullRadius = ((skull as THREE.Mesh).geometry as THREE.SphereGeometry).parameters?.radius;
  if (!Number.isFinite(skullRadius)) breach("Schädelradius fehlt.", "Skull radius is missing.");
  mustClose(skullRadius, P.headRadius, "Schädelradius", "Skull radius");

  const sides = new Set<number>();
  for (const hip of found.hip) {
    const side = markData(hip).lockSide;
    if (side !== 1 && side !== -1) breach("Hüftseite fehlt.", "Hip side is missing.");
    sides.add(side);
    mustClose(hip.position.x, side * LOCK_CANON.hipX, "Hüftbreite", "Hip width");
    mustClose(hip.position.y, P.hipY, "Hüfthöhe", "Hip height");
    mustClose(hip.position.z, 0, "Hüfttiefe", "Hip depth");
    if (hip.parent !== rig.root)
      breach("Die Hüfte hängt nicht am Körper.", "A hip is off the body.");
  }
  if (sides.size !== 2) breach("Beide Hüftseiten müssen bleiben.", "Both hip sides must remain.");

  for (const knee of found.knee) {
    mustClose(knee.position.y, -P.thigh, "Oberschenkellänge", "Thigh length");
    mustClose(knee.position.x, 0, "Knie seitlich", "Knee lateral");
    mustClose(knee.position.z, 0, "Knie in der Tiefe", "Knee depth");
    if (markData(knee.parent ?? new THREE.Object3D()).lockKey !== "hip") {
      breach("Das Knie hängt nicht an der Hüfte.", "A knee is not attached to its hip.");
    }
  }
  for (const ankle of found.ankle) {
    mustClose(ankle.position.y, -P.shin, "Unterschenkellänge", "Shin length");
    mustClose(ankle.position.x, 0, "Knöchel seitlich", "Ankle lateral");
    mustClose(ankle.position.z, 0, "Knöchel in der Tiefe", "Ankle depth");
    if (markData(ankle.parent ?? new THREE.Object3D()).lockKey !== "knee") {
      breach("Der Knöchel hängt nicht am Knie.", "An ankle is not attached to its knee.");
    }
  }

  mustClose(rig.core.position.x, LOCK_CANON.corePos[0], "Signalkern X", "Signal core X");
  mustClose(rig.core.position.y, LOCK_CANON.corePos[1], "Signalkern Y", "Signal core Y");
  mustClose(rig.core.position.z, LOCK_CANON.corePos[2], "Signalkern Z", "Signal core Z");
  mustClose(rig.core.rotation.x, 0, "Signalkern-Drehung", "Signal core rotation");
  mustClose(rig.core.rotation.y, 0, "Signalkern-Drehung", "Signal core rotation");
  mustClose(rig.core.rotation.z, 0, "Signalkern-Drehung", "Signal core rotation");
  const minCore = 1 - LOCK_CANON.corePulse;
  const maxCore = (1 + LOCK_CANON.corePulse) * LOCK_CANON.coreListen;
  if (phase === "build") {
    mustClose(rig.core.scale.x, 1, "Signalkern-Größe", "Signal core size");
  } else if (rig.core.scale.x < minCore - EPS || rig.core.scale.x > maxCore + EPS) {
    breach(
      `Signalkern-Größe ${rig.core.scale.x} liegt außerhalb des Pulses.`,
      `Signal core size ${rig.core.scale.x} is outside the pulse.`,
    );
  }
  mustClose(
    rig.core.scale.y,
    rig.core.scale.x,
    "Signalkern ungleichmäßig",
    "Signal core is non-uniform",
  );
  mustClose(
    rig.core.scale.z,
    rig.core.scale.x,
    "Signalkern ungleichmäßig",
    "Signal core is non-uniform",
  );

  mustClose(rig.ring.position.x, LOCK_CANON.ringPos[0], "Signalring X", "Signal ring X");
  mustClose(rig.ring.position.y, LOCK_CANON.ringPos[1], "Signalring Y", "Signal ring Y");
  mustClose(rig.ring.position.z, LOCK_CANON.ringPos[2], "Signalring Z", "Signal ring Z");
  const attr = rig.ring.geometry?.getAttribute("position");
  if (!attr || attr.count !== LOCK_CANON.ringPoints) {
    breach("Der Signalring hat nicht mehr 96 Funken.", "The signal ring no longer has 96 sparks.");
  }
  const array = attr.array as ArrayLike<number>;
  for (let i = 0; i < attr.count; i++) {
    const x = finite(array[i * 3], "Signalring ungültig.", "Signal ring is invalid.");
    const y = finite(array[i * 3 + 1], "Signalring ungültig.", "Signal ring is invalid.");
    const z = finite(array[i * 3 + 2], "Signalring ungültig.", "Signal ring is invalid.");
    if (Math.hypot(x, y, z) > LOCK_CANON.sparkRadius) {
      breach("Die roten Funken verlassen die Schulter.", "The red sparks leave the shoulder.");
    }
  }
}

function auditMaterials(rig: LockedRig, phase: Phase) {
  const counts = new Map<MaterialRole, Set<THREE.Material>>();
  const bump = (role: MaterialRole, material: THREE.Material) => {
    let set = counts.get(role);
    if (!set) {
      set = new Set();
      counts.set(role, set);
    }
    set.add(material);
  };

  const expectRole = (material: THREE.Material, role: MaterialRole, de: string, en: string) => {
    if (roles.get(material) !== role) breach(de, en);
  };
  expectRole(rig.glass, "glass", "Glasrolle fehlt.", "Glass role is missing.");
  expectRole(rig.nerve, "nerve", "Nervenrolle fehlt.", "Nerve role is missing.");
  expectRole(rig.signal, "signal", "Signalrolle fehlt.", "Signal role is missing.");
  const coreMat = (rig.core as THREE.Mesh).material;
  const ringMat = rig.ring.material;
  if (!coreMat || Array.isArray(coreMat) || !ringMat || Array.isArray(ringMat)) {
    breach("Kern oder Ring hat kein einzelnes Material.", "Core or ring has no single material.");
  }
  expectRole(coreMat, "core", "Kernrolle fehlt.", "Core role is missing.");
  expectRole(ringMat, "ring", "Ringrolle fehlt.", "Ring role is missing.");

  rig.root.traverse((obj) => {
    for (const material of materialsOf(obj)) {
      const role = roles.get(material);
      if (!role) breach("Unmarkiertes Material an der Figur.", "Unmarked material on the figure.");
      auditShader(material);
      bump(role, material);
      if ((role === "signal" || role === "core" || role === "ring") && !under(obj, rig.shoulderR)) {
        breach(
          "Rotes Signal sitzt nicht auf Kushims rechter Schulter.",
          "Red signal is not on Kushim's right shoulder.",
        );
      }
      if ((role === "signal" || role === "core" || role === "ring") && under(obj, rig.shoulderL)) {
        breach("Die linke Schulter trägt Rot.", "The left shoulder carries red.");
      }
    }
  });

  const expectCount = (role: MaterialRole, count: number) => {
    const actual = counts.get(role)?.size ?? 0;
    if (actual !== count) {
      breach(
        `Material ${role} kommt ${actual} mal vor, erwartet ${count}.`,
        `Material ${role} appears ${actual} times, expected ${count}.`,
      );
    }
  };
  expectCount("glass", 1);
  expectCount("glass-bright", 1);
  expectCount("nerve", 1);
  expectCount("signal", 1);
  expectCount("core", 1);
  expectCount("ring", 1);
  expectCount("sprite", 3);
  expectCount("aura", 1);
  expectCount("ground", 1);

  const glassBoost = numberSlot(rig.glass, "uBoost", true);
  mustClose(glassBoost, LOCK_CANON.glassBoost, "Glas-Boost", "Glass boost");
  mustHex(colorSlot(rig.glass, "uColor"), LOCK_CANON.strom, "Glasfarbe Strom", "Glass strom color");
  mustHex(colorSlot(rig.glass, "uCore"), LOCK_CANON.kern, "Glasfarbe Kern", "Glass core color");
  expectGlassLook(rig.glass, "Glas", "Glass", THREE.DoubleSide);
  expectShell(rig.glass, "Glas", "Glass");

  const brightMats: THREE.ShaderMaterial[] = [];
  rig.root.traverse((obj) => {
    for (const material of materialsOf(obj)) {
      if (roles.get(material) === "glass-bright") brightMats.push(material as THREE.ShaderMaterial);
    }
  });
  const bright = brightMats[0];
  if (!bright) breach("Helles Glas fehlt.", "Bright glass is missing.");
  mustClose(
    numberSlot(bright, "uBoost", true),
    LOCK_CANON.brightBoost,
    "Glanz-Boost",
    "Bright boost",
  );
  mustHex(colorSlot(bright, "uColor"), LOCK_CANON.strom, "Glanzfarbe Strom", "Bright strom color");
  mustHex(colorSlot(bright, "uCore"), LOCK_CANON.kern, "Glanzfarbe Kern", "Bright core color");
  expectGlassLook(bright, "Glanz", "Bright glass", THREE.DoubleSide);
  expectShell(bright, "Glanz", "Bright glass");

  mustHex(
    colorSlot(rig.nerve, "uColor"),
    LOCK_CANON.filament,
    "Nervenfarbe Filament",
    "Nerve filament color",
  );
  mustHex(
    colorSlot(rig.nerve, "uCore"),
    LOCK_CANON.filamentKern,
    "Nervenfarbe Filamentkern",
    "Nerve filament highlight",
  );
  mustClose(
    numberSlot(rig.nerve, "uSpeed", true),
    LOCK_CANON.nerveSpeed,
    "Nervengeschwindigkeit",
    "Nerve speed",
  );
  const density = numberSlot(rig.nerve, "uDensity", false);
  numberSlot(rig.nerve, "uTime", false);
  if (phase === "build") mustClose(density, 1, "Filamentdichte", "Filament density");
  else if (density < LOCK_CANON.filamentMin - EPS || density > LOCK_CANON.filamentMax + EPS) {
    breach(
      `Filamentdichte ${density} liegt außerhalb 0.86–1.`,
      `Filament density ${density} is outside 0.86–1.`,
    );
  }
  expectGlassLook(rig.nerve, "Nerven", "Nerves", THREE.DoubleSide);

  mustHex(colorSlot(rig.signal, "uColor"), LOCK_CANON.signal, "Signalfarbe", "Signal color");
  mustHex(
    colorSlot(rig.signal, "uCore"),
    LOCK_CANON.signalNerveCore,
    "Signal-Kernlicht",
    "Signal nerve highlight",
  );
  mustClose(
    numberSlot(rig.signal, "uSpeed", true),
    LOCK_CANON.signalSpeed,
    "Signalgeschwindigkeit",
    "Signal speed",
  );
  mustClose(numberSlot(rig.signal, "uDensity", false), 1, "Signaldichte", "Signal density");
  numberSlot(rig.signal, "uTime", false);
  expectGlassLook(rig.signal, "Signalnerven", "Signal nerves", THREE.DoubleSide);

  const coreShader = coreMat as THREE.ShaderMaterial;
  mustHex(
    colorSlot(coreShader, "uColor"),
    LOCK_CANON.signal,
    "Kernfarbe Signal",
    "Core signal color",
  );
  mustHex(colorSlot(coreShader, "uCore"), LOCK_CANON.signalCore, "Kern-Glanz", "Core highlight");
  mustClose(
    numberSlot(coreShader, "uBoost", true),
    LOCK_CANON.coreBoost,
    "Kern-Boost",
    "Core boost",
  );
  expectGlassLook(coreShader, "Signalkern", "Signal core", THREE.FrontSide);

  const points = ringMat as THREE.PointsMaterial;
  mustHex(points.color, LOCK_CANON.signal, "Ringfarbe", "Ring color");
  mustClose(points.size, LOCK_CANON.ringSize, "Ringgröße", "Ring size");
  if (phase === "build")
    mustClose(points.opacity, LOCK_CANON.ringOpacity, "Ringdeckkraft", "Ring opacity");
  else if (points.opacity < -EPS || points.opacity > 1 + EPS) {
    breach(
      `Ringdeckkraft ${points.opacity} ist außerhalb 0–1.`,
      `Ring opacity ${points.opacity} is outside 0–1.`,
    );
  }
  if (
    !points.transparent ||
    points.depthWrite ||
    points.blending !== THREE.AdditiveBlending ||
    points.premultipliedAlpha ||
    !points.sizeAttenuation
  ) {
    breach(
      "Der Signalring hat seine Funkendarstellung verloren.",
      "The signal ring lost its spark look.",
    );
  }

  rig.root.traverse((obj) => {
    for (const material of materialsOf(obj)) {
      if (roles.get(material) !== "sprite") continue;
      const sprite = material as THREE.SpriteMaterial;
      mustHex(sprite.color, LOCK_CANON.spriteInner, "Sprite-Tönung", "Sprite tint");
      if (
        sprite.opacity < LOCK_CANON.eyeOpacityMin - EPS ||
        sprite.opacity > 1 + EPS ||
        !Number.isFinite(sprite.opacity)
      ) {
        breach(
          `Lichtpunkt-Deckkraft ${sprite.opacity} liegt außerhalb des Blinzelns.`,
          `Light-point opacity ${sprite.opacity} is outside the blink.`,
        );
      }
      expectGlassLook(sprite, "Lichtpunkt", "Light point");
      const tint = sprite.map ? tints.get(sprite.map) : undefined;
      if (!tint)
        breach("Lichtpunkt ohne gesperrte Farbe.", "Light point is missing its locked tint.");
      if (tint.inner.toUpperCase() !== LOCK_CANON.spriteInner) {
        breach("Lichtpunkt-Innenfarbe driftet.", "Light-point inner color drifted.");
      }
      const outer = tint.outer.toUpperCase();
      if (outer !== LOCK_CANON.strom && outer !== LOCK_CANON.kern) {
        breach(
          `Lichtpunkt trägt ${outer} statt Strom oder Kern.`,
          `Light point uses ${outer} instead of strom or kern.`,
        );
      }
    }
  });
  auditShellExtras(rig);
}

function objectByKey(root: THREE.Object3D, key: string): THREE.Object3D | null {
  const hits: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (markData(obj).lockKey === key) hits.push(obj);
  });
  if (hits.length > 1) breach(`Schlüssel ${key} ist doppelt.`, `Key ${key} is duplicated.`);
  return hits[0] ?? null;
}

function auditShellExtras(rig: LockedRig) {
  const chest = objectByKey(rig.chest, "chest-core");
  if (!chest) breach("Der Brustkern fehlt.", "The chest core is missing.");
  mustClose(chest.scale.x, LOCK_CANON.glass.sprite, "Brustkern-Größe", "Chest-core size");
  mustClose(chest.scale.y, LOCK_CANON.glass.sprite, "Brustkern-Größe", "Chest-core size");
  mustClose(chest.scale.z, 1, "Brustkern-Tiefe", "Chest-core depth");

  const aura = objectByKey(rig.root, "aura");
  if (!aura || aura.parent !== rig.root) {
    breach("Die Aura hängt nicht am Körper.", "The aura is not on the body.");
  }
  if ((aura as THREE.Points).isPoints) {
    breach("Die Aura ist noch ein Partikelring.", "The aura is still a particle ring.");
  }
  const auraMesh = aura as THREE.Mesh<THREE.PlaneGeometry>;
  if (!auraMesh.isMesh) {
    breach("Die Aura ist kein durchgehender Schleier.", "The aura is not a continuous veil.");
  }
  const auraMat = auraMesh.material;
  if (!auraMat || Array.isArray(auraMat) || roles.get(auraMat) !== "aura") {
    breach("Aura-Material fehlt.", "Aura material is missing.");
  }
  const auraShader = auraMat as THREE.ShaderMaterial;
  mustHex(colorSlot(auraShader, "uColor"), LOCK_CANON.strom, "Aurafarbe", "Aura color");
  mustClose(
    numberSlot(auraShader, "uOpacity", true),
    LOCK_CANON.aura.opacity,
    "Auradeckkraft",
    "Aura opacity",
  );
  mustClose(
    numberSlot(auraShader, "uTight", true),
    LOCK_CANON.aura.tight,
    "Auraenge",
    "Aura tightness",
  );
  expectGlassLook(auraShader, "Aura", "Aura", THREE.DoubleSide);
  mustClose(aura.position.x, 0, "Aura seitlich", "Aura lateral");
  mustClose(aura.position.y, LOCK_CANON.aura.y, "Aurahöhe", "Aura height");
  mustClose(aura.position.z, LOCK_CANON.aura.z, "Auratiefe", "Aura depth");
  const auraSize = auraMesh.geometry?.parameters;
  if (!auraSize || !Number.isFinite(auraSize.width) || !Number.isFinite(auraSize.height)) {
    breach("Auramasse fehlt.", "Aura size is missing.");
  }
  mustClose(auraSize.width, LOCK_CANON.aura.width, "Aurabreite", "Aura width");
  mustClose(auraSize.height, LOCK_CANON.aura.height, "Auralänge", "Aura length");

  const ground = objectByKey(rig.root, "ground");
  if (!ground || ground.parent !== rig.root) {
    breach("Das Bodenlicht hängt nicht am Körper.", "The ground light is not on the body.");
  }
  mustClose(ground.position.y, LOCK_CANON.ground.y, "Bodenlicht-Höhe", "Ground-light height");
  mustClose(ground.position.z, LOCK_CANON.ground.z, "Bodenlicht-Tiefe", "Ground-light depth");
  mustClose(ground.position.x, 0, "Bodenlicht seitlich", "Ground-light lateral");
  const groundMat = (ground as THREE.Mesh).material;
  if (!groundMat || Array.isArray(groundMat) || roles.get(groundMat) !== "ground") {
    breach("Bodenlicht-Material fehlt.", "Ground-light material is missing.");
  }
  const shader = groundMat as THREE.ShaderMaterial;
  mustHex(colorSlot(shader, "uColor"), LOCK_CANON.strom, "Bodenlichtfarbe", "Ground-light color");
  mustClose(
    numberSlot(shader, "uOpacity", true),
    LOCK_CANON.ground.opacity,
    "Bodenlicht-Deckkraft",
    "Ground-light opacity",
  );
  mustClose(
    numberSlot(shader, "uRadius", true),
    LOCK_CANON.ground.radius,
    "Bodenlicht-Radiusuniform",
    "Ground-light radius uniform",
  );
  mustClose(
    numberSlot(shader, "uFoot", true),
    LOCK_CANON.ground.foot,
    "Bodenlicht-Fußabstand",
    "Ground-light foot spacing",
  );
  mustClose(
    numberSlot(shader, "uTight", true),
    LOCK_CANON.ground.tight,
    "Bodenlicht-Enge",
    "Ground-light tightness",
  );
  expectGlassLook(shader, "Bodenlicht", "Ground light", THREE.DoubleSide);
  const radius = (ground as THREE.Mesh<THREE.CircleGeometry>).geometry?.parameters?.radius;
  if (typeof radius !== "number" || !Number.isFinite(radius)) {
    breach("Bodenlichtradius fehlt.", "Ground-light radius is missing.");
  }
  mustClose(radius, LOCK_CANON.ground.radius, "Bodenlichtradius", "Ground-light radius");
}

function auditSpokenPart(obj: THREE.Object3D, rig: LockedRig, baseline: Baseline) {
  const base = baseline.xform.get(obj);
  if (!base) breach("Lock-Basis unvollständig.", "Lock baseline is incomplete.");
  mustClose(obj.position.z, base.p[2], "Sprechteil Z driftet", "Spoken part Z drifted");
  mustClose(
    obj.rotation.x,
    base.r[0],
    "Sprechteil-Drehung driftet",
    "Spoken part rotation drifted",
  );
  mustClose(
    obj.rotation.y,
    base.r[1],
    "Sprechteil-Drehung driftet",
    "Spoken part rotation drifted",
  );
  mustClose(
    obj.rotation.z,
    base.r[2],
    "Sprechteil-Drehung driftet",
    "Spoken part rotation drifted",
  );
  if (obj === rig.lips) {
    mustClose(obj.position.x, base.p[0], "Lippen X driftet", "Lips X drifted");
    mustClose(obj.position.y, base.p[1], "Lippen Y driftet", "Lips Y drifted");
    mustWithin(obj.scale.x, base.s[0], LOCK_CANON.lipScaleX, "Lippenöffnung", "Lip opening");
    mustWithin(obj.scale.y, base.s[1], LOCK_CANON.lipScaleY, "Lippenbreite", "Lip width");
    mustWithin(obj.scale.z, base.s[2], LOCK_CANON.lipScaleZ, "Lippentiefe", "Lip depth");
    return;
  }
  if (obj === rig.jaw) {
    mustClose(obj.position.x, base.p[0], "Kiefer X driftet", "Jaw X drifted");
    mustWithin(obj.position.y, base.p[1], LOCK_CANON.jawDrop, "Kieferöffnung", "Jaw opening");
    mustClose(obj.scale.x, base.s[0], "Kieferskalierung driftet", "Jaw scale drifted");
    mustClose(obj.scale.y, base.s[1], "Kieferskalierung driftet", "Jaw scale drifted");
    mustClose(obj.scale.z, base.s[2], "Kieferskalierung driftet", "Jaw scale drifted");
    return;
  }
  mustWithin(obj.position.x, base.p[0], LOCK_CANON.gazeX, "Blick seitlich", "Gaze sideways");
  mustWithin(obj.position.y, base.p[1], LOCK_CANON.gazeY, "Blick vertikal", "Gaze vertical");
  mustClose(obj.scale.x, base.s[0], "Augenskalierung driftet", "Eye scale drifted");
  mustClose(obj.scale.y, base.s[1], "Augenskalierung driftet", "Eye scale drifted");
  mustClose(obj.scale.z, base.s[2], "Augenskalierung driftet", "Eye scale drifted");
}

function auditPresence(rig: LockedRig) {
  rig.root.traverse((obj) => {
    if (!obj.visible) {
      breach("Ein gesperrtes Teil ist ausgeblendet.", "A locked part is hidden.");
    }
    if (obj.layers && obj.layers.mask !== 1) {
      breach(
        "Ein Teil liegt auf einer anderen Sichtbarkeitsebene.",
        "A part is on another visibility layer.",
      );
    }
  });
}

function auditRootSeat(root: THREE.Object3D) {
  const parent = root.parent;
  if (!parent) return;
  if (!(parent as THREE.Scene).isScene) {
    breach(
      "Die Figur hängt nicht mehr direkt in der Szene.",
      "The figure is no longer directly in the scene.",
    );
  }
  mustClose(parent.position.x, 0, "Szenenversatz X", "Scene offset X");
  mustClose(parent.position.y, 0, "Szenenversatz Y", "Scene offset Y");
  mustClose(parent.position.z, 0, "Szenenversatz Z", "Scene offset Z");
  mustClose(parent.rotation.x, 0, "Szenendrehung X", "Scene rotation X");
  mustClose(parent.rotation.y, 0, "Szenendrehung Y", "Scene rotation Y");
  mustClose(parent.rotation.z, 0, "Szenendrehung Z", "Scene rotation Z");
  mustClose(parent.scale.x, 1, "Szenenskalierung X", "Scene scale X");
  mustClose(parent.scale.y, 1, "Szenenskalierung Y", "Scene scale Y");
  mustClose(parent.scale.z, 1, "Szenenskalierung Z", "Scene scale Z");
}

function auditSceneSeat(rig: LockedRig, scene: { children: readonly THREE.Object3D[] }) {
  for (const child of scene.children) {
    if (child !== rig.root) {
      breach("Etwas Fremdes steht im Raum.", "Something else is standing in the room.");
    }
  }
}

function auditBaseline(rig: LockedRig) {
  const baseline = baselines.get(rig.root);
  if (!baseline) {
    breach(
      "Lock-Basis fehlt. Die Figur wurde nicht versiegelt.",
      "Lock baseline is missing. The figure was not sealed.",
    );
  }
  const hinges = new Set<THREE.Object3D>([
    rig.head,
    rig.shoulderL,
    rig.shoulderR,
    rig.elbowL,
    rig.elbowR,
    rig.wristL,
    rig.wristR,
  ]);
  const fingers = new Set<THREE.Object3D>([...rig.fingersL, ...rig.fingersR]);
  const seen = new Set<THREE.Object3D>();
  rig.root.traverse((obj) => {
    seen.add(obj);
    if (!baseline.nodes.has(obj)) {
      breach(
        "Ein neues Objekt hängt an der gesperrten Figur.",
        "A new object was added to the locked figure.",
      );
    }
  });
  for (const obj of baseline.nodes) {
    if (!seen.has(obj)) breach("Ein gesperrtes Teil fehlt.", "A locked part is missing.");
    const base = baseline.xform.get(obj);
    if (!base) breach("Lock-Basis unvollständig.", "Lock baseline is incomplete.");
    if (geometryOf(obj) !== base.geometry) {
      breach("Die Geometrie wurde ersetzt.", "Geometry was replaced.");
    }
    if (obj === rig.root) auditRootSeat(obj);
    else if (obj.parent !== base.parent) {
      breach("Ein Teil wurde umgehängt.", "A part was reparented.");
    }
    if (obj === rig.chest || obj === rig.core) continue;
    if (obj === rig.lips || obj === rig.jaw || rig.eyes?.includes(obj)) {
      auditSpokenPart(obj, rig, baseline);
      continue;
    }
    mustClose(obj.position.x, base.p[0], "Position X driftet", "Position X drifted");
    mustClose(obj.position.y, base.p[1], "Position Y driftet", "Position Y drifted");
    mustClose(obj.position.z, base.p[2], "Position Z driftet", "Position Z drifted");
    mustClose(obj.scale.x, base.s[0], "Skalierung X driftet", "Scale X drifted");
    mustClose(obj.scale.y, base.s[1], "Skalierung Y driftet", "Scale Y drifted");
    mustClose(obj.scale.z, base.s[2], "Skalierung Z driftet", "Scale Z drifted");
    if (fingers.has(obj)) {
      mustClose(obj.rotation.y, base.r[1], "Fingerachse Y driftet", "Finger axis Y drifted");
      mustClose(obj.rotation.z, base.r[2], "Fingerachse Z driftet", "Finger axis Z drifted");
    } else if (!hinges.has(obj)) {
      mustClose(obj.rotation.x, base.r[0], "Drehung X driftet", "Rotation X drifted");
      mustClose(obj.rotation.y, base.r[1], "Drehung Y driftet", "Rotation Y drifted");
      mustClose(obj.rotation.z, base.r[2], "Drehung Z driftet", "Rotation Z drifted");
    }
  }
}

/** Seconds between live re-reads. The scene and the stability hour share this gate. */
export const LOCK_READ_SEC = 2;

export function assertRigLock(
  rig: LockedRig,
  phase: Phase = "live",
  scene?: { children: readonly THREE.Object3D[] },
) {
  assertLockTable();
  if (
    !rig?.root ||
    !rig.chest ||
    !rig.head ||
    !rig.shoulderR ||
    !rig.glass ||
    !rig.nerve ||
    !rig.signal
  ) {
    breach("Die Figur ist unvollständig.", "The figure is incomplete.");
  }
  auditPresence(rig);
  auditChain(rig);
  auditSkeleton(rig, phase);
  auditMaterials(rig, phase);
  if (scene) auditSceneSeat(rig, scene);
  if (phase === "live") auditBaseline(rig);
}

type VoidScene = {
  background: unknown;
  fog: unknown;
  overrideMaterial: unknown;
  environment?: unknown;
};

export function assertClearLock(
  gl: {
    toneMapping: number;
    outputColorSpace?: string;
    getClearColor: (target: THREE.Color) => THREE.Color;
    getClearAlpha: () => number;
  },
  scene: VoidScene,
) {
  assertLockTable();
  const color = new THREE.Color();
  gl.getClearColor(color);
  const actual = hexOf(color);
  if (actual !== LOCK_CANON.void) {
    breach(
      `Void ist ${actual}, erwartet ${LOCK_CANON.void}.`,
      `Void is ${actual}, expected ${LOCK_CANON.void}.`,
    );
  }
  const alpha = gl.getClearAlpha();
  if (!Number.isFinite(alpha) || Math.abs(alpha - 1) > EPS) {
    breach(
      "Der Hintergrund ist nicht mehr deckend schwarz.",
      "The background is no longer opaque black.",
    );
  }
  if (gl.toneMapping !== THREE.NoToneMapping) {
    breach(
      "Tone-Mapping färbt die gesperrte Palette um.",
      "Tone mapping recolors the locked palette.",
    );
  }
  if (gl.outputColorSpace !== undefined && gl.outputColorSpace !== THREE.SRGBColorSpace) {
    breach(
      "Der Farbraum färbt die Palette um.",
      "The color space recolors the palette.",
    );
  }
  if (scene.background) {
    breach(
      "Der Void wurde durch einen Hintergrund ersetzt.",
      "The void was replaced by a background.",
    );
  }
  if (scene.fog) {
    breach("Nebel liegt über dem Void.", "Fog covers the void.");
  }
  if (scene.overrideMaterial) {
    breach(
      "Ein Ersatzmaterial überdeckt die Figur.",
      "An override material covers the figure.",
    );
  }
  if (scene.environment) {
    breach(
      "Eine Umgebungskarte liegt über dem Void.",
      "An environment map covers the void.",
    );
  }
}

export function assertFrontalCamera(camera: {
  fov?: number;
  position: { x: number };
  rotation: { y?: number; z: number };
  up?: { x: number; y: number; z: number };
}) {
  if (camera.fov !== undefined) {
    if (!Number.isFinite(camera.fov) || Math.abs(camera.fov - LOCK_CANON.fov) > 1e-3) {
      breach(
        `Kamera-FOV ist ${camera.fov}, erwartet ${LOCK_CANON.fov}.`,
        `Camera FOV is ${camera.fov}, expected ${LOCK_CANON.fov}.`,
      );
    }
  }
  if (!Number.isFinite(camera.position.x) || Math.abs(camera.position.x) > 1e-3) {
    breach("Kamera ist nicht frontal.", "Camera is not straight-on.");
  }
  if (camera.rotation.y !== undefined) {
    if (!Number.isFinite(camera.rotation.y) || Math.abs(camera.rotation.y) > 1e-2) {
      breach("Kamera blickt seitlich.", "Camera is yawed off the figure.");
    }
  }
  if (!Number.isFinite(camera.rotation.z) || Math.abs(camera.rotation.z) > 1e-2) {
    breach("Kamera ist gerollt.", "Camera is rolled.");
  }
  if (camera.up) {
    if (
      !Number.isFinite(camera.up.x) ||
      !Number.isFinite(camera.up.y) ||
      !Number.isFinite(camera.up.z) ||
      Math.abs(camera.up.x) > 1e-2 ||
      camera.up.y < 0.5 ||
      Math.abs(camera.up.z) > 1e-2
    ) {
      breach("Kamera steht auf dem Kopf.", "Camera is upside down.");
    }
  }
}

assertLockTable();
