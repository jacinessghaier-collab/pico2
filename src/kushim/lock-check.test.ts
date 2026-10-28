import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { createKushim } from "@/kushim/anatomy";
import { GESTURES, LOCK, type Gesture } from "@/kushim/lock";
import {
  LOCK_CANON,
  LockBreach,
  assertClearLock,
  assertFrontalCamera,
  assertRigLock,
} from "@/kushim/lock-check";
import { tickKushim, type Pose } from "@/kushim/motion";

before(() => {
  if (typeof document !== "undefined") return;
  const canvas = () => ({ width: 128, height: 128, getContext: () => null });
  Object.assign(globalThis, {
    document: { createElement: (tag: string) => (tag === "canvas" ? canvas() : {}) },
  });
});

function pose(patch: Partial<Pose> = {}): Pose {
  return {
    gesture: "idle",
    speaking: false,
    hour: 0,
    reducedMotion: false,
    shoulderTopic: false,
    attention: 0,
    typing: false,
    ...patch,
  };
}

function frame(aspect: number) {
  const cam = new THREE.PerspectiveCamera(26, aspect, 0.08, 40);
  const fov = 26;
  const vertical = (fov * Math.PI) / 180;
  const distV = (1.12 / Math.tan(vertical / 2)) * 1.08;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const distH = (0.72 / Math.tan(horizontal / 2)) * 1.18;
  const center = 0.92;
  cam.position.set(0, center + 0.08, Math.max(distV, distH));
  cam.lookAt(0, center, 0);
  return cam;
}

describe("appearance lock table", () => {
  it("matches the masterprompt palette and proportions", () => {
    assert.equal(LOCK.void, "#02060A");
    assert.equal(LOCK.strom, "#3AD7FF");
    assert.equal(LOCK.kern, "#E7FBFF");
    assert.equal(LOCK.signal, "#FF3B4E");
    assert.equal(LOCK_CANON.void, "#02060A");
    assert.equal(LOCK_CANON.strom, "#3AD7FF");
    assert.equal(LOCK_CANON.kern, "#E7FBFF");
    assert.equal(LOCK_CANON.signal, "#FF3B4E");
    assert.equal(LOCK_CANON.filamentMin, 0.86);
    assert.equal(LOCK_CANON.filamentMax, 1);
    assert.equal(LOCK_CANON.hipX, 0.11);
    assert.deepEqual(LOCK_CANON.torsoScale, [1.05, 1, 0.72]);
    assert.deepEqual(LOCK_CANON.skullScale, [1, 1.16, 1.02]);
    assert.equal(LOCK.proportions.hipY, 0.96);
    assert.equal(LOCK.proportions.chestY, 1.22);
    assert.equal(LOCK.proportions.shoulderX, 0.2);
    assert.equal(LOCK.proportions.shoulderLocalY, 0.28);
    assert.equal(LOCK.proportions.upperArm, 0.4);
    assert.equal(LOCK.proportions.foreArm, 0.31);
    assert.equal(LOCK.proportions.thigh, 0.46);
    assert.equal(LOCK.proportions.shin, 0.4);
    assert.equal(LOCK.proportions.headRadius, 0.105);
    assert.equal(LOCK.proportions.headLocalY, 0.44);
  });

  it("throws if a locked value is mutated", () => {
    assert.throws(() => {
      (LOCK as { strom: string }).strom = "#000000";
    }, TypeError);
    assert.throws(() => {
      (LOCK.proportions as { headRadius: number }).headRadius = 1;
    }, TypeError);
    assert.equal(LOCK.strom, "#3AD7FF");
    assert.equal(LOCK.proportions.headRadius, 0.105);
  });
});

describe("figure lock", () => {
  it("seals the rest pose and keeps the signal on the figure's right", () => {
    const rig = createKushim();
    try {
      assert.doesNotThrow(() => assertRigLock(rig, "build"));
      assert.doesNotThrow(() => assertRigLock(rig, "live"));
      assert.ok(rig.shoulderR.position.x < 0);
      assert.equal(rig.shoulderR.position.x, -0.2);
      assert.equal(rig.shoulderL.position.x, 0.2);
      assert.equal(rig.core.parent, rig.shoulderR);
      assert.equal(rig.ring.parent, rig.shoulderR);
      assert.throws(() => {
        rig.glass.uniforms.uColor.value = new THREE.Color("#ffffff");
      }, TypeError);
      assert.throws(() => {
        (rig.glass.uniforms.uColor.value as THREE.Color).set("#ffffff");
      }, TypeError);
    } finally {
      rig.dispose();
    }
  });

  it("stays quiet through gesture, breath, filament, and the shoulder pulse", () => {
    const rig = createKushim();
    try {
      const gestures = GESTURES as readonly Gesture[];
      for (const gesture of gestures) {
        for (const hour of [0, 8]) {
          for (const reducedMotion of [false, true]) {
            for (const shoulderTopic of [false, true]) {
              for (let step = 0; step < 6; step++) {
                tickKushim(
                  rig,
                  pose({
                    gesture,
                    speaking: gesture === "speak",
                    hour,
                    reducedMotion,
                    shoulderTopic,
                    attention: 1,
                    typing: true,
                  }),
                  0.05,
                  step * 0.41 + (hour === 8 ? 1000 : 0),
                );
                assertRigLock(rig, "live");
              }
            }
          }
        }
      }
      assert.throws(() => assertRigLock(rig, "build"), LockBreach);
    } finally {
      rig.dispose();
    }
  });

  it("fails when the signal, silhouette, or filament leaves the lock", () => {
    const rig = createKushim();
    try {
      rig.shoulderL.add(rig.core);
      assert.throws(() => assertRigLock(rig, "live"), LockBreach);
      rig.shoulderR.add(rig.core);

      rig.nerve.uniforms.uDensity.value = 0.859;
      assert.throws(() => assertRigLock(rig, "live"), LockBreach);
      rig.nerve.uniforms.uDensity.value = 0.86;
      assert.doesNotThrow(() => assertRigLock(rig, "live"));
      rig.nerve.uniforms.uDensity.value = 1;
      rig.signal.uniforms.uDensity.value = 0.9;
      assert.throws(() => assertRigLock(rig, "live"), LockBreach);
      rig.signal.uniforms.uDensity.value = 1;

      rig.chest.position.y = 1.22 + 0.2;
      assert.throws(() => assertRigLock(rig, "live"), LockBreach);
      rig.chest.position.y = 1.22;

      rig.head.position.x = Number.NaN;
      assert.throws(() => assertRigLock(rig, "live"), LockBreach);
      rig.head.position.x = 0;

      const skull = rig.head.children.find((child) => child.userData.lockKey === "skull");
      assert.ok(skull);
      skull.scale.set(2, 2, 2);
      assert.throws(() => assertRigLock(rig, "live"), LockBreach);
      skull.scale.set(1, 1.16, 1.02);

      const extra = new THREE.Mesh(
        new THREE.SphereGeometry(0.2),
        new THREE.MeshBasicMaterial({ color: "#ff0000" }),
      );
      rig.root.add(extra);
      assert.throws(() => assertRigLock(rig, "live"), LockBreach);
      rig.root.remove(extra);
      extra.geometry.dispose();
      (extra.material as THREE.Material).dispose();
    } finally {
      rig.dispose();
    }
  });

  it("allows the viseme, the jaw drop, and the gaze, and rejects a stretched mouth", () => {
    const rig = createKushim();
    try {
      rig.lips.scale.set(1.55, 0.72, 1.28);
      rig.jaw.position.y -= 0.008;
      rig.eyes[0].position.x += 0.006;
      rig.eyes[0].position.y -= 0.004;
      rig.eyeMat.opacity = 0.15;
      assert.doesNotThrow(() => assertRigLock(rig, "live"));
      rig.lips.scale.set(3, 1, 1);
      assert.throws(() => assertRigLock(rig, "live"), LockBreach);
      rig.lips.scale.set(1, 1, 1);
      rig.jaw.position.y -= 0.2;
      assert.throws(() => assertRigLock(rig, "live"), LockBreach);
    } finally {
      rig.dispose();
    }
  });
});

describe("camera and void", () => {
  it("accepts the straight-on frame and rejects drift", () => {
    assert.doesNotThrow(() => assertFrontalCamera(frame(1280 / 800)));
    assert.doesNotThrow(() => assertFrontalCamera(frame(390 / 844)));
    const cam = frame(1);
    cam.position.x = 0.4;
    assert.throws(() => assertFrontalCamera(cam), LockBreach);
    cam.position.x = 0;
    cam.rotation.z = 0.2;
    assert.throws(() => assertFrontalCamera(cam), LockBreach);
    assert.throws(
      () => assertFrontalCamera({ fov: 50, position: { x: 0 }, rotation: { z: 0 } }),
      LockBreach,
    );
  });

  it("requires the opaque void and no tone mapping", () => {
    const color = new THREE.Color("#02060A");
    assert.doesNotThrow(() =>
      assertClearLock({
        toneMapping: THREE.NoToneMapping,
        getClearColor: (target) => target.copy(color),
        getClearAlpha: () => 1,
      }),
    );
    assert.throws(
      () =>
        assertClearLock({
          toneMapping: THREE.NoToneMapping,
          getClearColor: (target) => target.set("#111111"),
          getClearAlpha: () => 1,
        }),
      LockBreach,
    );
    assert.throws(
      () =>
        assertClearLock({
          toneMapping: THREE.ACESFilmicToneMapping,
          getClearColor: (target) => target.copy(color),
          getClearAlpha: () => 1,
        }),
      LockBreach,
    );
  });
});
