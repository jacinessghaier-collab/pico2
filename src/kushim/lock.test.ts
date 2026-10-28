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
