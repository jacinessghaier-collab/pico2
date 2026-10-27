# Kushim — Hourly Improvement Plan (2026-10-27 23:xx CET)

## Build Status
- EnergyFlow.tsx v20 — delivered
- HolographicMaterialApplier.ts — delivered
- GestureLayer.tsx — delivered
- KushimIntegratedScene.tsx (Step 3 wiring) — delivered this step

## 5-Step Ahead Plan (verified before presentation)

### Step 3 — Gesture integration (delivered this turn)
- KushimIntegratedScene.tsx wires EnergyFlow + GestureLayer + applyHolographicBody.
- Emotion tags from LLM: idle/listen/think/speak/emphasis/empathize.
- Red shoulder only on emphasis or activity > 0.55 (clamped inside component).
- Procedural only, proportions locked.

### Step 4 — Lip-sync (next)
Prefer three-vrm-lip-sync package (viseme aa/ih/ou/ee/oh).  
Fallback: FFT → aa with small oscillation (shefixu pattern).  
Gaze lerp 0.08–0.12, blink already randomized in GestureLayer/spec.

### Step 5 — Speech / Memory stub
Semantic memory (key-value or simple context window) injected into system prompt.  
Short German sentences, natural pauses. Emotion tag extraction from LLM JSON.

### Step 6 — Viseme gain + activity mapping
Tune audioLevel → viseme intensity so it does not fight idle breath.  
Activity → red pulse remains gated.

### Step 7 — Post-bloom + 60 fps profile
Confirm UnrealBloom or R3F postprocessing. Profile after material + particles.

### Step 8 — Conversation stage delta (stundenplan)
One of the remaining items: interrupt handling or short clarifying question only when open.

## Shortcuts confirmed
- Drop-in modules only (no scene rewrite).
- three-vrm-lip-sync as highest-ROI for Step 4.
- Locked masterprompt (silhouette, colors, single red site, camera).
- No new shader this cycle.

## Next automatic step
Step 4 starts immediately after this response. Provide package preference or keep FFT fallback if three-vrm-lip-sync not desired.

Ready. Source path for further patches: artifacts/ or your repo when available.
