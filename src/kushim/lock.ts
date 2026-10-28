/**
 * Visual lock for the glass figure.
 * Void, cyan rim (strom/kern), yellow-green filaments (ader), one green
 * accent on the figure's right shoulder. Hourly passes may not drift these.
 */

export const LOCK = {
  void: "#02060A",
  strom: "#3AD7FF",
  kern: "#E7FBFF",
  ader: "#C8EE3C",
  aderKern: "#F6FFC8",
  signal: "#6DFF78",
  signalKern: "#E4FFE8",
  signalGlanz: "#F3FFF6",
  proportions: {
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
  },
} as const;

export const GESTURES = [
  "idle",
  "listen",
  "think",
  "speak",
  "explain",
  "acknowledge",
  "empathize",
] as const;

export type Gesture = (typeof GESTURES)[number];

export function isGesture(value: string): value is Gesture {
  return (GESTURES as readonly string[]).includes(value);
}

/** Values above are the masterprompt. Mutation throws; lock-check compares the figure to them. */
function freezeLockTree(value: object) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child))
      freezeLockTree(child);
  }
}

freezeLockTree(LOCK);
