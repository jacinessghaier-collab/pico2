import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GESTURES, LOCK } from "./lock.ts";

describe("visual lock", () => {
  it("keeps the locked colors, proportions and gesture names", () => {
    assert.equal(LOCK.void, "#02060A");
    assert.equal(LOCK.strom, "#3AD7FF");
    assert.equal(LOCK.kern, "#E7FBFF");
    assert.equal(LOCK.signal, "#FF3B4E");
    assert.equal(LOCK.filament, "#D4F04A");
    assert.equal(LOCK.filamentKern, "#F7FFC2");
    assert.deepEqual(LOCK.proportions, {
      hipY: 0.88,
      chestY: 1.22,
      shoulderX: 0.2,
      shoulderLocalY: 0.16,
      upperArm: 0.23,
      foreArm: 0.18,
      thigh: 0.42,
      shin: 0.38,
      headRadius: 0.105,
      headLocalY: 0.35,
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
