import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLINK,
  BREATH_EASE,
  breathCueAt,
  GAZE_LERP,
  JAW_DROP,
  levelFromBins,
  mouthTransform,
  scheduleVisemes,
  visemeForGrapheme,
  weightsAt,
} from "./lipsync.ts";

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
    const shut = mouthTransform({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }, 1, true);
    assert.equal(shut.jaw, 0);
    const quiet = mouthTransform({ aa: 1, ih: 0, ou: 0, ee: 0, oh: 0 }, 0, true);
    const loud = mouthTransform({ aa: 1, ih: 0, ou: 0, ee: 0, oh: 0 }, 1, true);
    assert.ok(loud.jaw > quiet.jaw);
    assert.ok(loud.jaw > 0.1);
    assert.ok(loud.sx > 1);
    const wide = mouthTransform({ aa: 0, ih: 0, ou: 0, ee: 1, oh: 0 }, 1, true);
    assert.ok(wide.sy > loud.sy);
  });

  it("eases the opening on the inhale and keeps the exhale at the level", () => {
    const aa = { aa: 1, ih: 0, ou: 0, ee: 0, oh: 0 } as const;
    const still = { exhale: 1, chest: { x: 1, y: 1, z: 1 } };
    const exhaled = mouthTransform(aa, 1, false, still);
    const inhaled = mouthTransform(aa, 1, false, { exhale: 0, chest: { x: 1, y: 1, z: 1 } });
    const reduced = mouthTransform(aa, 1, true, { exhale: 0, chest: { x: 1, y: 1, z: 1 } });
    assert.equal(exhaled.jaw, reduced.jaw);
    assert.equal(exhaled.sx, reduced.sx);
    assert.equal(inhaled.jaw, exhaled.jaw * (1 - BREATH_EASE));
    assert.ok(inhaled.sx < exhaled.sx);
    assert.ok(inhaled.jaw > 0);
    const quietIn = mouthTransform(aa, 0, false, { exhale: 0, chest: { x: 1, y: 1, z: 1 } });
    const quietOut = mouthTransform(aa, 0, false, still);
    assert.ok(quietOut.jaw > quietIn.jaw);
    assert.ok(exhaled.jaw > quietOut.jaw);
  });

  it("holds the opening delta against the chest scale", () => {
    const aa = { aa: 1, ih: 0, ou: 0, ee: 0, oh: 0 } as const;
    const plain = mouthTransform(aa, 1, false, { exhale: 1, chest: { x: 1, y: 1, z: 1 } });
    const chest = { x: 1.008, y: 1.012, z: 1.01 };
    const lifted = mouthTransform(aa, 1, false, { exhale: 1, chest });
    assert.ok(Math.abs((lifted.sx - 1) * chest.y - (plain.sx - 1)) < 1e-12);
    assert.ok(Math.abs((lifted.sy - 1) * chest.x - (plain.sy - 1)) < 1e-12);
    assert.ok(Math.abs((lifted.sz - 1) * chest.z - (plain.sz - 1)) < 1e-12);
    assert.ok(Math.abs(lifted.jaw * chest.y - plain.jaw) < 1e-12);
    const shut = mouthTransform(
      { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 },
      1,
      false,
      { exhale: 1, chest: { x: 0, y: 0, z: 0 } },
    );
    assert.deepEqual(shut, { sx: 1, sy: 1, sz: 1, jaw: 0 });
    assert.equal(JAW_DROP, 0.05);
  });

  it("keeps the chest phase on the existing rates", () => {
    const rates = [
      { speaking: false, calm: false, hz: 0.85 },
      { speaking: false, calm: true, hz: 0.55 },
      { speaking: true, calm: true, hz: 1.35 },
      { speaking: true, calm: false, hz: 1.35 },
    ];
    for (const rate of rates) {
      for (let step = 0; step < 24; step++) {
        const elapsed = step * 0.137;
        const cue = breathCueAt(elapsed, rate.speaking, rate.calm, false);
        const phase = elapsed * rate.hz * Math.PI * 2;
        assert.equal(cue.value, Math.sin(phase));
        assert.equal(cue.exhale, (1 - Math.cos(phase)) / 2);
      }
    }
    const still = breathCueAt(1.7, true, false, true);
    assert.equal(still.value, 0);
    assert.equal(still.exhale, 1);
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
