/**
 * Rest hinges so the existing limb filaments lie inside the athletic mesh.
 * Chains still run along local -Y. Feet filaments run along local +Z, so the
 * twist keeps that axis facing forward. Gesture code adds arm deltas on top.
 */
import * as THREE from "three";

export type Axis = { x: number; y: number; z: number };

const FORWARD = new THREE.Vector3(0, 0, 1);

/** Local -Y follows `dir`. Local +Z stays as forward as the limb allows. */
export function aimDown(dir: THREE.Vector3): THREE.Quaternion {
  const yAxis = dir.clone().normalize().multiplyScalar(-1);
  const zAxis = FORWARD.clone().addScaledVector(yAxis, -FORWARD.dot(yAxis));
  if (zAxis.lengthSq() < 1e-8) zAxis.set(1, 0, 0);
  zAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
}

function hinge(dir: THREE.Vector3): Axis {
  const e = new THREE.Euler().setFromQuaternion(aimDown(dir), "XYZ");
  return { x: e.x, y: e.y, z: e.z };
}

/** Shoulder (0.20, 1.38, 0) to the mesh wrist. Fingers then fill the hand. */
const LEFT_ARM = new THREE.Vector3(0.19, -0.32, 0.17);
/** Wrist to the fingertips, so the hand ribbons sit in the mesh hand. */
const LEFT_HAND = new THREE.Vector3(0.1, -0.1, 0.09);
const LEFT_SHOULDER = hinge(LEFT_ARM);
const RIGHT_SHOULDER = hinge(new THREE.Vector3(-LEFT_ARM.x, LEFT_ARM.y, LEFT_ARM.z));

function wristBend(arm: THREE.Vector3, hand: THREE.Vector3): Axis {
  const local = hand.clone().normalize().applyQuaternion(aimDown(arm).invert());
  return hinge(local);
}

const LEFT_WRIST = wristBend(LEFT_ARM, LEFT_HAND);
const RIGHT_WRIST = wristBend(
  new THREE.Vector3(-LEFT_ARM.x, LEFT_ARM.y, LEFT_ARM.z),
  new THREE.Vector3(-LEFT_HAND.x, LEFT_HAND.y, LEFT_HAND.z),
);

/** Hip to ankle of the seated stance. Length matches thigh + shin. */
const LEFT_LEG = new THREE.Vector3(0.08, -0.8, 0.03);
const LEFT_HIP = hinge(LEFT_LEG);
const RIGHT_HIP = hinge(new THREE.Vector3(-LEFT_LEG.x, LEFT_LEG.y, LEFT_LEG.z));

export function athleticLeg(side: 1 | -1): Axis {
  const hip = side === 1 ? LEFT_HIP : RIGHT_HIP;
  return { x: hip.x, y: hip.y, z: hip.z };
}

export function athleticHinge(side: 1 | -1): { shoulder: Axis; elbow: Axis; wrist: Axis } {
  const shoulder = side === 1 ? LEFT_SHOULDER : RIGHT_SHOULDER;
  return {
    shoulder: { x: shoulder.x, y: shoulder.y, z: shoulder.z },
    elbow: { x: 0, y: 0, z: 0 },
    wrist: side === 1 ? { ...LEFT_WRIST } : { ...RIGHT_WRIST },
  };
}
