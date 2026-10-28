import { gapAfterSentence, spokenLines } from "@/kushim/dialogue";
import {
  estimateSpeechMs,
  levelFromBins,
  mouthTransform,
  scheduleVisemes,
  weightsAt,
  type MouthBreath,
  type VisemeFrame,
} from "@/kushim/lipsync";

let current: HTMLAudioElement | null = null;
let token = 0;
let lastFraction = 1;

type Bus = {
  active: boolean;
  mode: "audio" | "timed";
  frames: VisemeFrame[];
  startedAt: number;
  durationMs: number;
  audio: HTMLAudioElement | null;
  analyser: AnalyserNode | null;
  bins: Uint8Array<ArrayBuffer> | null;
  close: (() => void) | null;
  partIndex: number;
  partCount: number;
};

const bus: Bus = {
  active: false,
  mode: "timed",
  frames: [],
  startedAt: 0,
  durationMs: 0,
  audio: null,
  analyser: null,
  bins: null,
  close: null,
  partIndex: 0,
  partCount: 1,
};

function resetBus() {
  bus.close?.();
  bus.active = false;
  bus.frames = [];
  bus.durationMs = 0;
  bus.audio = null;
  bus.analyser = null;
  bus.bins = null;
  bus.close = null;
  bus.partIndex = 0;
  bus.partCount = 1;
}

function liveFraction(): number {
  if (!bus.active) return 0;
  let local = 0;
  if (bus.mode === "audio" && bus.audio && Number.isFinite(bus.audio.duration) && bus.audio.duration > 0) {
    local = bus.audio.currentTime / bus.audio.duration;
  } else if (bus.durationMs > 0) {
    local = (performance.now() - bus.startedAt) / bus.durationMs;
  }
  local = Math.max(0, Math.min(1, local));
  return (bus.partIndex + local) / Math.max(1, bus.partCount);
}

export function spokenFraction(): number {
  if (bus.active) return liveFraction();
  return lastFraction;
}

export function stopSpeech() {
  lastFraction = bus.active ? liveFraction() : 1;
  token += 1;
  resetBus();
  if (current) {
    current.pause();
    current.src = "";
    current = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function armTimed(text: string, rate: number, partIndex: number, partCount: number) {
  bus.close?.();
  bus.close = null;
  bus.analyser = null;
  bus.audio = null;
  bus.mode = "timed";
  bus.partIndex = partIndex;
  bus.partCount = partCount;
  bus.durationMs = estimateSpeechMs(text, rate);
  bus.frames = scheduleVisemes(text, bus.durationMs);
  bus.startedAt = performance.now();
  bus.active = true;
}

function attachAnalyser(audio: HTMLAudioElement) {
  const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.65;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  void ctx.resume();
  bus.analyser = analyser;
  bus.bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  bus.close = () => {
    source.disconnect();
    analyser.disconnect();
    void ctx.close();
  };
}

export function sampleSpeechMouth(reduced: boolean, breath?: MouthBreath) {
  const rest = { speaking: false, level: 0, sx: 1, sy: 1, sz: 1, jaw: 0 };
  // Idle, including the sentence gap. Frames from the last line stay stored
  // until the next arm and must not move the mouth.
  if (!bus.active) return rest;
  let elapsedMs = 0;
  let level = 0.85;
  if (bus.mode === "audio" && bus.audio) {
    elapsedMs = bus.audio.currentTime * 1000;
    if (bus.analyser && bus.bins) {
      bus.analyser.getByteFrequencyData(bus.bins);
      level = levelFromBins(bus.bins);
    }
  } else {
    elapsedMs = performance.now() - bus.startedAt;
  }
  // weightsAt keeps the last shape for any later sample. The text clock can
  // finish before utterance.onend; past it the mouth is the same rest as idle.
  // No fade. The estimate may be shorter than the voice.
  if (bus.mode === "timed" && bus.durationMs > 0 && elapsedMs >= bus.durationMs) return rest;
  const shaped = mouthTransform(weightsAt(bus.frames, elapsedMs), level, reduced, breath);
  return { speaking: true, level, ...shaped };
}

function pickVoice(langHint: string) {
  const voices = window.speechSynthesis.getVoices();
  const lang = langHint.toLowerCase();
  const same = voices.filter((voice) => voice.lang.toLowerCase().startsWith(lang));
  return (
    same.find((voice) => /male|markus|stefan|hans|leo|daniel/i.test(voice.name)) ??
    same[0] ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(lang.slice(0, 2))) ??
    null
  );
}

export function speakBrowser(text: string, rate: number, gapMs: number, lang: string) {
  const mine = ++token;
  const parts = spokenLines(text);
  const lines = parts.length > 0 ? parts : [text];
  return new Promise<void>((resolve) => {
    const step = (index: number) => {
      if (mine !== token) {
        resolve();
        return;
      }
      if (index >= lines.length) {
        resetBus();
        lastFraction = 1;
        resolve();
        return;
      }
      const line = lines[index];
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = 0.92;
      const voice = pickVoice(lang);
      if (voice) utterance.voice = voice;
      armTimed(line, rate, index, lines.length);
      utterance.onend = () => {
        if (mine !== token) {
          resolve();
          return;
        }
        bus.active = false;
        window.setTimeout(() => step(index + 1), gapAfterSentence(index, lines.length, gapMs));
      };
      utterance.onerror = () => {
        resetBus();
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    };
    const start = () => step(0);
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        start();
      };
    } else start();
  });
}

export async function speakLeo(audioBase64: string, mime: string, text: string) {
  const mine = ++token;
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  if (mine !== token) {
    URL.revokeObjectURL(url);
    return;
  }
  const audio = new Audio(url);
  current = audio;
  bus.mode = "audio";
  bus.audio = audio;
  bus.partIndex = 0;
  bus.partCount = 1;
  const visemeText = spokenLines(text).join(" ");
  bus.frames = scheduleVisemes(visemeText, estimateSpeechMs(visemeText, 1));
  bus.durationMs = estimateSpeechMs(visemeText, 1);
  bus.startedAt = performance.now();
  bus.active = true;
  try {
    attachAnalyser(audio);
  } catch {
    bus.analyser = null;
  }
  audio.onloadedmetadata = () => {
    if (mine !== token || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    bus.durationMs = audio.duration * 1000;
    bus.frames = scheduleVisemes(visemeText, bus.durationMs);
  };
  await new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().catch(() => resolve());
  });
  URL.revokeObjectURL(url);
  if (current === audio) current = null;
  if (mine === token) {
    lastFraction = 1;
    resetBus();
  }
}
