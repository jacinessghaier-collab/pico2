/**
 * Visual lock. The athletic GLB seats these joints.
 * Hourly passes may not change these values.
 * Shoulder height and arm lengths follow the A-pose mesh so the
 * existing filament chains land inside the limbs.
 */

export const LOCK = {
  void: "#02060A",
  strom: "#3AD7FF",
  kern: "#E7FBFF",
  signal: "#FF3B4E",
  /** Inner muscle and nerve mesh. The glass shell stays strom. */
  filament: "#D4F04A",
  filamentKern: "#F7FFC2",
  proportions: {
    hipY: 0.88,
    chestY: 1.22,
    shoulderX: 0.2,
    /** World shoulder y = chestY + this = 1.38, the mesh deltoid. */
    shoulderLocalY: 0.16,
    /** With foreArm, the chain ends at the mesh wrist (0.41 m). */
    upperArm: 0.23,
    foreArm: 0.18,
    /** Stance angles outward; hip rotation carries these lengths into the leg. */
    thigh: 0.42,
    shin: 0.38,
    headRadius: 0.105,
    /** World head origin 1.57, the mesh skull center. */
    headLocalY: 0.35,
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
