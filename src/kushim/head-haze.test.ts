import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { createKushim } from "@/kushim/anatomy";
import { LOCK } from "@/kushim/lock";

before(() => {
  if (typeof document !== "undefined") return;
  const canvas = () => ({ width: 128, height: 128, getContext: () => null });
  Object.assign(globalThis, {
    document: { createElement: (tag: string) => (tag === "canvas" ? canvas() : {}) },
  });
});

function under(obj: THREE.Object3D, parent: THREE.Object3D) {
  let cursor: THREE.Object3D | null = obj;
  while (cursor) {
    if (cursor === parent) return true;
    cursor = cursor.parent;
  }
  return false;
}

describe("head haze", () => {
  it("fills the skull with short discs and leaves body filaments as lines", () => {
    const rig = createKushim();
    const radius = LOCK.proportions.headRadius;
    const sx = radius;
    const sy = radius * 1.16;
    const sz = radius * 1.02;
    let discs = 0;
    let horizontal = 0;
    let maxLen = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    let headRibbon = 0;

    rig.root.traverse((obj) => {
      const geo = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (!geo) return;
      const haze = geo.getAttribute("aHaze") as THREE.BufferAttribute | undefined;
      if (!haze) return;
      const pos = geo.getAttribute("position") as THREE.BufferAttribute;
      const inHead = under(obj, rig.head);
      if (!inHead) {
        for (let i = 0; i < haze.count; i++) {
          assert.equal(haze.getX(i), 0, "body filament was turned into haze");
        }
        return;
      }
      headRibbon += 1;
      for (let i = 0; i < pos.count; i += 6) {
        assert.equal(haze.getX(i), 1);
        const ax = pos.getX(i);
        const ay = pos.getY(i);
        const az = pos.getZ(i);
        const bx = pos.getX(i + 2);
        const by = pos.getY(i + 2);
        const bz = pos.getZ(i + 2);
        const len = Math.hypot(bx - ax, by - ay, bz - az);
        discs += 1;
        maxLen = Math.max(maxLen, len);
        minY = Math.min(minY, ay, by);
        maxY = Math.max(maxY, ay, by);
        if (Math.abs(by - ay) / len < 0.22) horizontal += 1;
        for (const [x, y, z] of [
          [ax, ay, az],
          [bx, by, bz],
        ] as const) {
          const e = (x * x) / (sx * sx) + (y * y) / (sy * sy) + (z * z) / (sz * sz);
          assert.ok(e < 0.96, `haze left the skull (${e.toFixed(3)})`);
        }
      }
    });

    assert.equal(headRibbon, 1);
    assert.ok(discs >= 40, `expected a volume, got ${discs} discs`);
    assert.ok(
      horizontal / discs < 0.42,
      `haze is still a row of bars (${horizontal}/${discs})`,
    );
    assert.ok(maxLen < radius * 1.35, `a bar is long enough to stripe (${maxLen})`);
    assert.ok(maxY - minY > sy * 1.15, "haze does not reach from chin to crown");
    assert.match(rig.nerve.fragmentShader, /bead \* \(1\.0 - vHaze\)/);
    assert.match(rig.nerve.fragmentShader, /mix\(lineAlpha, hazeAlpha, vHaze\)/);
    rig.dispose();
  });
});
