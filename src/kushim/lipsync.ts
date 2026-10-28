/** Procedural visemes for the locked mouth. No VRM blendshapes on this rig. */

export const GAZE_LERP = 0.1;

const gaze = { x: 0, y: 0 };

export function setGaze(x: number, y: number) {
  gaze.x = Math.max(-1, Math.min(1, x));
  gaze.y = Math.max(-1, Math.min(1, y));
}

export function readGaze() {
  return gaze;
}

export const BLINK = {
  minSec: 3.6,
  maxSec: 6.4,
  closeSec: 0.12,
  eyeGain: 0.15,
} as const;

export type Viseme = "aa" | "ih" | "ou" | "ee" | "oh";

export type VisemeWeights = Record<Viseme, number>;

export type VisemeFrame = { at: number; viseme: Viseme | "sil" };

const ZERO: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

// Lip capsule lies on X after a 90° roll, so sx is the vertical opening and sy the width.
const SHAPES: Record<Viseme, { sx: number; sy: number; sz: number; jaw: number }> = {
  aa: { sx: 1.55, sy: 1.04, sz: 1.08, jaw: 0.16 },
  ih: { sx: 1.16, sy: 1.1, sz: 1, jaw: 0.05 },
  ou: { sx: 1.12, sy: 0.72, sz: 1.28, jaw: 0.06 },
  ee: { sx: 1.06, sy: 1.38, sz: 1, jaw: 0.03 },
  oh: { sx: 1.28, sy: 0.84, sz: 1.22, jaw: 0.1 },
};

export function emptyWeights(): VisemeWeights {
  return { ...ZERO };
}

export function visemeForGrapheme(token: string): Viseme | "sil" {
  const t = token.toLowerCase();
  if (/^(sch|ch)/.test(t)) return "ih";
  if (/^[bmp]/.test(t)) return "sil";
  if (/^(ei|ai|ay)/.test(t)) return "aa";
  if (/^(eu|äu|au)/.test(t)) return "oh";
  if (/^[aä]/.test(t)) return "aa";
  if (/^e/.test(t)) return "ee";
  if (/^i/.test(t)) return "ih";
  if (/^[oö]/.test(t)) return "oh";
  if (/^[uü]/.test(t)) return "ou";
  if (/^j/.test(t)) return "ih";
  return "ih";
}

export function estimateSpeechMs(text: string, rate: number): number {
  const chars = Math.max(1, text.trim().length);
  const cps = 13 * Math.max(0.5, rate);
  return (chars / cps) * 1000;
}

export function scheduleVisemes(text: string, durationMs: number): VisemeFrame[] {
  const tokens = text.toLowerCase().match(/sch|ch|ei|ai|eu|äu|au|[a-zäöüß]/g) ?? [];
  if (tokens.length === 0 || durationMs <= 0) return [];
  const slice = durationMs / tokens.length;
  return tokens.map((token, index) => ({
    at: index * slice,
    viseme: visemeForGrapheme(token),
  }));
}

export function weightsAt(frames: VisemeFrame[], elapsedMs: number): VisemeWeights {
  const weights = emptyWeights();
  if (frames.length === 0) return weights;
  let current = frames[0];
  for (const frame of frames) {
    if (frame.at <= elapsedMs) current = frame;
    else break;
  }
  if (current.viseme === "sil") return weights;
  weights[current.viseme] = 1;
  return weights;
}

export function mouthTransform(
  weights: VisemeWeights,
  level: number,
  elapsed: number,
  reduced: boolean,
): { sx: number; sy: number; sz: number; jaw: number } {
  const sum = weights.aa + weights.ih + weights.ou + weights.ee + weights.oh;
  if (sum <= 0) return { sx: 1, sy: 1, sz: 1, jaw: 0 };
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let jaw = 0;
  (Object.keys(SHAPES) as Viseme[]).forEach((key) => {
    const share = weights[key] / sum;
    const shape = SHAPES[key];
    sx += shape.sx * share;
    sy += shape.sy * share;
    sz += shape.sz * share;
    jaw += shape.jaw * share;
  });
  const osc = reduced ? 1 : 1 + Math.sin(elapsed * 16) * 0.06 * (weights.aa / sum);
  const gain = Math.max(0.35, Math.min(1, 0.35 + 0.65 * level)) * osc;
  return {
    sx: 1 + (sx - 1) * gain,
    sy: 1 + (sy - 1) * gain,
    sz: 1 + (sz - 1) * gain,
    jaw: jaw * gain,
  };
}

/** FFT band energy → 0..1, shefixu-style voice level for the aa gain. */
export function levelFromBins(bins: ArrayLike<number>): number {
  if (bins.length === 0) return 0;
  const start = Math.min(2, bins.length);
  const end = Math.min(40, bins.length);
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += bins[i] ?? 0;
  const avg = sum / ((end - start) * 255);
  return Math.max(0, Math.min(1, avg * 1.8));
}
