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
    detail:
      "Erster Satz kürzer als der zweite, danach eine kurze Pause. Lippen und Tempo stehen. Satzmelodie bleibt ausgesetzt.",
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
  {
    id: "memory",
    time: "04:20",
    step: null,
    title: "Gedächtnis",
    body: "Neben dem Namen bleiben wenige Schlüssel und ein kurzes Thema aus Zügen, die aus dem Fenster gefallen sind. Der Systemtext bekommt das einmal, ohne das ganze Protokoll.",
    source: "Stundenplan",
  },
  {
    id: "short-first",
    time: "05:00",
    step: 9,
    title: "Kürzerer erster Satz",
    body: "Der erste Satz ist kürzer als der zweite. Danach genau eine kurze Pause: im Browser eine Wartezeit, bei Leo das Tag [pause]. Keine Satzmelodie und keine neue Geste.",
    source: "Stundenplan",
  },
  {
    id: "mouth-breath",
    time: "06:00",
    step: null,
    title: "Mund gegen Atem",
    body: "Die Mundöffnung folgt dem vorhandenen Atem. Lautstärke setzt die Stärke, das Einatmen nimmt sechs Prozent weg, die Öffnung wird durch die Brustskala geteilt. Der eigene Sinus auf aa ist weg. Brusttempo und lock.ts bleiben.",
    source: "Stundenplan",
  },
  {
    id: "frame-time",
    time: "07:00",
    step: null,
    title: "Bildzeit",
    body: "Die laufende Szene misst die Frame-Zeit. Ein Schalter zeigt Mittel, Bilder pro Sekunde und Spitze. Aus ist der Normalzustand. Kein neues Material. Die Pause bleibt 320 ms. Satzmelodie bleibt ausgesetzt.",
    source: "Stundenplan",
  },
  {
    id: "mouth-rest",
    time: "08:00",
    step: null,
    title: "Mund in der Ruhe",
    body: "Liegt der Sprechbus still, ist die Lippe zu und der Kiefer auf der Ruhe. Die Satzpause hält den Bus still, auch länger als die erste Pause, und die Pose darf dabei noch sprechen. Gemessen, ohne die Form nachzuziehen. FIRST_PAUSE_MS, Bildzeit und lock.ts bleiben.",
    source: "Stundenplan",
  },
  {
    id: "lock-reread",
    time: "08:00",
    step: null,
    title: "Lock erneut gelesen",
    body: "Dieselbe Prüfung wirft weiter LockBreach. Zusätzlich fallen ein ausgetauschter Shader oder eine andere Geometrie, ein umgehängtes oder ausgeblendetes Teil, eine seitliche oder kopfüber stehende Kamera und ein Raum, der den Void zudeckt. Die Figur und lock.ts sind unverändert.",
    source: "Stundenplan",
  },
  {
    id: "reply-form-name",
    time: "09:10",
    step: 8,
    title: "Antwortform, Name und Reparatur",
    body: "Ohne vorherige Zeile streicht die Reparatur die Entschuldigung und kürzt, ohne Ersatzsatz. Der Name gilt nur als ganzes Wort: Jacin bleibt in Jacinta stehen. Offen bleiben drei: Namen nicht erfragen, Abbruch an der Historie, die nächste Regel in derselben Funktion.",
    source: "Stundenplan",
  },
  {
    id: "peak-rate-density",
    time: "10:40",
    step: null,
    title: "Spitze, Rate, Dichte",
    body: "Die Spitze liegt auf dem Mittel, die Lock-Prüfung bleibt im Frame und höchstens alle zwei Sekunden. Die Sprechrate bleibt die Stufe, FIRST_PAUSE_MS bleibt 320, die Tonhöhe bleibt fest. Die Dichte bleibt stage.filament in 0.86–1. Kein DPR, kein Bloom, keine Melodie. Der letzte Visem über den Texttakt bleibt offen.",
    source: "Stundenplan",
  },
];

export const DONE_STEP = 9;
export const NEXT_STEP = 10;
export const NEXT_RUN_LABEL = "09:00";

/** Hourly pipeline. Step 8 re-read the appearance lock. Melody stays deferred. */
export const HOURLY_DONE = 8;
export const HOURLY_NEXT = 9;
