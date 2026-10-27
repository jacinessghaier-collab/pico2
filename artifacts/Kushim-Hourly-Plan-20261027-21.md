# Kushim — Hourly Improvement Plan (2026-10-27 21:xx UTC)

## Build Status (last)
- Vite production build successful (client routes ~1.028 MB / gzip 276 kB).
- SSR + Nitro/Vercel output clean.
- DB migrate skipped (expected).
- Large-chunk warning non-blocking; code-split later if needed.

## 5-Step Ahead Plan (verified)

### Step 1 — EnergyFlow v20 (delivered)
Bone-biased outward filaments, forehead point, activity-triggered expanding red ring.

### Step 2 — This hour (delivered)
HolographicMaterialApplier.ts: MeshPhysical transmission on all body meshes. Locked colors, no skin/clothes. Optional Fresnel rim via ektogamat if package present.

### Step 3 — Gesture integration
Wire GestureLayer into scene. Emotion tags from LLM response (happy/think/emphasis/listen/empathize). Red pulse only on emphasis/activity > 0.55.

### Step 4 — Lip-sync
Integrate three-vrm-lip-sync (preferred) or keep FFT→aa with oscillation. Gaze lerp tightened.

### Step 5 — Speech / Memory
Semantic memory stub injected into system prompt. Short German sentences, natural pauses. Daily naturalness delta.

## Shortcuts
- Drop-in modules (EnergyFlow, GestureLayer, HolographicMaterialApplier).
- No full shader rewrite; MeshPhysical + Points sufficient for current fidelity.
- three-vrm-lip-sync as next high-ROI package.

## Next delta
1. Confirm source path and patch KushimScene to call applyHolographicBody(vrm).
2. Add emotion tag extraction from LLM JSON.
3. Profile 60 fps with bloom after material change.
4. Begin viseme wiring.

Ready. Provide source path for direct patch when available.
