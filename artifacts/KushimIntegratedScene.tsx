/**
 * KushimScene Integration — Step 3 (Gesture wiring)
 * Drop-in for R3F + three-vrm. Call after VRM load.
 *
 * Wires:
 * - applyHolographicBody (Step 2)
 * - EnergyFlow (Step 1)
 * - GestureLayer (Step 3) — emotion tags + activity → shoulder/head micro
 *
 * Emotion tags expected from LLM JSON: 'idle' | 'listen' | 'think' | 'speak' | 'emphasis' | 'empathize'
 * Red shoulder (EnergyFlow) only expands on emphasis or activity > 0.55.
 *
 * Shortcuts taken:
 * - No new gesture clips; pure procedural useFrame.
 * - Locked proportions / colors from masterprompt.
 * - Next: three-vrm-lip-sync drop-in (Step 4).
 */

import { useEffect } from 'react';
import { VRM } from '@pixiv/three-vrm';
import { EnergyFlow } from './EnergyFlow';
import { GestureLayer } from './GestureLayer';
import { applyHolographicBody } from './HolographicMaterialApplier';

interface KushimSceneProps {
  vrm: VRM | null;
  audioLevel: number;   // 0..1 from FFT / analyser
  activity: number;     // 0..1 from speech / LLM activity
  emotion?: 'idle' | 'listen' | 'think' | 'speak' | 'emphasis' | 'empathize';
}

export function KushimIntegratedScene({
  vrm,
  audioLevel,
  activity,
  emotion = 'idle',
}: KushimSceneProps) {
  // Apply holographic body once after VRM is ready
  useEffect(() => {
    if (vrm) {
      applyHolographicBody(vrm);
    }
  }, [vrm]);

  // Clamp activity for red pulse trigger (Step 3 rule)
  const redActivity = activity > 0.55 || emotion === 'emphasis' ? Math.max(activity, 0.6) : 0;

  return (
    <>
      {/* Energy filaments + core + forehead + red shoulder (activity-gated) */}
      <EnergyFlow vrm={vrm} audioLevel={audioLevel} activity={redActivity} />

      {/* Procedural gestures: breath, micro-sway, emotion-driven arm/head */}
      <GestureLayer
        vrm={vrm}
        audioLevel={audioLevel}
        activity={redActivity}
        emotion={emotion}
      />
    </>
  );
}

/**
 * Minimal usage example (inside your Canvas / VRM loader):
 *
 * const [vrm, setVrm] = useState<VRM | null>(null);
 * const [audioLevel, setAudioLevel] = useState(0);
 * const [activity, setActivity] = useState(0);
 * const [emotion, setEmotion] = useState<'idle' | ...>('idle');
 *
 * // After gltf + VRMUtils.rotateVRM0:
 * // setVrm(vrmInstance);
 *
 * // From LLM response JSON:
 * // setEmotion(parsed.emotion ?? 'idle');
 * // setActivity(parsed.activity ?? 0);
 *
 * <KushimIntegratedScene
 *   vrm={vrm}
 *   audioLevel={audioLevel}
 *   activity={activity}
 *   emotion={emotion}
 * />
 */
