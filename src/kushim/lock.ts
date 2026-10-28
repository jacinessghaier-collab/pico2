/** Visual lock. Hourly passes may not change these values. */

export const LOCK = {
  void: "#000000",
  strom: "#3AD7FF",
  kern: "#E7FBFF",
  signal: "#FF3B4E",
  /** Inner muscle and nerve mesh. The glass shell stays strom. */
  filament: "#D4F04A",
  filamentKern: "#F7FFC2",
  /** Shell only. Filament colors stay on the keys above. */
  glass: {
    fill: 0.004,
    rim: 0.95,
    rimPower: 4.2,
    spine: 0.08,
    spineTight: 110,
    star: 0.04,
    starTight: 160,
    sprite: 0.04,
  },
  aura: {
    opacity: 0.42,
    tight: 480,
    width: 1.3,
    height: 2.3,
    y: 0.96,
    z: 0,
  },
  ground: {
    opacity: 0.2,
    y: 0.012,
    z: 0.05,
    radius: 0.3,
    foot: 0.11,
    tight: 1.15,
  },
  proportions: {
    hipY: 1,
    chestY: 1.28,
    shoulderX: 0.21,
    shoulderLocalY: 0.28,
    upperArm: 0.42,
    foreArm: 0.33,
    thigh: 0.5,
    shin: 0.46,
    headRadius: 0.105,
    headLocalY: 0.48,
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
