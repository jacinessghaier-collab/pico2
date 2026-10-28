import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import type { BufferGeometry, Mesh, Object3D } from "three";
import { calfRimAlpha, createKushim, type Rig } from "@/kushim/anatomy";
import { LOCK } from "@/kushim/lock";

before(() => {
  if (typeof document !== "undefined") return;
  const canvas = () => ({ width: 128, height: 128, getContext: () => null });
  Object.assign(globalThis, {
    document: { createElement: (tag: string) => (tag === "canvas" ? canvas() : {}) },
  });
});

/** Widest torso ring at the shoulder. Same lathe the shell uses, times SHELL_SX. */
const SHOULDER_LINE = 0.25452;

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

  it("splits the calf into two posterior heads without a frontal spindle", () => {
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    assert.equal(hips.length, 2);
    for (const hip of hips) {
      const kneeJoint = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!kneeJoint) throw new Error("knee missing");
      const geo = tubeOn(kneeJoint);
      let maxX = -Infinity;
      let minX = Infinity;
      let cleft = Infinity;
      let head = Infinity;
      let belly = 0;
      scan(geo, (x, y, z) => {
        const t = (0.14 - y) / (0.14 + LOCK.proportions.shin);
        if (t < 0.46 || t > 0.6) return;
        belly += 1;
        maxX = Math.max(maxX, x);
        minX = Math.min(minX, x);
        if (Math.abs(x) < 0.012) cleft = Math.min(cleft, z);
        if (x > 0.028) head = Math.min(head, z);
      });
      assert.ok(belly > 20);
      const width = maxX - minX;
      // Same x scale as #29. The finer calf ring lands on the lateral peak.
      assert.ok(width < 0.136, `frontal width ${width} is still the spindle`);
      assert.ok(width > 0.09, `frontal width ${width} collapsed`);
      assert.ok(head < -0.1, `posterior belly ${head} flattened`);
      assert.ok(cleft > head + 0.012, `cleft ${cleft} does not sit in front of the head ${head}`);
    }
  });

  it("cuts a narrow sulcus between the gastrocnemius heads", () => {
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    for (const hip of hips) {
      const kneeJoint = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!kneeJoint) throw new Error("knee missing");
      const geo = tubeOn(kneeJoint);
      let floorFront = -Infinity;
      let floorBack = Infinity;
      let plateau = Infinity;
      let samples = 0;
      scan(geo, (x, y, z) => {
        const t = (0.14 - y) / (0.14 + LOCK.proportions.shin);
        if (t < 0.52 || t > 0.58 || z >= 0) return;
        samples += 1;
        if (Math.abs(x) < 0.004) {
          floorFront = Math.max(floorFront, z);
          floorBack = Math.min(floorBack, z);
        }
        // Inner slope of each head. A wide valley lifts this station forward.
        if (Math.abs(x) > 0.02 && Math.abs(x) < 0.03) plateau = Math.min(plateau, z);
      });
      assert.ok(samples > 20);
      assert.ok(floorFront < -0.02, `sulcus floor ${floorFront} reaches the tibia`);
      assert.ok(floorBack > -0.055, `sulcus floor ${floorBack} filled back in`);
      assert.ok(plateau < -0.092, `inner head ${plateau} is still the soft valley`);
      assert.ok(floorBack > plateau + 0.05, `sulcus relief ${floorBack - plateau} is too shallow`);
    }
  });

  it("draws a fresnel edge on the calf from the oblique rear and keeps the front dark", () => {
    const cam = new THREE.Vector3(0, 1.04, 8.399);
    rig.root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.userData?.lockKey !== "skull") return;
      const kante = mesh.geometry?.getAttribute?.("aKante");
      assert.ok(kante, "skull shares the glass shader and must stay unmarked");
      for (let i = 0; i < kante.count; i++) assert.equal(kante.getX(i), 0);
    });

    const sample = (yaw: number) => {
      rig.root.rotation.y = yaw;
      rig.root.updateMatrixWorld(true);
      const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
      return hips.map((hip) => {
        const side = hip.userData.lockSide as number;
        const knee = hip.children.find((child) => child.userData.lockKey === "knee");
        if (!knee) throw new Error("knee missing");
        const geo = tubeOn(knee);
        const mesh = knee.children.find((child) => (child as Mesh).geometry === geo) as Mesh;
        const pos = geo.getAttribute("position");
        const nrm = geo.getAttribute("normal");
        const kante = geo.getAttribute("aKante");
        const fade = geo.getAttribute("aFade");
        assert.ok(kante, "calf is missing the rear-rim mark");
        const ax = new THREE.Vector3(1, 0, 0).transformDirection(mesh.matrixWorld);
        const p = new THREE.Vector3();
        const n = new THREE.Vector3();
        const view = new THREE.Vector3();
        let marked = 0;
        let headRear = 0;
        let lipRear = 0;
        let headFront = 0;
        let floorRear = 0;
        let floorN = 0;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const t = (0.14 - y) / (0.14 + LOCK.proportions.shin);
          if (t < 0.42 || t > 0.7) continue;
          p.set(pos.getX(i), y, pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
          n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).transformDirection(mesh.matrixWorld);
          view.copy(cam).sub(p).normalize();
          const alpha = calfRimAlpha(n.dot(view), kante.getX(i), Math.abs(ax.dot(view)), fade.getX(i));
          const x = pos.getX(i);
          const z = pos.getZ(i);
          const pole = kante.getX(i) > 0.7 && Math.abs(nrm.getZ(i)) > 0.75;
          const lip = kante.getX(i) > 0.45 && Math.abs(x) > 0.012 && Math.abs(x) < 0.04 && z < -0.06;
          if (pole) headRear = Math.max(headRear, alpha);
          if (pole) headFront = Math.max(headFront, alpha);
          if (lip) lipRear = Math.max(lipRear, alpha);
          if (kante.getX(i) < 0.01 && Math.abs(x) < 0.004 && z < -0.02 && z > -0.07) {
            floorRear = Math.max(floorRear, alpha);
            floorN += 1;
          }
          if (kante.getX(i) > 0.5) marked += 1;
        }
        return { side, marked, headRear, lipRear, headFront, floorRear, floorN };
      });
    };

    const front = sample(0);
    for (const leg of front) {
      assert.ok(leg.marked > 30, `side ${leg.side} marked ${leg.marked}`);
      assert.ok(leg.headFront < 0.012, `front head rim ${leg.headFront} on side ${leg.side}`);
    }

    const rear = sample(-0.68);
    const far = rear.find((leg) => leg.side === -1);
    const near = rear.find((leg) => leg.side === 1);
    if (!far || !near) throw new Error("both calves required");
    assert.ok(far.headRear > 0.28, `far head edge ${far.headRear}`);
    assert.ok(far.lipRear > 0.22, `far sulcus edge ${far.lipRear}`);
    assert.ok(far.floorN > 5, `sulcus floor samples ${far.floorN}`);
    assert.ok(far.floorRear < far.lipRear * 0.45, `floor ${far.floorRear} fills the sulcus`);
    assert.ok(near.headRear > 0.12 || near.lipRear > 0.2, `near calf lost its rim`);
    rig.root.rotation.y = 0;
  });
});
