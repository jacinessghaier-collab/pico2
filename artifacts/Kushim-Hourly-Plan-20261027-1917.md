# Kushim — Hourly Improvement Plan (2026-10-27 19:17 UTC)

## Build Status (last successful)
- Client KushimScene chunk: 924 kB (gzip 246 kB) — acceptable for now, code-split later.
- SSR clean. "use client" warnings non-blocking (Nitro bundler).
- DB migrate skipped (DATABASE_URL unset) — expected for PGLite fallback.

## 5-Step Ahead Plan (verified before presentation)

### Step 1 — Holographic base material (this hour)
Apply MeshPhysicalMaterial with transmission + Fresnel rim (or ektogamat HolographicMaterial) to VRM body meshes. Lock colors to #3AD7FF / #E7FBFF. No skin/clothes.

### Step 2 — EnergyFlow layer (delivered)
Modular bone-following particle filaments + central core + red shoulder signal. Driven by audioLevel + activity. See EnergyFlow.tsx.

### Step 3 — Procedural gesture refinement
Extend shefixu-style useFrame:
- Idle breathing + micro-sway (already present).
- Emotion tags from LLM → gesture intensity (shoulder raise, slight lean, hand open/close).
- Red shoulder pulse maps to "activity" or "emphasis".

### Step 4 — Lip-sync + gaze upgrade
- Keep FFT → aa/oh morphs, add phoneme oscillation.
- Mouse/gaze tracking already in base; tighten lerp.
- Blink schedule randomized post-blink (stable).

### Step 5 — Speech stack
- Current: edge-tts or Kokoro local.
- Next: better prosody + semantic memory (webwaifu3 style).
- Target: Gemini/Grok-level naturalness via iterative prompt + viseme mapping.

## Shortcuts taken
- Reuse existing R3F + three-vrm + useFrame base (no rewrite).
- Energy system as pure additive Points + MeshPhysical shell (no full shader rewrite this cycle).
- Post-bloom assumed already in scene (UnrealBloomPass or R3F postprocessing).
- Colors locked to masterprompt.

## Next hourly delta (planned, not yet applied)
1. Wire EnergyFlow into KushimScene.
2. Add activity-driven red expansion animation matching the video (ring → sparks).
3. Emotion-to-gesture map (happy/thinking/emphasis).
4. Viseme refinement table.
5. Memory injection for conversation continuity.

## Verification checklist
- [ ] Full-body silhouette matches locked masterprompt.
- [ ] Only cyan + single red shoulder site.
- [ ] Particles flow outward from chest.
- [ ] Aura tighter than body, no fog.
- [ ] 60 fps with bloom.
- [ ] Lip-sync does not fight idle expressions.

Ready for integration. Confirm when source tree is available for direct patch.
