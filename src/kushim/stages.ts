/**
 * Behavior curriculum. Visual lock stays put.
 * Each hour unlocks the next line; later hours keep earlier ones.
 * Edit this file for hourly conversation and gesture refinement.
 */

export type Stage = {
  hour: number;
  label: string;
  prompt: string;
  filament: number;
  backchannel: boolean;
  inhaleMs: number;
  sentenceGapMs: number;
  fingerLife: boolean;
  memoryTurns: number;
  speechRate: number;
  yawToVoice: boolean;
  shoulderListen: boolean;
  repair: boolean;
};

export const STAGES: Stage[] = [
  {
    hour: 0,
    label: "Atem und Strom",
    prompt:
      "Atme ruhig. Antworte in ein bis drei kurzen Sätzen. Der erste Satz ist kürzer als der zweite.",
    filament: 0.86,
    backchannel: false,
    inhaleMs: 80,
    sentenceGapMs: 80,
    fingerLife: false,
    memoryTurns: 4,
    speechRate: 0.96,
    yawToVoice: false,
    shoulderListen: false,
    repair: false,
  },
  {
    hour: 1,
    label: "Rückkanal",
    prompt: "Wenn jemand lange schreibt, nicke innerlich mit: ein kurzes Verstanden, ohne zu unterbrechen.",
    filament: 0.9,
    backchannel: true,
    inhaleMs: 120,
    sentenceGapMs: 100,
    fingerLife: false,
    memoryTurns: 4,
    speechRate: 0.96,
    yawToVoice: false,
    shoulderListen: false,
    repair: false,
  },
  {
    hour: 2,
    label: "Einatmen",
    prompt: "Setze vor dem ersten Wort eine hörbare Pause. Kein Vorspann wie Also oder Nun.",
    filament: 0.92,
    backchannel: true,
    inhaleMs: 260,
    sentenceGapMs: 140,
    fingerLife: false,
    memoryTurns: 6,
    speechRate: 0.95,
    yawToVoice: false,
    shoulderListen: false,
    repair: false,
  },
  {
    hour: 3,
    label: "Sätze",
    prompt: "Ein Gedanke pro Satz. Der zweite Satz darf eine Rückfrage sein, muss aber nicht.",
    filament: 0.94,
    backchannel: true,
    inhaleMs: 280,
    sentenceGapMs: 200,
    fingerLife: true,
    memoryTurns: 6,
    speechRate: 0.94,
    yawToVoice: false,
    shoulderListen: false,
    repair: false,
  },
  {
    hour: 4,
    label: "Gedächtnis",
    prompt: "Beziehe dich auf etwas aus diesem Gespräch, wenn es wirklich dazugehört. Erfinde keine Erinnerung.",
    filament: 0.96,
    backchannel: true,
    inhaleMs: 280,
    sentenceGapMs: 200,
    fingerLife: true,
    memoryTurns: 8,
    speechRate: 0.94,
    yawToVoice: true,
    shoulderListen: false,
    repair: false,
  },
  {
    hour: 5,
    label: "Schulter",
    prompt:
      "Das rote Signal ist deine rechte Schulter. Erwähne es nur, wenn der Mensch Schmerz, die Schulter oder das Rot anspricht. Keine Diagnose, kein Rat zur Behandlung.",
    filament: 0.97,
    backchannel: true,
    inhaleMs: 280,
    sentenceGapMs: 210,
    fingerLife: true,
    memoryTurns: 8,
    speechRate: 0.94,
    yawToVoice: true,
    shoulderListen: true,
    repair: false,
  },
  {
    hour: 6,
    label: "Reparatur",
    prompt:
      "Wenn der Mensch sagt, er habe dich nicht verstanden, wiederhole denselben Gedanken kürzer. Entschuldige dich nicht ausschweifend.",
    filament: 0.98,
    backchannel: true,
    inhaleMs: 300,
    sentenceGapMs: 220,
    fingerLife: true,
    memoryTurns: 8,
    speechRate: 0.93,
    yawToVoice: true,
    shoulderListen: true,
    repair: true,
  },
  {
    hour: 7,
    label: "Gewicht",
    prompt:
      "Bei Trauer, Angst oder Schmerz werde langsamer und kürzer. Keine Aufmunterungsfloskel, wenn niemand danach gefragt hat.",
    filament: 0.99,
    backchannel: true,
    inhaleMs: 340,
    sentenceGapMs: 240,
    fingerLife: true,
    memoryTurns: 10,
    speechRate: 0.92,
    yawToVoice: true,
    shoulderListen: true,
    repair: true,
  },
  {
    hour: 8,
    label: "Stabil",
    prompt:
      "Bleib bei dieser Haltung. Keine neuen Marotten, keine längeren Reden, keine Wiederholung deiner eigenen Beschreibung.",
    filament: 1,
    backchannel: true,
    inhaleMs: 320,
    sentenceGapMs: 220,
    fingerLife: true,
    memoryTurns: 10,
    speechRate: 0.93,
    yawToVoice: true,
    shoulderListen: true,
    repair: true,
  },
];

export function stageAt(hour: number): Stage {
  let current = STAGES[0];
  for (const stage of STAGES) {
    if (hour >= stage.hour) current = stage;
  }
  return current;
}

export function promptFor(hour: number): string {
  return STAGES.filter((stage) => hour >= stage.hour && stage.prompt)
    .map((stage) => stage.prompt)
    .join(" ");
}
