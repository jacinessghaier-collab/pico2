import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createKushim } from "@/kushim/anatomy";
import { FIRST_PAUSE_MS, gapAfterSentence } from "@/kushim/dialogue";
import type { MouthBreath } from "@/kushim/lipsync";
import { tickKushim, type Pose } from "@/kushim/motion";
import { sampleSpeechMouth, speakBrowser, stopSpeech } from "@/kushim/speech";
import { STAGES } from "@/kushim/stages";

type FakeUtterance = {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  voice: unknown;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type Queued = { ms: number; run: () => void };

const queued: Queued[] = [];
const utterances: FakeUtterance[] = [];

const WILD_BREATH: MouthBreath = { exhale: 0, chest: { x: 1.4, y: 0.5, z: 2 } };

function pose(patch: Partial<Pose> = {}): Pose {
  return {
    gesture: "idle",
    speaking: false,
    hour: 8,
    reducedMotion: false,
    shoulderTopic: false,
    attention: 0,
    typing: false,
    ...patch,
  };
}

function assertSampleRest(breath?: MouthBreath) {
  const mouth = sampleSpeechMouth(false, breath);
  assert.deepEqual(mouth, { speaking: false, level: 0, sx: 1, sy: 1, sz: 1, jaw: 0 });
  const reduced = sampleSpeechMouth(true, breath);
  assert.deepEqual(reduced, { speaking: false, level: 0, sx: 1, sy: 1, sz: 1, jaw: 0 });
}

function assertMeshRest(rig: ReturnType<typeof createKushim>, restY: number) {
  assert.equal(rig.lips.scale.x, 1);
  assert.equal(rig.lips.scale.y, 1);
  assert.equal(rig.lips.scale.z, 1);
  assert.equal(rig.jaw.position.y, restY);
  assert.equal(rig.jaw.rotation.x, 0);
}

function holdClock() {
  const perf = performance;
  const previous = Object.getOwnPropertyDescriptor(perf, "now");
  let clock = 20_000;
  Object.defineProperty(perf, "now", {
    configurable: true,
    writable: true,
    value: () => clock,
  });
  return {
    set(ms: number) {
      clock = ms;
    },
    restore() {
      if (previous) Object.defineProperty(perf, "now", previous);
      else Reflect.deleteProperty(perf, "now");
    },
  };
}

before(() => {
  if (typeof document === "undefined") {
    const canvas = () => ({ width: 128, height: 128, getContext: () => null });
    Object.assign(globalThis, {
      document: { createElement: (tag: string) => (tag === "canvas" ? canvas() : {}) },
    });
  }
  class Utterance implements FakeUtterance {
    text: string;
    lang = "";
    rate = 1;
    pitch = 1;
    voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  Object.assign(globalThis, { SpeechSynthesisUtterance: Utterance });
  Object.assign(globalThis, {
    window: {
      speechSynthesis: {
        onvoiceschanged: null as null | (() => void),
        getVoices: () => [{ lang: "de-DE", name: "Markus" }],
        speak(utterance: FakeUtterance) {
          utterances.push(utterance);
        },
        cancel() {},
      },
      setTimeout(fn: () => void, ms?: number) {
        queued.push({ ms: ms ?? 0, run: fn });
        return queued.length;
      },
      clearTimeout() {},
    },
  });
});

afterEach(() => {
  queued.length = 0;
  utterances.length = 0;
  stopSpeech();
});

describe("idle speech bus", () => {
  it("holds a closed mouth while nothing is speaking, including past the first pause", () => {
    const rig = createKushim();
    try {
      const restY = rig.jaw.position.y;
      const frames = 48;
      assert.ok(frames * 0.016 > FIRST_PAUSE_MS / 1000);
      for (const speaking of [false, true]) {
        applyOpen(rig);
        for (let i = 0; i < frames; i++) {
          tickKushim(
            rig,
            pose({ gesture: speaking ? "speak" : "idle", speaking }),
            0.016,
            i * 0.016,
          );
          assertSampleRest(WILD_BREATH);
          assertMeshRest(rig, restY);
        }
      }
    } finally {
      rig.dispose();
    }
  });

  it("rests the mouth for the whole sentence gap, then opens again on the next line", () => {
    const rig = createKushim();
    const clock = holdClock();
    const pending = speakBrowser("Abend bleibt. Der zweite Satz trägt mehr.", 1, 80, "de-DE");
    pending.catch(() => {});
    try {
      const restY = rig.jaw.position.y;
      assert.equal(utterances.length, 1);
      assert.equal(queued.length, 0);

      const open = sampleSpeechMouth(false);
      assert.equal(open.speaking, true);
      assert.ok(open.sx > 1.3, `expected an open viseme, sx=${open.sx}`);
      assert.ok(open.jaw > 0.1, `expected a dropped jaw sample, jaw=${open.jaw}`);
      tickKushim(rig, pose({ gesture: "speak", speaking: true }), 0.016, 0.2);
      assert.ok(rig.lips.scale.x > 1.2);
      assert.ok(restY - rig.jaw.position.y > 0.004);

      utterances[0]?.onend?.();
      assert.equal(queued.length, 1);
      assert.equal(queued[0]?.ms, gapAfterSentence(0, 2, 80));
      assert.equal(queued[0]?.ms, FIRST_PAUSE_MS);

      // Stale frames still sit on the bus. A clock inside the open vowel must not replay them.
      clock.set(20_050);
      assertSampleRest(WILD_BREATH);
      tickKushim(rig, pose({ gesture: "speak", speaking: true }), 0.016, 0.4);
      assertMeshRest(rig, restY);

      const holdFrames = 40;
      for (let i = 0; i < holdFrames; i++) {
        clock.set(20_050 + i * 200);
        tickKushim(rig, pose({ gesture: "speak", speaking: true }), 0.016, 1 + i * 0.016);
        assertSampleRest(WILD_BREATH);
        assertMeshRest(rig, restY);
      }
      assert.ok(holdFrames * 200 > FIRST_PAUSE_MS);
      assert.equal(queued.length, 1);
      assert.equal(utterances.length, 1);

      clock.set(30_000);
      queued[0]?.run();
      queued.length = 0;
      const again = sampleSpeechMouth(false);
      assert.equal(again.speaking, true);
      assert.ok(again.sx > 1, `next line should open the mouth, sx=${again.sx}`);
      tickKushim(rig, pose({ gesture: "speak", speaking: true }), 0.016, 2);
      assert.ok(rig.lips.scale.x > 1);

      stopSpeech();
      clock.set(40_000);
      for (let i = 0; i < 12; i++) {
        clock.set(40_000 + i * 500);
        tickKushim(rig, pose({ gesture: "speak", speaking: true }), 0.016, 3 + i);
        assertSampleRest(WILD_BREATH);
        assertMeshRest(rig, restY);
      }
    } finally {
      clock.restore();
      rig.dispose();
    }
  });
});

describe("one stage rate", () => {
  it("speaks each stage at stage.speechRate and keeps a flat pitch", () => {
    assert.equal(FIRST_PAUSE_MS, 320);
    for (const stage of STAGES) {
      utterances.length = 0;
      queued.length = 0;
      const pending = speakBrowser("Ich bin da.", stage.speechRate, stage.sentenceGapMs, "de-DE");
      pending.catch(() => {});
      assert.equal(utterances.length, 1, stage.label);
      assert.equal(utterances[0]?.rate, stage.speechRate);
      assert.equal(utterances[0]?.pitch, 0.92);
      assert.equal("pitch" in stage, false);
      assert.equal(Object.keys(stage).filter((key) => key.toLowerCase().includes("rate")).join(), "speechRate");
      assert.ok(stage.speechRate > 0 && stage.speechRate <= 1);
      stopSpeech();
    }
  });

  it("gives the browser the stage rate and no second clock", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const app = readFileSync(join(root, "../components/KushimApp.tsx"), "utf8");
    const speech = readFileSync(join(root, "speech.ts"), "utf8");
    const stages = readFileSync(join(root, "stages.ts"), "utf8");
    const calls = app
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("speakBrowser("));
    assert.deepEqual(calls, [
      "else await speakBrowser(text, stage.speechRate, stage.sentenceGapMs, langOf(text));",
      "await speakBrowser(text, stage.speechRate, stage.sentenceGapMs, langOf(text));",
    ]);
    assert.equal(app.includes("speakLeo(audio.audio, audio.mime, text)"), true);
    assert.equal(speech.includes("utterance.rate = rate;"), true);
    assert.equal(speech.includes("utterance.pitch = 0.92;"), true);
    assert.equal(speech.match(/utterance\.pitch/g)?.length, 1);
    assert.equal(speech.includes("estimateSpeechMs(text, rate)"), true);
    assert.equal(speech.includes("estimateSpeechMs(visemeText, 1)"), true);
    assert.equal(
      speech.includes("export async function speakLeo(audioBase64: string, mime: string, text: string)"),
      true,
    );
    assert.equal(/\bpitch\b/.test(stages), false);
  });
});

function applyOpen(rig: ReturnType<typeof createKushim>) {
  rig.lips.scale.set(1.55, 1.38, 1.28);
  rig.jaw.position.y -= 0.008;
}
