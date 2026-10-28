import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { createKushim } from "@/kushim/anatomy";
import { GESTURES, LOCK, type Gesture } from "@/kushim/lock";
import {
  LOCK_CANON,
  LOCK_READ_SEC,
  LockBreach,
  assertClearLock,
  assertFrontalCamera,
  assertRigLock,
} from "@/kushim/lock-check";
import { breathCueAt, mouthTransform, type VisemeWeights } from "@/kushim/lipsync";
import { applySpeechMouth, tickKushim, type Pose } from "@/kushim/motion";

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

function voidScene() {
  return {
    background: null as unknown,
    fog: null as unknown,
    overrideMaterial: null as unknown,
    environment: null as unknown,
  };
}

function loud(error: unknown) {
  assert.ok(error instanceof LockBreach);
  assert.match(error.message, /Lock-Bruch: .+/);
  assert.match(error.message, /Lock breach: .+/);
  assert.ok(error.de.length > 0 && error.en.length > 0);
  return true;
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

  it("keeps the comparison table frozen", () => {
    assert.ok(Object.isFrozen(LOCK_CANON));
    assert.ok(Object.isFrozen(LOCK_CANON.proportions));
    assert.ok(Object.isFrozen(LOCK_CANON.torsoScale));
    assert.throws(() => {
      (LOCK_CANON as { strom: string }).strom = "#000000";
    }, TypeError);
    assert.throws(() => {
      (LOCK_CANON.torsoScale as unknown as number[])[0] = 2;
    }, TypeError);
    assert.equal(LOCK_CANON.strom, "#3AD7FF");
    assert.equal(LOCK_CANON.torsoScale[0], 1.05);
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

  it("keeps the mouth inside the lock for a full breath while speaking", () => {
    const rig = createKushim();
    try {
      const restJawY = rig.jaw.position.y;
      const shapes: VisemeWeights[] = [
        { aa: 1, ih: 0, ou: 0, ee: 0, oh: 0 },
        { aa: 0, ih: 1, ou: 0, ee: 0, oh: 0 },
        { aa: 0, ih: 0, ou: 1, ee: 0, oh: 0 },
        { aa: 0, ih: 0, ou: 0, ee: 1, oh: 0 },
        { aa: 0, ih: 0, ou: 0, ee: 0, oh: 1 },
      ];
      for (const speaking of [false, true]) {
        for (const calm of [false, true]) {
          for (let step = 0; step < 12; step++) {
            const elapsed = (step / 12) * 2;
            tickKushim(
              rig,
              pose({
                gesture: calm ? "empathize" : speaking ? "speak" : "idle",
                speaking,
                reducedMotion: false,
              }),
              0.05,
              elapsed,
            );
            const cue = breathCueAt(elapsed, speaking, calm, false);
            assert.equal(rig.chest.scale.x, 1 + cue.value * LOCK_CANON.breathX);
            assert.equal(rig.chest.scale.y, 1 + cue.value * LOCK_CANON.breathY);
            assert.equal(rig.chest.scale.z, 1 + cue.value * LOCK_CANON.breathZ);
            assert.equal(rig.chest.position.y, LOCK.proportions.chestY + cue.value * LOCK_CANON.breathLift);
            const chest = { x: rig.chest.scale.x, y: rig.chest.scale.y, z: rig.chest.scale.z };
            for (const weights of shapes) {
              const mouth = mouthTransform(weights, 1, false, { exhale: cue.exhale, chest });
              applySpeechMouth(rig, mouth, true);
              assertRigLock(rig, "live");
              assert.ok(Math.abs(rig.lips.scale.x - 1) <= LOCK_CANON.lipScaleX);
              assert.ok(Math.abs(rig.lips.scale.y - 1) <= LOCK_CANON.lipScaleY);
              assert.ok(Math.abs(rig.lips.scale.z - 1) <= LOCK_CANON.lipScaleZ);
              assert.ok(restJawY - rig.jaw.position.y <= LOCK_CANON.jawDrop + 1e-9);
            }
          }
          const chest = { x: rig.chest.scale.x, y: rig.chest.scale.y, z: rig.chest.scale.z };
          const open = mouthTransform(shapes[0], 1, false, { exhale: 1, chest: { x: 1, y: 1, z: 1 } });
          const eased = mouthTransform(shapes[0], 1, false, { exhale: 0, chest });
          applySpeechMouth(rig, open, true);
          const openY = rig.jaw.position.y;
          applySpeechMouth(rig, eased, true);
          assert.ok(rig.jaw.position.y > openY);
          assertRigLock(rig, "live");
        }
      }
      applySpeechMouth(rig, { sx: 1, sy: 1, sz: 1, jaw: 0 }, false);
      assert.equal(rig.jaw.position.y, restJawY);
      assertRigLock(rig, "live");
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

  it("fails loud when the sealed figure is swapped, hidden, or joined by something else", () => {
    const rig = createKushim();
    const scene = new THREE.Scene();
    try {
      scene.add(rig.root);
      assert.doesNotThrow(() => assertRigLock(rig, "live", scene));

      const parent = rig.lips.parent;
      assert.ok(parent);
      rig.root.add(rig.lips);
      assert.throws(() => assertRigLock(rig, "live"), loud);
      parent.add(rig.lips);

      rig.head.visible = false;
      assert.throws(() => assertRigLock(rig, "live"), loud);
      rig.head.visible = true;

      rig.chest.layers.set(2);
      assert.throws(() => assertRigLock(rig, "live"), loud);
      rig.chest.layers.set(0);

      const skull = rig.head.children.find((child) => child.userData.lockKey === "skull") as THREE.Mesh;
      assert.ok(skull);
      const sealedGeo = skull.geometry;
      skull.geometry = new THREE.SphereGeometry(LOCK.proportions.headRadius, 8, 6);
      assert.throws(() => assertRigLock(rig, "live"), loud);
      skull.geometry.dispose();
      skull.geometry = sealedGeo;

      const fragment = rig.glass.fragmentShader;
      rig.glass.fragmentShader = `${fragment}\n`;
      assert.throws(() => assertRigLock(rig, "live"), loud);
      rig.glass.fragmentShader = fragment;
      rig.glass.uniforms.uExtra = { value: 0 };
      assert.throws(() => assertRigLock(rig, "live"), loud);
      delete rig.glass.uniforms.uExtra;

      rig.glass.premultipliedAlpha = true;
      assert.throws(() => assertRigLock(rig, "live"), loud);
      rig.glass.premultipliedAlpha = false;

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 4),
        new THREE.MeshBasicMaterial({ color: "#333333" }),
      );
      scene.add(floor);
      assert.throws(() => assertRigLock(rig, "live", scene), loud);
      scene.remove(floor);
      floor.geometry.dispose();
      floor.material.dispose();

      scene.position.x = 0.2;
      assert.throws(() => assertRigLock(rig, "live"), loud);
      scene.position.x = 0;

      const holder = new THREE.Group();
      holder.add(rig.root);
      assert.throws(() => assertRigLock(rig, "live"), loud);
      holder.remove(rig.root);

      assert.doesNotThrow(() => assertRigLock(rig, "live", scene));
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
    assert.throws(
      () => assertFrontalCamera({ fov: Number.NaN, position: { x: 0 }, rotation: { y: 0, z: 0 } }),
      loud,
    );
    const yawed = frame(1);
    yawed.rotation.y = 0.2;
    assert.throws(() => assertFrontalCamera(yawed), loud);
    yawed.rotation.y = 0;
    yawed.up.set(0, -1, 0);
    assert.throws(() => assertFrontalCamera(yawed), loud);
  });

  it("requires the opaque void and no tone mapping", () => {
    const color = new THREE.Color("#02060A");
    const gl = {
      toneMapping: THREE.NoToneMapping,
      outputColorSpace: THREE.SRGBColorSpace,
      getClearColor: (target: THREE.Color) => target.copy(color),
      getClearAlpha: () => 1,
    };
    const scene = voidScene();
    assert.doesNotThrow(() => assertClearLock(gl, scene));
    assert.throws(
      () =>
        assertClearLock(
          {
            toneMapping: THREE.NoToneMapping,
            getClearColor: (target) => target.set("#111111"),
            getClearAlpha: () => 1,
          },
          scene,
        ),
      LockBreach,
    );
    assert.throws(
      () =>
        assertClearLock(
          {
            toneMapping: THREE.ACESFilmicToneMapping,
            getClearColor: (target) => target.copy(color),
            getClearAlpha: () => 1,
          },
          scene,
        ),
      LockBreach,
    );
    assert.throws(
      () =>
        assertClearLock(
          { ...gl, getClearAlpha: () => 0 },
          scene,
        ),
      loud,
    );
    scene.background = new THREE.Color("#111111");
    assert.throws(() => assertClearLock(gl, scene), loud);
    scene.background = null;
    scene.fog = new THREE.Fog(LOCK.void, 1, 4);
    assert.throws(() => assertClearLock(gl, scene), loud);
    scene.fog = null;
    scene.overrideMaterial = new THREE.MeshBasicMaterial();
    assert.throws(() => assertClearLock(gl, scene), loud);
    scene.overrideMaterial = null;
    scene.environment = new THREE.Texture();
    assert.throws(() => assertClearLock(gl, scene), loud);
    scene.environment = null;
    assert.throws(
      () => assertClearLock({ ...gl, outputColorSpace: THREE.LinearSRGBColorSpace }, scene),
      loud,
    );
    assert.doesNotThrow(() => assertClearLock(gl, scene));
  });
});

describe("stability read", () => {
  it("holds the sealed figure across training hours on the two-second cadence", () => {
    assert.equal(LOCK_READ_SEC, 2);
    const dt = 0.05;
    const framesPerRead = 40;
    assert.ok(Math.abs(framesPerRead * dt - LOCK_READ_SEC) < 1e-9);

    const rig = createKushim();
    const scene = new THREE.Scene();
    const cam = frame(1280 / 800);
    const color = new THREE.Color(LOCK.void);
    const gl = {
      toneMapping: THREE.NoToneMapping,
      outputColorSpace: THREE.SRGBColorSpace,
      getClearColor: (target: THREE.Color) => target.copy(color),
      getClearAlpha: () => 1,
    };
    scene.add(rig.root);
    let sealedNodes = 0;
    rig.root.traverse(() => {
      sealedNodes += 1;
    });
    const gestures = GESTURES as readonly Gesture[];
    let elapsed = 0;

    const read = (hour: number, frames: number, reducedMotion: boolean) => {
      for (let n = 1; n <= frames; n++) {
        elapsed += dt;
        const gesture = gestures[n % gestures.length] ?? "idle";
        tickKushim(
          rig,
          pose({
            gesture,
            speaking: !reducedMotion && (gesture === "speak" || gesture === "explain"),
            hour,
            reducedMotion,
            shoulderTopic: hour >= 5 && !reducedMotion,
            attention: hour >= 4 ? 1 : 0,
            typing: hour >= 1 && !reducedMotion,
          }),
          dt,
          elapsed,
        );
        if (n % framesPerRead !== 0) continue;
        assertRigLock(rig, "live", scene);
        assertFrontalCamera(cam);
        assertClearLock(gl, scene);
      }
    };

    try {
      for (let hour = 0; hour <= 8; hour++) read(hour, framesPerRead, false);
      read(8, framesPerRead * 10, false);
      read(8, framesPerRead, true);
      let after = 0;
      rig.root.traverse(() => {
        after += 1;
      });
      assert.equal(after, sealedNodes);
      assert.equal(scene.children.length, 1);
      assert.equal(scene.children[0], rig.root);
      assert.equal(LOCK.void, "#02060A");
      assert.equal(LOCK.strom, "#3AD7FF");
      assert.equal(LOCK.kern, "#E7FBFF");
      assert.equal(LOCK.signal, "#FF3B4E");
      assert.equal(LOCK.proportions.headRadius, 0.105);
      assert.equal(rig.shoulderR.position.x, -LOCK.proportions.shoulderX);
      assert.ok(Object.isFrozen(LOCK));
      assert.ok(Object.isFrozen(LOCK.proportions));
    } finally {
      rig.dispose();
    }
  });
});
