/** Visual lock. Runtime freeze. saft is the Zielbild green; signal stays the one red shoulder. */

export const LOCK = {
  void: "#000000",
  strom: "#3AD7FF",
  kern: "#E7FBFF",
  /** Yellow-green of the glass figure: filaments, chest beam, ground. */
  saft: "#B6E24A",
  /** Brighter yellow tip on that green. */
  saftKern: "#E4F98A",
  signal: "#FF3B4E",
  proportions: {
    hipY: 0.96,
    chestY: 1.22,
    shoulderX: 0.2,
    shoulderLocalY: 0.28,
    upperArm: 0.44,
    foreArm: 0.35,
    thigh: 0.5,
    shin: 0.44,
    headRadius: 0.1,
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
