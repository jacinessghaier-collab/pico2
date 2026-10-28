/**
 * Frame time of the live scene. Samples the render loop's raw delta.
 * No material, no post-pass, no change to the locked figure.
 * The object returned by `note` is reused; copy it if you keep it.
 */

export const FRAME_WINDOW = 60;

/** How often the DOM line refreshes. The render loop does not wait on it. */
export const FRAME_READOUT_MS = 250;

export type FrameClock = {
  /** Last accepted frame, milliseconds. */
  lastMs: number;
  /** Mean over the sample window. This is the Bildzeit. */
  meanMs: number;
  /** 1000 / meanMs. 0 before the first accepted frame. */
  fps: number;
  /** Worst accepted frame still in the window, milliseconds. */
  peakMs: number;
  frames: number;
};

export function createFrameClock(windowSize = FRAME_WINDOW) {
  const size = Math.max(1, Math.floor(windowSize));
  const samples = new Float64Array(size);
  let count = 0;
  let cursor = 0;
  let frames = 0;
  let lastMs = 0;
  const view: FrameClock = { lastMs: 0, meanMs: 0, fps: 0, peakMs: 0, frames: 0 };

  function publish(): FrameClock {
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < count; i++) {
      const sample = samples[i] ?? 0;
      sum += sample;
      if (sample > peak) peak = sample;
    }
    const meanMs = count > 0 ? sum / count : 0;
    view.lastMs = lastMs;
    view.meanMs = meanMs;
    view.fps = meanMs > 0 ? 1000 / meanMs : 0;
    view.peakMs = peak;
    view.frames = frames;
    return view;
  }

  return {
    note(deltaSeconds: number): FrameClock {
      const ms = deltaSeconds * 1000;
      if (!Number.isFinite(ms) || ms <= 0) return publish();
      if (count < size) {
        samples[count] = ms;
        count += 1;
      } else {
        samples[cursor] = ms;
        cursor = (cursor + 1) % size;
      }
      frames += 1;
      lastMs = ms;
      return publish();
    },
    read(): FrameClock {
      return publish();
    },
    reset(): FrameClock {
      samples.fill(0);
      count = 0;
      cursor = 0;
      frames = 0;
      lastMs = 0;
      return publish();
    },
  };
}

let live = createFrameClock();

export function noteLiveFrame(deltaSeconds: number): FrameClock {
  return live.note(deltaSeconds);
}

export function readLiveFrame(): FrameClock {
  const clock = live.read();
  return {
    lastMs: clock.lastMs,
    meanMs: clock.meanMs,
    fps: clock.fps,
    peakMs: clock.peakMs,
    frames: clock.frames,
  };
}

export function resetLiveFrame(): FrameClock {
  return live.reset();
}

function oneDecimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

/** German readout. Empty until the first accepted frame. */
export function formatFrameClock(clock: FrameClock): string {
  if (clock.frames <= 0 || !(clock.meanMs > 0)) return "Bildzeit …";
  const fps = Number.isFinite(clock.fps) ? Math.round(clock.fps) : 0;
  return `${oneDecimal(clock.meanMs)} ms · ${fps} fps · Spitze ${oneDecimal(clock.peakMs)} ms`;
}
