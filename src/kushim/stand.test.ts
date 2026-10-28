import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHANGES,
  DONE_STEP,
  HOURLY_DONE,
  HOURLY_NEXT,
  NEXT_RUN_LABEL,
  NEXT_STEP,
  STEPS,
} from "./stand.ts";

describe("stability hour markers", () => {
  it("keeps ten build stages and records the 09:00 read", () => {
    assert.equal(STEPS.length, 10);
    assert.equal(STEPS.at(-1)?.id, 10);
    assert.equal(STEPS.at(-1)?.title, "Stabilitätscheck");
    assert.equal(DONE_STEP, 9);
    assert.equal(NEXT_STEP, 10);
    assert.equal(HOURLY_DONE, 9);
    assert.equal(HOURLY_NEXT, 10);
    assert.equal(NEXT_RUN_LABEL, "10:00");
    const read = CHANGES.find((item) => item.id === "stability-read");
    assert.ok(read);
    assert.equal(read.time, "09:00");
    assert.equal(read.step, null);
    assert.equal(read.title, "Stabilitätscheck");
    assert.match(read.body, /Kein zweiter Check/);
    assert.match(read.body, /kein Post-Pass/);
    assert.match(read.body, /kein visueller Eingriff/);
    assert.match(read.body, /FIRST_PAUSE_MS bleibt 320/);
    assert.match(read.body, /Satzmelodie bleibt ausgesetzt/);
  });
});
