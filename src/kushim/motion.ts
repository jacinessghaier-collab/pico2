import type { Rig } from "@/kushim/anatomy";
import { BLINK, breathCueAt, GAZE_LERP, JAW_DROP, readGaze } from "@/kushim/lipsync";
import { LOCK, type Gesture } from "@/kushim/lock";
import { LOCK_CANON } from "@/kushim/lock-check";
import { stageAt } from "@/kushim/stages";
import { sampleSpeechMouth } from "@/kushim/speech";

export type Pose = {
  gesture: Gesture;
  speaking: boolean;
  hour: number;
  reducedMotion: boolean;
  shoulderTopic: boolean;
  attention: number;
  typing: boolean;
};

type Axis = { x: number; y: number; z: number };

function poseTargets(gesture: Gesture): Record<string, Axis> {
  const idle: Record<string, Axis> = {
    shoulderL: { x: 0.02, y: 0.02, z: 0.1 },
    elbowL: { x: -0.16, y: 0.02, z: 0 },
    wristL: { x: -0.25, y: 0, z: 0.5 },
    shoulderR: { x: 0.02, y: -0.02, z: -0.1 },
    elbowR: { x: -0.16, y: -0.02, z: 0 },
    wristR: { x: -0.25, y: 0, z: -0.5 },
    head: { x: 0, y: 0, z: 0 },
  };
  if (gesture === "explain") {
    idle.shoulderL = { x: -1.05, y: 0.25, z: 0.28 };
    idle.elbowL = { x: -1.25, y: 0.1, z: 0 };
    idle.wristL = { x: 0.35, y: 0.2, z: 0.2 };
    idle.head = { x: 0.04, y: 0.08, z: 0 };
  } else if (gesture === "think") {
    idle.head = { x: 0.14, y: -0.06, z: 0.04 };
    idle.shoulderL = { x: -0.2, y: 0.1, z: 0.22 };
    idle.elbowL = { x: -0.85, y: 0.1, z: 0 };
  } else if (gesture === "empathize") {
    idle.shoulderL.z = 0.28;
    idle.shoulderR.z = -0.28;
    idle.head = { x: 0.08, y: 0, z: 0.05 };
  } else if (gesture === "listen") {
    idle.head = { x: 0.06, y: 0.02, z: 0.07 };
  } else if (gesture === "acknowledge") {
    idle.head = { x: 0.05, y: 0, z: 0 };
  }
  return idle;
}

function damp(current: number, target: number, dt: number, speed: number) {
  const k = 1 - Math.exp(-dt * speed);
  return current + (target - current) * k;
}

function dampAxis(obj: { rotation: { x: number; y: number; z: number } }, target: Axis, dt: number, speed: number) {
  obj.rotation.x = damp(obj.rotation.x, target.x, dt, speed);
  obj.rotation.y = damp(obj.rotation.y, target.y, dt, speed);
  obj.rotation.z = damp(obj.rotation.z, target.z, dt, speed);
}

function clampAround(value: number, rest: number, slack: number) {
  if (!Number.isFinite(value)) return rest;
  return Math.min(rest + slack, Math.max(rest - slack, value));
}

export function applySpeechMouth(
  rig: Rig,
  mouth: { sx: number; sy: number; sz: number; jaw: number },
  active: boolean,
) {
  rig.lips.scale.set(
    clampAround(active ? mouth.sx : 1, 1, LOCK_CANON.lipScaleX),
    clampAround(active ? mouth.sy : 1, 1, LOCK_CANON.lipScaleY),
    clampAround(active ? mouth.sz : 1, 1, LOCK_CANON.lipScaleZ),
  );
  const restJaw = typeof rig.jaw.userData.restX === "number" ? rig.jaw.userData.restX : 0;
  const restJawY = typeof rig.jaw.userData.restY === "number" ? rig.jaw.userData.restY : rig.jaw.position.y;
  const raw = active && Number.isFinite(mouth.jaw) ? mouth.jaw * JAW_DROP : 0;
  const drop = Math.min(LOCK_CANON.jawDrop, Math.max(0, raw));
  rig.jaw.rotation.x = restJaw;
  rig.jaw.position.y = restJawY - drop;
}

export function tickKushim(rig: Rig, pose: Pose, dt: number, elapsed: number) {
  const stage = stageAt(pose.hour);
  const targets = poseTargets(pose.gesture);
  const speed = pose.gesture === "empathize" ? 2.4 : 4.2;
  dampAxis(rig.shoulderL, targets.shoulderL, dt, speed);
  dampAxis(rig.elbowL, targets.elbowL, dt, speed);
  dampAxis(rig.wristL, targets.wristL, dt, speed);
  dampAxis(rig.shoulderR, targets.shoulderR, dt, speed);
  dampAxis(rig.elbowR, targets.elbowR, dt, speed);
  dampAxis(rig.wristR, targets.wristR, dt, speed);

  let nod = 0;
  if (!pose.reducedMotion && (pose.gesture === "acknowledge" || (pose.gesture === "speak" && pose.speaking))) {
    nod = Math.sin(elapsed * 3.2) * 0.04;
  }
  if (!pose.reducedMotion && pose.typing && stage.backchannel) {
    const pulse = Math.sin(elapsed * 1.7);
    if (pulse > 0.92) nod += 0.05;
  }
  const yaw = stage.yawToVoice ? pose.attention * 0.16 : 0;
  dampAxis(rig.head, { x: targets.head.x + nod, y: targets.head.y + yaw, z: targets.head.z }, dt, 5);

  const calm = pose.gesture === "empathize";
  const cue = breathCueAt(elapsed, pose.speaking, calm, pose.reducedMotion);
  const breath = cue.value;
  const chest = {
    x: 1 + breath * LOCK_CANON.breathX,
    y: 1 + breath * LOCK_CANON.breathY,
    z: 1 + breath * LOCK_CANON.breathZ,
  };
  rig.chest.scale.set(chest.x, chest.y, chest.z);
  rig.chest.position.y = LOCK.proportions.chestY + breath * LOCK_CANON.breathLift;

  const curlBase = pose.gesture === "think" ? 0.45 : pose.gesture === "explain" ? 0.05 : 0.18;
  const life = !pose.reducedMotion && stage.fingerLife ? 0.05 : 0;
  rig.fingersL.forEach((finger, index) => {
    const wave = Math.sin(elapsed * 0.8 + index) * life;
    finger.rotation.x = damp(finger.rotation.x, -(curlBase + wave), dt, 4);
  });
  rig.fingersR.forEach((finger, index) => {
    const wave = Math.sin(elapsed * 0.8 + index + 1) * life;
    finger.rotation.x = damp(finger.rotation.x, -(curlBase + wave), dt, 4);
  });

  rig.nerve.uniforms.uTime.value = elapsed;
  rig.signal.uniforms.uTime.value = elapsed;
  rig.nerve.uniforms.uDensity.value = stage.filament;
  rig.signal.uniforms.uDensity.value = 1;

  const positions = rig.ring.geometry.getAttribute("position");
  const array = positions.array as Float32Array;
  let radius = 0.055;
  let opacity = 0.2;
  if (!pose.reducedMotion) {
    const cycle = (elapsed % 6.2) / 6.2;
    if (cycle < 0.45) {
      const u = cycle / 0.45;
      radius = 0.05 + u * 0.2;
      opacity = 0.95 * (1 - u);
    }
  }
  if (pose.shoulderTopic && stage.shoulderListen) opacity = Math.min(1, opacity + 0.35);
  for (let i = 0; i < rig.ringAngles.length; i++) {
    const angle = rig.ringAngles[i];
    const jitter = rig.ringJitter[i];
    array[i * 3] = Math.cos(angle) * radius * jitter;
    array[i * 3 + 1] = Math.sin(angle) * radius * jitter * 0.92;
    array[i * 3 + 2] = (jitter - 0.9) * 0.04;
  }
  positions.needsUpdate = true;
  const mat = rig.ring.material as { opacity: number };
  mat.opacity = opacity;
  const pulse = pose.reducedMotion ? 1 : 1 + Math.sin(elapsed * 3.4) * 0.08;
  rig.core.scale.setScalar(pulse * (pose.shoulderTopic && stage.shoulderListen ? 1.15 : 1));

  // The speak pose stays up across the sentence gap. An idle bus still writes rest.
  const mouth = sampleSpeechMouth(pose.reducedMotion, { exhale: cue.exhale, chest });
  applySpeechMouth(rig, mouth, pose.speaking && mouth.speaking);

  const blink = (rig.head.userData.blink ?? { next: BLINK.minSec, until: -1 }) as { next: number; until: number };
  rig.head.userData.blink = blink;
  if (!pose.reducedMotion && elapsed >= blink.next && elapsed > blink.until) {
    blink.until = elapsed + BLINK.closeSec;
    blink.next = blink.until + BLINK.minSec + Math.random() * (BLINK.maxSec - BLINK.minSec);
  }
  const closed = !pose.reducedMotion && elapsed < blink.until;
  rig.eyeMat.opacity = closed ? BLINK.eyeGain : 1;

  const gazeLerp = 1 - Math.pow(1 - GAZE_LERP, Math.min(dt, 0.05) * 60);
  const gaze = pose.reducedMotion ? { x: 0, y: 0 } : readGaze();
  for (const eye of rig.eyes) {
    const restX = typeof eye.userData.restX === "number" ? eye.userData.restX : eye.position.x;
    const restY = typeof eye.userData.restY === "number" ? eye.userData.restY : eye.position.y;
    const tx = restX + gaze.x * 0.006;
    const ty = restY + gaze.y * 0.004;
    eye.position.x += (tx - eye.position.x) * gazeLerp;
    eye.position.y += (ty - eye.position.y) * gazeLerp;
  }
}
