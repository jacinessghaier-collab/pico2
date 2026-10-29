import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import type { BufferGeometry, Mesh, Object3D } from "three";
import { createKushim, type Rig } from "@/kushim/anatomy";
import { LOCK } from "@/kushim/lock";

before(() => {
  if (typeof document !== "undefined") return;
  const canvas = () => ({ width: 128, height: 128, getContext: () => null });
  Object.assign(globalThis, {
    document: { createElement: (tag: string) => (tag === "canvas" ? canvas() : {}) },
  });
});

/** Widest torso ring at the shoulder. Same lathe the shell uses, times SHELL_SX. */
const SHOULDER_LINE = 0.2205;

function tubeOn(parent: Object3D) {
  let best: Mesh | null = null;
  let span = 0.3;
  for (const child of parent.children) {
    const mesh = child as Mesh;
    if (!mesh.isMesh) continue;
    const pos = mesh.geometry?.getAttribute?.("position");
    if (!pos || mesh.geometry.getAttribute("aRank")) continue;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxY - minY > span) {
      best = mesh;
      span = maxY - minY;
    }
  }
  if (!best) throw new Error("limb tube missing");
  return best.geometry;
}

function meshByKey(root: THREE.Object3D, key: string) {
  const found: Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.userData?.lockKey === key) found.push(mesh);
  });
  const mesh = found[0];
  if (!mesh) throw new Error(`${key} missing`);
  return mesh;
}

function scan(geo: BufferGeometry, each: (x: number, y: number, z: number) => void) {
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) each(pos.getX(i), pos.getY(i), pos.getZ(i));
}

describe("lathe shell", () => {
  let rig: Rig;
  before(() => {
    rig = createKushim();
  });

  it("keeps the upper-arm outer line on or inside the shoulder", () => {
    for (const shoulder of [rig.shoulderL, rig.shoulderR]) {
      const geo = tubeOn(shoulder);
      let outer = 0;
      let samples = 0;
      scan(geo, (x) => {
        outer = Math.max(outer, Math.abs(shoulder.position.x + x));
        samples += 1;
      });
      assert.ok(samples > 100);
      assert.ok(outer <= SHOULDER_LINE + 1e-3, `outer ${outer} past ${SHOULDER_LINE}`);
      assert.ok(outer >= SHOULDER_LINE - 0.012, `outer ${outer} never reaches the shoulder line`);
    }
  });

  it("mirrors the glass body across the sagittal plane", () => {
    rig.root.rotation.set(0, 0, 0);
    rig.root.position.set(0, 0, 0);
    rig.root.scale.set(1, 1, 1);
    rig.root.updateMatrixWorld(true);
    const cell = 0.004;
    const bins = new Map<string, Array<[number, number, number]>>();
    const key = (x: number, y: number, z: number) =>
      `${Math.round(x / cell)}:${Math.round(y / cell)}:${Math.round(z / cell)}`;
    const points: Array<[number, number, number]> = [];
    const v = new THREE.Vector3();
    rig.root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || mesh.material !== rig.glass) return;
      const pos = mesh.geometry.getAttribute("position");
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
        const p: [number, number, number] = [v.x, v.y, v.z];
        points.push(p);
        const k = key(p[0], p[1], p[2]);
        const list = bins.get(k);
        if (list) list.push(p);
        else bins.set(k, [p]);
      }
    });
    assert.ok(points.length > 4000, `glass samples ${points.length}`);
    let worst = 0;
    let misses = 0;
    for (const [x, y, z] of points) {
      const mx = -x;
      let best = Infinity;
      for (let ix = -1; ix <= 1; ix++) {
        for (let iy = -1; iy <= 1; iy++) {
          for (let iz = -1; iz <= 1; iz++) {
            const list = bins.get(key(mx + ix * cell, y + iy * cell, z + iz * cell));
            if (!list) continue;
            for (const q of list) {
              const d = Math.hypot(q[0] - mx, q[1] - y, q[2] - z);
              if (d < best) best = d;
            }
          }
        }
      }
      if (best > worst) worst = best;
      if (best > 0.002) misses += 1;
    }
    assert.equal(misses, 0, `${misses} glass vertices lack a mirror, worst gap ${worst}`);
  });

  it("tapers a smooth calf into the ankle", () => {
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    assert.equal(hips.length, 2);
    for (const hip of hips) {
      const kneeJoint = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!kneeJoint) throw new Error("knee missing");
      const geo = tubeOn(kneeJoint);
      let belly = 0;
      let ankle = 0;
      let posterior = 0;
      let samples = 0;
      let reach = 0;
      scan(geo, (x, y, z) => {
        const t = (0.14 - y) / (0.14 + LOCK.proportions.shin);
        const ax = Math.abs(x);
        reach = Math.max(reach, ax);
        if (t >= 0.34 && t <= 0.5) {
          belly = Math.max(belly, ax);
          posterior = Math.min(posterior, z);
          samples += 1;
        }
        if (t >= 0.9) ankle = Math.max(ankle, ax);
      });
      assert.ok(samples > 20);
      assert.ok(belly > 0.045 && belly < 0.08, `belly half-width ${belly}`);
      assert.ok(ankle > 0.02 && ankle < belly * 0.75, `ankle ${ankle} vs belly ${belly}`);
      assert.ok(posterior < -0.055, `posterior belly ${posterior} is flat`);
      assert.ok(reach < 0.085, `lateral reach ${reach} is a fin`);
    }
  });

  it("keeps a faceless smooth skull on the body rim", () => {
    const skull = meshByKey(rig.root, "skull");
    const kante = skull.geometry.getAttribute("aKante");
    const band = skull.geometry.getAttribute("aBand");
    assert.ok(kante && band);
    for (let i = 0; i < kante.count; i++) {
      assert.equal(kante.getX(i), 0);
      assert.equal(band.getX(i), 1, "skull shares the even body rim");
    }
    const pos = skull.geometry.getAttribute("position");
    const radius = LOCK.proportions.headRadius;
    let worst = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const e = Math.hypot(x / radius, y / radius, z / radius);
      worst = Math.max(worst, Math.abs(e - 1));
    }
    assert.ok(worst < 1e-4, `skull left the smooth sphere by ${worst}`);
  });

  it("keeps the shoulder inside two head-widths and the neck narrow", () => {
    const torso = rig.chest.children.find((child) => (child as Mesh).userData?.lockKey === "torso") as Mesh;
    const pos = torso.geometry.getAttribute("position");
    let shoulder = 0;
    let neck = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i) * torso.scale.x);
      const y = pos.getY(i);
      if (y > 0.26 && y < 0.3) shoulder = Math.max(shoulder, x);
      if (y > 0.42 && y < 0.46) neck = Math.max(neck, x);
    }
    assert.ok(shoulder > 0.18 && shoulder < 0.24, `acromion ${shoulder} is a shroud or a spike`);
    assert.ok(neck < 0.075 && neck < shoulder * 0.4, `neck ${neck} under shoulder ${shoulder}`);
  });

  it("stands between seven and a half and eight heads", () => {
    rig.root.updateMatrixWorld(true);
    const skull = meshByKey(rig.root, "skull");
    skull.updateWorldMatrix(true, false);
    const pos = skull.geometry.getAttribute("position");
    const v = new THREE.Vector3();
    let crown = -Infinity;
    let chin = Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(skull.matrixWorld);
      crown = Math.max(crown, v.y);
      chin = Math.min(chin, v.y);
    }
    let sole = Infinity;
    rig.root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || mesh.material !== rig.glass) return;
      const attr = mesh.geometry.getAttribute("position");
      if (!attr) return;
      for (let i = 0; i < attr.count; i++) {
        v.fromBufferAttribute(attr as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
        sole = Math.min(sole, v.y);
      }
    });
    const heads = (crown - sole) / (crown - chin);
    assert.ok(heads >= 7.5 && heads <= 8, `figure is ${heads.toFixed(2)} heads tall`);
  });

  it("gives the hand about three quarters of a head and fades the pelvis hem", () => {
    rig.root.updateMatrixWorld(true);
    const skull = meshByKey(rig.root, "skull");
    const spos = skull.geometry.getAttribute("position");
    const sv = new THREE.Vector3();
    let crown = -Infinity;
    let chin = Infinity;
    for (let i = 0; i < spos.count; i++) {
      sv.fromBufferAttribute(spos as THREE.BufferAttribute, i).applyMatrix4(skull.matrixWorld);
      crown = Math.max(crown, sv.y);
      chin = Math.min(chin, sv.y);
    }
    const head = crown - chin;
    let reach = 0;
    for (const wrist of [rig.wristL, rig.wristR]) {
      wrist.updateWorldMatrix(true, true);
      const origin = new THREE.Vector3();
      wrist.getWorldPosition(origin);
      wrist.traverse((obj) => {
        const mesh = obj as Mesh;
        if (!mesh.isMesh || mesh.material !== rig.glass) return;
        const pos = mesh.geometry.getAttribute("position");
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
          reach = Math.max(reach, origin.y - v.y);
        }
      });
    }
    assert.ok(reach > head * 0.7 && reach < head * 0.95, `hand length ${reach} vs head ${head}`);

    const torso = meshByKey(rig.root, "torso");
    const fade = torso.geometry.getAttribute("aFade");
    const pos = torso.geometry.getAttribute("position");
    let hem = 0;
    let hemFade = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > -0.42) continue;
      hem += 1;
      hemFade = Math.max(hemFade, fade.getX(i));
    }
    assert.ok(hem > 10);
    assert.ok(hemFade < 0.05, `pelvis hem still draws, fade ${hemFade}`);
  });
});
