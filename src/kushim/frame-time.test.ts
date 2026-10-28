import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FRAME_WINDOW,
  createFrameClock,
  formatFrameClock,
  noteLiveFrame,
  readLiveFrame,
  resetLiveFrame,
} from "./frame-time.ts";

function snapshot(clock: { lastMs: number; meanMs: number; fps: number; peakMs: number; frames: number }) {
  return {
    lastMs: clock.lastMs,
    meanMs: clock.meanMs,
    fps: clock.fps,
    peakMs: clock.peakMs,
    frames: clock.frames,
  };
}

describe("frame time", () => {
  it("starts empty", () => {
    const clock = createFrameClock();
    assert.deepEqual(snapshot(clock.read()), {
      lastMs: 0,
      meanMs: 0,
      fps: 0,
      peakMs: 0,
      frames: 0,
    });
    assert.equal(formatFrameClock(clock.read()), "Bildzeit …");
  });

  it("reports one sixtieth of a second as 60 fps", () => {
    const clock = createFrameClock();
    const sample = snapshot(clock.note(1 / 60));
    assert.equal(sample.frames, 1);
    assert.ok(Math.abs(sample.fps - 60) < 1e-6);
    assert.ok(Math.abs(sample.meanMs - 1000 / 60) < 1e-9);
    assert.equal(sample.peakMs, sample.meanMs);
    assert.equal(formatFrameClock(sample), "16,7 ms · 60 fps · Spitze 16,7 ms");
  });

  it("averages the window and keeps the peak", () => {
    const clock = createFrameClock(4);
    clock.note(0.01);
    clock.note(0.02);
    const sample = snapshot(clock.note(0.04));
    assert.equal(sample.frames, 3);
    assert.equal(sample.lastMs, 40);
    assert.equal(sample.meanMs, 70 / 3);
    assert.equal(sample.peakMs, 40);
    assert.equal(Math.round(sample.fps), 43);
    assert.equal(formatFrameClock(sample), "23,3 ms · 43 fps · Spitze 40,0 ms");
  });

  it("drops the oldest sample once the window is full", () => {
    const clock = createFrameClock(3);
    clock.note(0.01);
    clock.note(0.02);
    clock.note(0.03);
    const sample = snapshot(clock.note(0.04));
    assert.equal(sample.frames, 4);
    assert.equal(sample.meanMs, 30);
    assert.equal(sample.peakMs, 40);
    assert.equal(sample.lastMs, 40);
    assert.equal(FRAME_WINDOW, 60);
  });

  it("lowers the peak after the spike slides out", () => {
    const clock = createFrameClock(2);
    clock.note(0.05);
    clock.note(0.01);
    const sample = snapshot(clock.note(0.02));
    assert.equal(sample.peakMs, 20);
    assert.equal(sample.meanMs, 15);
  });

  it("ignores non-positive and non-finite deltas", () => {
    const clock = createFrameClock();
    clock.note(1 / 30);
    clock.note(0);
    clock.note(-0.2);
    clock.note(Number.NaN);
    clock.note(Number.POSITIVE_INFINITY);
    const sample = snapshot(clock.read());
    assert.equal(sample.frames, 1);
    assert.ok(Math.abs(sample.fps - 30) < 1e-6);
    assert.equal(formatFrameClock(sample), "33,3 ms · 30 fps · Spitze 33,3 ms");
  });

  it("resets the live clock used by the scene", () => {
    resetLiveFrame();
    noteLiveFrame(1 / 60);
    assert.equal(readLiveFrame().frames, 1);
    assert.ok(Math.abs(readLiveFrame().fps - 60) < 1e-6);
    resetLiveFrame();
    assert.equal(readLiveFrame().frames, 0);
    assert.equal(formatFrameClock(readLiveFrame()), "Bildzeit …");
  });
});
