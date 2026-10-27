/**
 * Kushim EnergyFlow Layer — Hourly Delta v2026-10-27-20
 * Improved modular attachment for KushimScene / VRM humanoid.
 *
 * Changes this hour (Stufe 5):
 * - Aura radius stays at scale 1. Voice lifts only emissive brightness. Idle has no sine.
 *
 * Integration: <EnergyFlow vrm={vrm} audioLevel={audioLevel} activity={activity} />
 * inside same group as VRM. Requires Bloom postprocessing.
 * Colors locked: CYAN #3AD7FF, CORE #E7FBFF, RED #FF3B4E.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

interface Props {
  vrm: VRM | null;
  audioLevel: number;
  activity: number; // 0..1, higher = stronger red shoulder pulse
}

const CYAN = new THREE.Color('#3AD7FF');
const CORE = new THREE.Color('#E7FBFF');
const RED = new THREE.Color('#FF3B4E');

const CORRIDORS = [
  ['chest', 'upperChest', 'neck', 'head'],
  ['chest', 'spine', 'hips'],
  ['upperChest', 'rightUpperArm', 'rightLowerArm', 'rightHand'],
  ['upperChest', 'leftUpperArm', 'leftLowerArm', 'leftHand'],
  ['hips', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'],
  ['hips', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot'],
] as const;

const FLOW = {
  count: 1200,
  dash: 4,
  speed: 0.1,
  idleOpacity: 0.5,
  speechOpacity: 0.72,
  attackSec: 0.35,
  releaseSec: 0.8,
  flickerHz: 0,
  radius: [0.045, 0.1, 0.038, 0.038, 0.042, 0.042],
};

const _out = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _side = new THREE.Vector3();
const _bin = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _alt = new THREE.Vector3(1, 0, 0);

function biasTowardJoint() {
  if (Math.random() > 0.62) return Math.random();
  const joints = [0, 1 / 3, 2 / 3, 1];
  const j = joints[(Math.random() * joints.length) | 0];
  return Math.min(1, Math.max(0, j + (Math.random() - 0.5) * 0.14));
}

function sampleCorridor(
  poly: THREE.Vector3[],
  count: number,
  cum: number[],
  total: number,
  u: number,
  radius: number,
  angle: number,
  target: THREE.Vector3,
) {
  if (count < 2 || total < 1e-5) return false;
  const d = (u % 1) * total;
  let seg = 1;
  while (seg < count - 1 && cum[seg] < d) seg++;
  const span = cum[seg] - cum[seg - 1] || 1;
  const t = (d - cum[seg - 1]) / span;
  target.lerpVectors(poly[seg - 1], poly[seg], Math.min(1, Math.max(0, t)));
  _tan.subVectors(poly[seg], poly[seg - 1]);
  if (_tan.lengthSq() < 1e-8) _tan.copy(_up);
  else _tan.normalize();
  const ref = Math.abs(_tan.dot(_up)) > 0.92 ? _alt : _up;
  _side.crossVectors(_tan, ref).normalize();
  _bin.crossVectors(_tan, _side);
  target.addScaledVector(_side, Math.cos(angle) * radius);
  target.addScaledVector(_bin, Math.sin(angle) * radius);
  return true;
}

export function EnergyFlow({ vrm, audioLevel, activity }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const shoulderRef = useRef<THREE.Points>(null);
  const foreheadRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef(0);
  const bright = useRef(FLOW.idleOpacity);
  const auraLevel = useRef(0.12);
  const polyBuf = useRef(CORRIDORS.map((path) => path.map(() => new THREE.Vector3())));
  const cumBuf = useRef(CORRIDORS.map((path) => new Array<number>(path.length).fill(0)));

  // Stufe 4: kurze Striche auf festen Knochenpfaden, dichter an Gelenken
  const filamentGeo = useMemo(() => {
    const count = FLOW.count;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const u = new Float32Array(count);
    const radius = new Float32Array(count);
    const angle = new Float32Array(count);
    const corridor = new Float32Array(count);
    const per = count / CORRIDORS.length;
    const dashes = per / FLOW.dash;

    for (let c = 0; c < CORRIDORS.length; c++) {
      for (let f = 0; f < dashes; f++) {
        const base = biasTowardJoint();
        const rad = Math.random() * FLOW.radius[c];
        const ang = Math.random() * Math.PI * 2;
        for (let k = 0; k < FLOW.dash; k++) {
          const i = c * per + f * FLOW.dash + k;
          u[i] = (base + k * 0.016) % 1;
          radius[i] = rad;
          angle[i] = ang;
          corridor[i] = c;
          CYAN.toArray(colors, i * 3);
        }
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('u', new THREE.BufferAttribute(u, 1));
    geo.setAttribute('radius', new THREE.BufferAttribute(radius, 1));
    geo.setAttribute('angle', new THREE.BufferAttribute(angle, 1));
    geo.setAttribute('corridor', new THREE.BufferAttribute(corridor, 1));
    return geo;
  }, []);

  const shoulderGeo = useMemo(() => {
    const count = 180;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.04 + Math.random() * 0.09;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.sin(a) * r * 0.55;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame((state, delta) => {
    if (!vrm) return;
    const t = state.clock.elapsedTime;
    const h = vrm.humanoid;

    // Central core — chest bone
    if (coreRef.current) {
      const chest = h.getNormalizedBoneNode('chest') || h.getNormalizedBoneNode('upperChest');
      if (chest) {
        coreRef.current.position.copy(chest.position);
        coreRef.current.position.y += 0.02;
        const pulse = 1 + Math.sin(t * 2.4) * 0.08 * (0.4 + audioLevel);
        coreRef.current.scale.setScalar(pulse);
      }
    }

    // Forehead point
    if (foreheadRef.current) {
      const head = h.getNormalizedBoneNode('head');
      if (head) {
        foreheadRef.current.position.copy(head.position);
        foreheadRef.current.position.y += 0.12;
        foreheadRef.current.position.z += 0.06;
      }
    }

    // Stufe 4: nur entlang der Pfade, Helligkeit als Hüllkurve, kein Sinus
    if (pointsRef.current) {
      const geo = pointsRef.current.geometry;
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const uAttr = geo.getAttribute('u') as THREE.BufferAttribute;
      const radAttr = geo.getAttribute('radius') as THREE.BufferAttribute;
      const angAttr = geo.getAttribute('angle') as THREE.BufferAttribute;
      const corAttr = geo.getAttribute('corridor') as THREE.BufferAttribute;
      const dt = Math.min(0.05, delta);
      const totals = [0, 0, 0, 0, 0, 0];
      const counts = [0, 0, 0, 0, 0, 0];

      for (let c = 0; c < CORRIDORS.length; c++) {
        let n = 0;
        for (const name of CORRIDORS[c]) {
          const bone = h.getNormalizedBoneNode(name as Parameters<typeof h.getNormalizedBoneNode>[0]);
          if (!bone) continue;
          bone.getWorldPosition(polyBuf.current[c][n]);
          n++;
        }
        counts[c] = n;
        let total = 0;
        const cum = cumBuf.current[c];
        cum[0] = 0;
        for (let i = 1; i < n; i++) {
          total += polyBuf.current[c][i].distanceTo(polyBuf.current[c][i - 1]);
          cum[i] = total;
        }
        totals[c] = total;
      }

      for (let i = 0; i < pos.count; i++) {
        const c = corAttr.getX(i);
        const u = (uAttr.getX(i) + dt * FLOW.speed) % 1;
        uAttr.setX(i, u);
        if (
          sampleCorridor(
            polyBuf.current[c],
            counts[c],
            cumBuf.current[c],
            totals[c],
            u,
            radAttr.getX(i),
            angAttr.getX(i),
            _out,
          )
        ) {
          pointsRef.current.worldToLocal(_out);
          pos.setXYZ(i, _out.x, _out.y, _out.z);
        }
      }
      pos.needsUpdate = true;

      const voice = Math.min(1, Math.max(0, audioLevel));
      const targetOp = FLOW.idleOpacity + voice * (FLOW.speechOpacity - FLOW.idleOpacity);
      const tau = targetOp > bright.current ? FLOW.attackSec : FLOW.releaseSec;
      bright.current += (targetOp - bright.current) * (1 - Math.exp(-dt / tau));
      const mat = pointsRef.current.material as THREE.PointsMaterial;
      mat.opacity = bright.current;
      mat.size = 0.0065;
    }

    // Red shoulder signal — figure's right (left of frame) = rightUpperArm
    if (shoulderRef.current) {
      const rUA = h.getNormalizedBoneNode('rightUpperArm');
      if (rUA) {
        shoulderRef.current.position.copy(rUA.position);
        shoulderRef.current.position.y += 0.14;
        // Activity-driven expansion matching video: compact → ring → thin sparks
        pulseRef.current = Math.max(0, pulseRef.current - 0.012);
        if (activity > 0.55 && pulseRef.current < 0.15) pulseRef.current = 1.0;
        const expand = 1 + pulseRef.current * 1.6 + Math.sin(t * 4.5) * 0.12 * activity;
        shoulderRef.current.scale.setScalar(expand);
        const mat = shoulderRef.current.material as THREE.PointsMaterial;
        mat.opacity = 0.35 + activity * 0.45 * (1 - pulseRef.current * 0.4);
        mat.size = 0.01 + pulseRef.current * 0.008;
      }
    }

    // Stufe 5: Radius steht. Stimme hebt nur die Helligkeit, Idle ohne Sinus.
    if (auraRef.current) {
      auraRef.current.scale.setScalar(1);
      const voice = Math.min(1, Math.max(0, audioLevel));
      const target = 0.12 + voice * 0.08;
      const tau = target > auraLevel.current ? 0.45 : 1.1;
      const dtA = Math.min(0.05, delta);
      auraLevel.current += (target - auraLevel.current) * (1 - Math.exp(-dtA / tau));
      const mat = auraRef.current.material as THREE.MeshPhysicalMaterial;
      mat.emissiveIntensity = auraLevel.current;
      mat.opacity = auraLevel.current * 0.55;
    }
  });

  if (!vrm) return null;

  return (
    <group>
      {/* Central emissive core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.042, 16, 16]} />
        <meshBasicMaterial color={CORE} transparent opacity={0.92} />
      </mesh>

      {/* Forehead point */}
      <mesh ref={foreheadRef}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshBasicMaterial color={CORE} transparent opacity={0.85} />
      </mesh>

      {/* Cyan-Filamente auf den sechs Pfaden */}
      <points ref={pointsRef} geometry={filamentGeo}>
        <pointsMaterial
          size={0.0065}
          vertexColors
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* Red shoulder sparks / ring */}
      <points ref={shoulderRef} geometry={shoulderGeo}>
        <pointsMaterial
          color={RED}
          size={0.011}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* Soft aura shell — locked MeshPhysical transmission */}
      <mesh ref={auraRef}>
        <sphereGeometry args={[0.92, 32, 32]} />
        <meshPhysicalMaterial
          color={CYAN}
          transparent
          opacity={0.066}
          roughness={0.08}
          metalness={0}
          transmission={0.96}
          thickness={0.15}
          emissive={CYAN}
          emissiveIntensity={0.12}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
