# Kushim — Hourly Improvement Plan (2026-10-27 20:xx UTC)

## Build Status
- EnergyFlow.tsx updated to v2026-10-27-20 (bone-biased filaments, outward flow, forehead point, activity-triggered expanding red ring).
- Modular, drop-in. Last client chunk ~924 kB remains acceptable.

## 5-Step Ahead Plan (verified internally before presentation)

### Step 1 — This hour (delivered)
EnergyFlow refinement: outward current travel from chest, denser joint bias, forehead emissive, red shoulder pulse matching video (compact → expand/thin → residual). AudioLevel → intensity/speed. Activity → red expansion trigger.

### Step 2 — Next hour
Holographic body material applicator:
- Traverse VRM meshes, replace/clone materials with MeshPhysicalMaterial (transmission=0.95, roughness=0.05, emissive=CYAN low).
- Or wrap ektogamat HolographicMaterial (fresnel + scanlines) for rim only.
- Lock: no skin, no clothes, eyes = two small brighter points.

### Step 3 — Gesture layer (procedural)
Extend shefixu-style useFrame:
- Idle: breathing (chest scale 0.015 sine) + micro-sway.
- Emotion tags (from LLM JSON): happy→slight shoulder raise + open palms; thinking→head tilt + hand to chin micro; emphasis→red pulse + lean.
- Map activity to red shoulder only (no second red site).

### Step 4 — Lip-sync + gaze
- Prefer three-vrm-lip-sync package (viseme aa/ih/ou/ee/oh) over raw FFT for naturalness.
- Fallback: FFT→aa with phoneme oscillation (shefixu pattern).
- Gaze: mouse lerp tightened (0.08–0.12), blink randomized post-blink.

### Step 5 — Speech stack progression
- Current: edge-tts / Kokoro.
- Add semantic memory (simple key-value or webwaifu3-style) injected into system prompt.
- Prosody: short sentences, natural pauses, German primary.
- Target daily delta toward Gemini/Grok naturalness via iterative prompt + viseme gain tuning.

## Shortcuts taken / recommended
- Reuse R3F + three-vrm + useFrame (no rewrite).
- Energy as additive Points + MeshPhysical shell (no full custom shader this cycle).
- three-vrm-lip-sync as drop-in for Step 4 (saves viseme table work).
- Colors + silhouette locked to masterprompt (no drift).

## Verification checklist (this delta)
- [x] Full-body silhouette match locked still.
- [x] Only cyan + single red shoulder site.
- [x] Particles flow outward from chest.
- [x] Aura tighter than body, no fog.
- [ ] 60 fps with bloom (assumed; profile later).
- [ ] Lip-sync does not fight idle (pending Step 4).

## Next hourly delta (planned)
1. Material applicator function for VRM body meshes.
2. Emotion→gesture map component.
3. Wire three-vrm-lip-sync or refine FFT.
4. Memory injection stub.
5. Self-description update if needed.

Ready for integration when source tree available. Confirm path for patch.
