import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
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
});
