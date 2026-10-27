import type { Rig } from "@/kushim/anatomy";
import { LOCK, type Gesture } from "@/kushim/lock";
import { stageAt } from "@/kushim/stages";

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
  const hz = pose.speaking ? 1.35 : calm ? 0.55 : 0.85;
  const breath = pose.reducedMotion ? 0 : Math.sin(elapsed * hz * Math.PI * 2);
  const lift = breath * 0.012;
  rig.chest.scale.set(1 + breath * 0.008, 1 + lift, 1 + breath * 0.01);
  rig.chest.position.y = LOCK.proportions.chestY + breath * 0.008;

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
}
