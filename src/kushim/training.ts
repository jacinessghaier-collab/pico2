export type Turn = { role: "user" | "assistant"; content: string };

const BORN = "kushim-born-at";
const THREAD = "kushim-thread";
const NAME = "kushim-name";
const VOICE = "kushim-voice";

export function trainingHour(): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = localStorage.getItem(BORN);
  let born = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(born)) {
    born = Date.now();
    localStorage.setItem(BORN, String(born));
  }
  return Math.max(0, Math.floor((Date.now() - born) / 3_600_000));
}

export function loadThread(): Turn[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(THREAD) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Turn =>
          !!item &&
          typeof item === "object" &&
          ((item as Turn).role === "user" || (item as Turn).role === "assistant") &&
          typeof (item as Turn).content === "string",
      )
      .slice(-24);
  } catch {
    return [];
  }
}

export function saveThread(turns: Turn[]) {
  localStorage.setItem(THREAD, JSON.stringify(turns.slice(-24)));
}

export function loadName(): string {
  if (typeof localStorage === "undefined") return "";
  return (localStorage.getItem(NAME) ?? "").slice(0, 24);
}

export function rememberName(text: string): string {
  const match = text.match(/(?:ich hei(?:ß|ss)e|mein name ist|i am|i'm)\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß'-]{1,20})/i);
  if (!match) return loadName();
  const name = match[1];
  localStorage.setItem(NAME, name);
  return name;
}
  export function loadVoice(): { on: boolean; leo: boolean } {
  if (typeof localStorage === "undefined") return { on: true, leo: true };
  const raw = localStorage.getItem(VOICE);
  if (raw === "off") return { on: false, leo: false };
  if (raw === "browser") return { on: true, leo: false };
  return { on: true, leo: true };
}

export function saveVoice(on: boolean, leo: boolean) {
  localStorage.setItem(VOICE, !on ? "off" : leo ? "leo" : "browser");
}
