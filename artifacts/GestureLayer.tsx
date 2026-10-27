/**
 * Kushim GestureLayer — Hourly Delta v2026-10-27-20 stub
 * Procedural useFrame extension for VRM humanoid.
 * Drop into KushimScene alongside EnergyFlow.
 *
 * Maps:
 * - audioLevel → amplitude of sternum lift only (rate stays 14/min)
 * - activity → slight right-shoulder emphasis (pairs with EnergyFlow red)
 * - emotion string (from LLM) → idle variants (happy / thinking / emphasis / listen)
 *
 * Based on shefixu-ai-girlfriend Model.tsx patterns (procedural, no clips).
 * Keeps proportions locked: 8-head, arms ~8° abduction, palms open.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

interface Props {
  vrm: VRM | null;
  audioLevel: number;
  activity: number;
  emotion?: 'idle' | 'listen' | 'think' | 'speak' | 'emphasis' | 'empathize';
}

export function GestureLayer({ vrm, audioLevel, activity, emotion = 'idle' }: Props) {
  const sway = useRef(0);

  useFrame((state, delta) => {
    if (!vrm) return;
    const t = state.clock.elapsedTime;
    const h = vrm.humanoid;
    sway.current += delta;

    // Stufe 2: Ruhe-Atmung über das Brustbein-Gelenk, nicht über Skalierung.
    const chest = h.getNormalizedBoneNode('chest') || h.getNormalizedBoneNode('upperChest');
    if (chest) {
      if (chest.userData.restX === undefined) chest.userData.restX = chest.rotation.x;
      chest.scale.set(1, 1, 1);
      const period = 60 / 14;
      const phase = (t % period) / period;
      const inhale = 0.4;
      const amp = phase < inhale
        ? Math.sin((phase / inhale) * Math.PI * 0.5)
        : Math.cos(((phase - inhale) / (1 - inhale)) * Math.PI * 0.5);
      const lift = 0.02 * amp * (0.75 + Math.min(1, audioLevel) * 0.25);
      chest.rotation.x = chest.userData.restX - lift;
    }

    // Micro-sway spine
    const spine = h.getNormalizedBoneNode('spine');
    if (spine) {
      spine.rotation.z = Math.sin(sway.current * 0.4) * 0.015;
    }

    // Emotion-driven subtle arm adjustments (right arm for activity)
    const rUA = h.getNormalizedBoneNode('rightUpperArm');
    const lUA = h.getNormalizedBoneNode('leftUpperArm');
    if (rUA && lUA) {
      const baseAbduct = 0.14; // ~8°
      let rLift = 0;
      let lLift = 0;
      if (emotion === 'emphasis' || activity > 0.6) rLift = 0.08;
      if (emotion === 'think') { rLift = 0.04; lLift = -0.02; }
      if (emotion === 'empathize') { rLift = 0.03; lLift = 0.03; }
      if (emotion === 'speak') { rLift = 0.05 * audioLevel; }

      rUA.rotation.z = baseAbduct + rLift;
      lUA.rotation.z = -baseAbduct - lLift;
    }

    // Head micro for listen/think
    const head = h.getNormalizedBoneNode('head');
    if (head) {
      let tilt = 0;
      if (emotion === 'think') tilt = 0.06;
      if (emotion === 'listen') tilt = 0.02 * Math.sin(t * 0.8);
      head.rotation.z = tilt;
    }
  });

  return null; // pure side-effect layer
}
