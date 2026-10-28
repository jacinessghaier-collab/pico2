import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GESTURES, LOCK } from "./lock.ts";

describe("visual lock", () => {
  it("keeps the locked colors, proportions and gesture names", () => {
    assert.equal(LOCK.void, "#000000");
    assert.equal(LOCK.strom, "#3AD7FF");
    assert.equal(LOCK.kern, "#E7FBFF");
    assert.equal(LOCK.saft, "#B6E24A");
    assert.equal(LOCK.saftKern, "#E4F98A");
    assert.equal(LOCK.signal, "#FF3B4E");
    assert.deepEqual(LOCK.proportions, {
      hipY: 0.96,
      chestY: 1.22,
      shoulderX: 0.2,
      shoulderLocalY: 0.28,
      upperArm: 0.44,
      foreArm: 0.35,
      thigh: 0.5,
      shin: 0.44,
      headRadius: 0.1,
      headLocalY: 0.44,
    });
    assert.deepEqual([...GESTURES], [
      "idle",
      "listen",
      "think",
      "speak",
      "explain",
      "acknowledge",
      "empathize",
    ]);
  });
});
