/** Visual lock. Hourly passes may not change these values. */

export const LOCK = {
  void: "#02060A",
  strom: "#3AD7FF",
  kern: "#E7FBFF",
  signal: "#FF3B4E",
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
