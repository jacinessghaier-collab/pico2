import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BLINK, GAZE_LERP, levelFromBins, mouthTransform, scheduleVisemes, visemeForGrapheme, weightsAt } from "./lipsync.ts";

describe("visemes", () => {
  it("maps the five shapes and a closed mouth", () => {
    assert.equal(visemeForGrapheme("a"), "aa");
    assert.equal(visemeForGrapheme("e"), "ee");
    assert.equal(visemeForGrapheme("i"), "ih");
    assert.equal(visemeForGrapheme("o"), "oh");
    assert.equal(visemeForGrapheme("u"), "ou");
    assert.equal(visemeForGrapheme("m"), "sil");
    assert.equal(visemeForGrapheme("sch"), "ih");
  });

  it("schedules a frame per grapheme and samples aa in Mama", () => {
    const frames = scheduleVisemes("Mama", 400);
    assert.equal(frames.length, 4);
    assert.equal(frames[0]?.viseme, "sil");
    assert.equal(frames[1]?.viseme, "aa");
    const mid = weightsAt(frames, 150);
    assert.equal(mid.aa, 1);
    assert.equal(weightsAt(frames, 10).aa, 0);
  });

  it("opens the jaw on aa and stays shut when silent", () => {
    const shut = mouthTransform({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }, 1, 0, true);
    assert.equal(shut.jaw, 0);
    const quiet = mouthTransform({ aa: 1, ih: 0, ou: 0, ee: 0, oh: 0 }, 0, 0, true);
    const loud = mouthTransform({ aa: 1, ih: 0, ou: 0, ee: 0, oh: 0 }, 1, 0, true);
    assert.ok(loud.jaw > quiet.jaw);
    assert.ok(loud.jaw > 0.1);
    assert.ok(loud.sx > 1);
    const wide = mouthTransform({ aa: 0, ih: 0, ou: 0, ee: 1, oh: 0 }, 1, 0, true);
    assert.ok(wide.sy > loud.sy);
  });

  it("reads voice-band energy without leaving 0..1", () => {
    const bins = new Array(64).fill(0);
    assert.equal(levelFromBins(bins), 0);
    for (let i = 4; i < 30; i++) bins[i] = 255;
    const level = levelFromBins(bins);
    assert.ok(level > 0.9);
    assert.ok(level <= 1);
  });

  it("keeps gaze lerp and blink inside the locked idle window", () => {
    assert.ok(GAZE_LERP >= 0.08 && GAZE_LERP <= 0.12);
    assert.equal(BLINK.minSec, 3.6);
    assert.equal(BLINK.maxSec, 6.4);
    assert.equal(BLINK.closeSec, 0.12);
    assert.equal(BLINK.eyeGain, 0.15);
  });
});
