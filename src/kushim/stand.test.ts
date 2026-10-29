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
  it("closes stage 10 after refusing the scouting rebuild", () => {
    assert.equal(STEPS.length, 10);
    assert.equal(STEPS.at(-1)?.id, 10);
    assert.equal(STEPS.at(-1)?.title, "Stabilitätscheck");
    assert.equal(DONE_STEP, 10);
    assert.equal(NEXT_STEP, 10);
    assert.equal(HOURLY_DONE, 10);
    assert.equal(HOURLY_NEXT, 10);
    assert.equal(NEXT_RUN_LABEL, "—");
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
    const skip = CHANGES.find((item) => item.id === "scout-skip");
    assert.ok(skip);
    assert.equal(skip.time, "18:40");
    assert.equal(skip.step, 10);
    assert.equal(skip.title, "Scouting verworfen");
    assert.match(skip.body, /Weg A/);
    assert.match(skip.body, /Weg B/);
    assert.match(skip.body, /Weg C/);
    assert.match(skip.body, /00-ZIEL/);
    assert.match(skip.body, /01-VORLAGE/);
    assert.match(skip.body, /symmetrisch/);
    assert.match(skip.body, /MakeHuman/);
    assert.match(skip.body, /kein Bloom/);
    assert.match(skip.body, /kein Anny/);
    assert.match(skip.body, /kein MPFB2/);
    assert.match(skip.body, /kein GLB/);
    assert.match(skip.body, /#38/);
    assert.match(skip.body, /lock.ts bleibt/);
    assert.match(skip.body, /Kein zweites Rig/);
    assert.match(skip.body, /FIRST_PAUSE_MS bleibt 320/);
    assert.match(skip.body, /Satzmelodie bleibt ausgesetzt/);
    assert.match(skip.body, /Jacin entscheidet/);
    assert.equal(/Eine elfte Stufe gibt es nicht/.test(skip.body), false);
  });
});
