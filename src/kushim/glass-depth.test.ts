import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import type { BufferGeometry, Mesh, Object3D } from "three";
import { GLASS_TRANSMIT, createKushim, transmissionAlpha, type Rig } from "@/kushim/anatomy";
import { LOCK } from "@/kushim/lock";

before(() => {
  if (typeof document !== "undefined") return;
  const canvas = () => ({ width: 128, height: 128, getContext: () => null });
  Object.assign(globalThis, {
    document: { createElement: (tag: string) => (tag === "canvas" ? canvas() : {}) },
  });
});

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

function everyTransmit(geo: BufferGeometry, expected: number) {
  const attr = geo.getAttribute("aTransmit");
  assert.ok(attr, "transmission mask missing");
  for (let i = 0; i < attr.count; i++) {
    assert.equal(attr.getX(i), expected);
  }
}

describe("glass transmission", () => {
  let rig: Rig;
  before(() => {
    rig = createKushim();
  });

  it("keeps the locked Fresnel lobe and adds depth only past that lobe", () => {
    const fragment = rig.glass.fragmentShader;
    assert.match(fragment, /float open = mix\(calfOpen, bodyOpen, band \* \(1\.0 - k\)\);/);
    assert.match(fragment, /fres \* uRim \* uBoost \+ uFill \* uBoost \+ depth/);
    assert.match(fragment, /max\(0\.0, farFres - fres\)/);
    assert.equal(rig.glass.blending, THREE.AdditiveBlending);
    const keys = Object.keys(rig.glass.uniforms).sort().join(",");
    assert.equal(
      keys,
      "uBoost,uColor,uCore,uFill,uRim,uRimPower,uSpine,uSpineTight,uStar,uStarTight",
    );
  });

  it("marks the glass volumes and leaves the calf and the joint bridges dark", () => {
    rig.root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.userData?.lockKey === "torso") everyTransmit(mesh.geometry, 1);
      if (mesh.userData?.lockKey === "skull") everyTransmit(mesh.geometry, 1);
    });
    const hips = rig.root.children.filter((child) => child.userData.lockKey === "hip");
    assert.equal(hips.length, 2);
    for (const hip of hips) {
      everyTransmit(tubeOn(hip), 1);
      const knee = hip.children.find((child) => child.userData.lockKey === "knee");
      if (!knee) throw new Error("knee missing");
      everyTransmit(tubeOn(knee), 0);
      for (const child of knee.children) {
        const mesh = child as Mesh;
        if (!mesh.isMesh || mesh.geometry.getAttribute("aRank")) continue;
        const pos = mesh.geometry.getAttribute("position");
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < pos.count; i++) {
          minY = Math.min(minY, pos.getY(i));
          maxY = Math.max(maxY, pos.getY(i));
        }
        if (maxY - minY < LOCK.proportions.shin * 0.5) everyTransmit(mesh.geometry, 0);
      }
    }
  });

  it("adds no hull at the facing center, the rim peak, or the calf mark", () => {
    const open = 2.85;
    assert.equal(transmissionAlpha(0, open, 0, 1, true), 0);
    assert.equal(transmissionAlpha(0, open, 0, 1, false), 0);
    assert.equal(transmissionAlpha(1, open, 0, 1, true), 0);
    assert.equal(transmissionAlpha(1, open, 0, 1, false), 0);
    assert.equal(transmissionAlpha(0.4, open, 1, 1, true), 0);
    assert.equal(transmissionAlpha(0.4, open, 1, 1, false), 0);
    assert.equal(transmissionAlpha(0.4, open, 0, 0, true), 0);
    assert.equal(transmissionAlpha(0.4, 4.2, 0, 0, false), 0);
    const near = transmissionAlpha(GLASS_TRANSMIT.wallMid, open, 0, 1, true);
    const far = transmissionAlpha(0.45, open, 0, 1, false);
    assert.ok(near > 0.05, `near wall ${near} is invisible`);
    assert.ok(far > 0.04, `far wall ${far} is invisible`);
    assert.ok(near < GLASS_TRANSMIT.cap);
    assert.ok(far < GLASS_TRANSMIT.cap);
    assert.ok(near < LOCK.glass.rim * 0.5, `near wall ${near} covers the rim`);
  });
});
