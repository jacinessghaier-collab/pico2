/**
 * Build stand for the live avatar. Same shape as Pico's kushim-stand.
 * Training hour (stages.ts) is separate from these build steps.
 */

export type Step = {
  id: number;
  title: string;
  detail: string;
};

export type Change = {
  id: string;
  time: string;
  step: number | null;
  title: string;
  body: string;
  source: string;
};

export const STEPS: Step[] = [
  {
    id: 1,
    title: "Proportionen und Silhouette",
    detail: "Erwachsener Mensch, acht Kopflängen. Form liegt in lock.ts.",
  },
  {
    id: 2,
    title: "Gelenke, Gewicht, Atmung",
    detail: "Stand mittig, Gelenke gedämpft, Atem im Brustkorb. Kein Gang.",
  },
  {
    id: 3,
    title: "Durchsichtiges Material",
    detail: "Glas aus Licht, Fresnel, keine milchige Hülle und keine zweite Haut.",
  },
  {
    id: 4,
    title: "Stromflüsse und Helligkeit",
    detail: "Filamente folgen den Gliedern. Dichte steigt mit der Trainingsstunde.",
  },
  {
    id: 5,
    title: "Aura",
    detail: "Die Fresnel-Hülle ist die Aura. Keine zweite Schale über der Silhouette.",
  },
  {
    id: 6,
    title: "Idle und Mikrogesten",
    detail: "Augen blinzeln gemeinsam. Blick folgt leicht. Gewicht bleibt mittig.",
  },
  {
    id: 7,
    title: "Gesprächsgesten",
    detail: "Idle, zuhören, denken, sprechen, erklären, nicken, mitfühlen. Nicht auf jede Silbe.",
  },
  {
    id: 8,
    title: "Gesprächsverhalten",
    detail: "Name einmal, Abbruch, Rückfrage nur bei offenem Satz, Reparatur ohne Entschuldigung.",
  },
  {
    id: 9,
    title: "Sprache",
    detail: "Tempo, Pausen, Lippen. Satzmelodie und ein kürzerer erster Satz fehlen noch.",
  },
  {
    id: 10,
    title: "Stabilitätscheck",
    detail: "lock.ts bleibt unangetastet. Danach keine neuen Marotten.",
  },
];

export const CHANGES: Change[] = [
  {
    id: "lock-body",
    time: "27.10.",
    step: 1,
    title: "Silhouette gesperrt",
    body: "Proportionen, Farben und die eine rote Schulter liegen in lock.ts. Die laufende Figur ist das prozedurale Rig, kein VRM.",
    source: "pico2",
  },
  {
    id: "gestures-live",
    time: "27.10.",
    step: 7,
    title: "Gesten in der laufenden Szene",
    body: "motion.ts trägt idle, listen, think, speak, explain, acknowledge, empathize. Das Artefakt GestureLayer bleibt Referenz: es setzt ein VRM voraus und würde die gesperrte Form ersetzen. emphasis aus dem Modell wird als explain gelesen. Rot nur, wenn die Schulter angesprochen wird.",
    source: "pico2",
  },
  {
    id: "talk-policy",
    time: "03:10",
    step: 8,
    title: "Gesprächsregeln",
    body: "Der Name fällt höchstens einmal und wird nie abgefragt. Eine Unterbrechung bricht den Satz ab, die nächste Antwort gilt dem neuen Thema. Eine Rückfrage nur bei einem offenen Satz. Bei Nicht-Verstanden derselbe Inhalt in einem Satz, ohne Entschuldigung.",
    source: "Stundenplan",
  },
  {
    id: "lipsync",
    time: "03:10",
    step: 9,
    title: "Lippensynchron",
    body: "Viseme aa, ih, ou, ee, oh auf dem vorhandenen Mund. Leo über die Frequenzbänder, sonst der Texttakt. Blick mit Lerp 0.10. Blinzeln 3,6 bis 6,4 Sekunden, beide Augen, ohne Kopplung an die Silbe. three-vrm-lip-sync entfällt: dieses Rig hat keine Blendshapes.",
    source: "Stundenplan",
  },
];

export const DONE_STEP = 8;
export const NEXT_STEP = 9;
export const NEXT_RUN_LABEL = "04:00";

/** Hourly pipeline. Step 4 lip-sync is in the live scene. */
export const HOURLY_DONE = 4;
export const HOURLY_NEXT = 5;
