# Kushim — Hourly Improvement Plan (2026-10-28 03:xx CET)

## Build status
- Step 4 lip-sync is in the live scene (`src/kushim/lipsync.ts`, `speech.ts`, `motion.ts`).
- Visemes aa / ih / ou / ee / oh drive the existing lip capsule and jaw. Rest pose is unchanged when silent.
- Leo: frequency-band level (FFT) scales the viseme. Browser voice: text clock, gain floor 0.35.
- Gaze lerp 0.10. Blink 3.6–6.4 s, 0.12 s, both eyes to 0.15, not tied to syllables.
- `three-vrm-lip-sync` is not used. This rig has no VRM blendshapes; the package would replace the locked body.
- GestureLayer stays an artifact. Live gestures already run in `motion.ts`. Model tag `emphasis` maps to `explain`. The red shoulder still opens only when the shoulder is the topic.
- Conversation policy is enforced in `dialogue.ts`, not only in the prompt: name once, interrupt, clarifying question only when the last sentence is open, repair repeats the previous sentence without an apology.
- `lock.ts` was not edited. `lock.test.ts` pins colors, proportions, and gesture names.
- Stand: Pico steps DONE 8 / NEXT 9. Hourly DONE 4 / NEXT 5. Marker: `src/kushim/stand.ts`.

## 5-step ahead plan (checked before this note)

### Step 5 — Memory past the turn window (next)
Keep a few German keys (name already stored, plus the last topic phrase) and inject them once into the system text. Do not invent biography. Do not add a second store.

### Step 6 — Viseme gain against idle breath
Mouth amplitude may rise with level. Chest breath rate and the idle chest scale stay as they are, so speech does not pump the torso. Re-measure jaw peak if aa fights the blink.

### Step 7 — First sentence and melody
Pico step 9 remainder: the first spoken sentence shorter than the second, one pause, no new gesture. Still no apology loop.

### Step 8 — Frame time, no new shader
Profile the live canvas. No bloom pass and no second aura mesh unless a capture shows the Fresnel shell is flat. The lock forbids a milky hull.

### Step 9 — Lock check, then stop
Confirm `lock.ts` matches `lock.test.ts` and the masterprompt colors. If it matches, make no visual edit that hour.

## Shortcuts
- Procedural visemes instead of a VRM lip-sync package.
- Repair answers locally from the previous line, so a model call cannot invent a new apology.
- Red shoulder stays topic-gated. The artifact rule “activity > 0.55” would light the signal on ordinary speech and breaks the Stundenplan.
- No breath rewrite this hour. Moving the breath from chest scale onto a sternum joint would change the locked idle.

## Next automatic step
Step 5: one topic key beside the name, injected into the system text, still unowned local storage.
