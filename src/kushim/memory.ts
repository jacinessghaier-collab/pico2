/** Durable facts and a short digest of turns that left the recent window. */

import { isRepairRequest } from "./dialogue.ts";

type Line = { role: "user" | "assistant"; content: string };

const STORE = "kushim-memory";
const MAX_VALUE = 72;
const MAX_NOTE = 88;
const MAX_EARLIER = 5;
const MAX_PROMPT = 420;
const MAX_SEEN = 48;

export type FactKey =
  "wohnort" | "herkunft" | "arbeit" | "sprache" | "mag" | "ungern" | "bezug" | "merk";

export type DurableMemory = {
  facts: Partial<Record<FactKey, string>>;
  /** Latest substantive user line that has left the recent window. */
  thema: string;
  /** Older user lines, oldest first, already outside that window. */
  earlier: string[];
  seen: string[];
};

const FACT_KEYS: FactKey[] = [
  "wohnort",
  "herkunft",
  "arbeit",
  "sprache",
  "mag",
  "ungern",
  "bezug",
  "merk",
];

const LABELS: Record<FactKey, string> = {
  wohnort: "Wohnort",
  herkunft: "Herkunft",
  arbeit: "Arbeit",
  sprache: "Sprache",
  mag: "Mag",
  ungern: "Mag nicht",
  bezug: "Bezug",
  merk: "Merken",
};

const VAGUE = /^(hier|da|dort|there|here|somewhere|nirgends|etwas|nichts)$/i;
const GREETING =
  /^(hi|hey|hallo|guten tag|guten morgen|guten abend|moin|servus|danke|thanks|thank you|ok|okay|ja|nein|yes|no)[.!]?$/i;

export function emptyMemory(): DurableMemory {
  return { facts: {}, thema: "", earlier: [], seen: [] };
}

function clip(text: string, max: number): string {
  const clean = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…]+$/u, "")
    .trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max);
  const word = sliced.replace(/\s+\S*$/u, "").trim();
  return word.length >= 8 ? word : sliced.trim();
}

function takePhrase(raw: string): string {
  const cut = raw.split(/\s+und\s+(?:ich|arbeite|wohne|komme|mag)\b/i)[0] ?? raw;
  const value = clip(cut, MAX_VALUE);
  return VAGUE.test(value) ? "" : value;
}

function titleWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function languageName(raw: string): string {
  if (/engl|english/i.test(raw)) return "Englisch";
  if (/deut|german/i.test(raw)) return "Deutsch";
  return takePhrase(raw);
}

function fingerprint(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
}

function cloneMemory(prev: DurableMemory): DurableMemory {
  return {
    facts: { ...prev.facts },
    thema: prev.thema,
    earlier: [...prev.earlier],
    seen: [...prev.seen],
  };
}

const RULES: Array<{ key: Exclude<FactKey, "bezug" | "sprache">; re: RegExp }> = [
  {
    key: "wohnort",
    re: /(?:ich wohne (?:in|bei)|i live in)\s+([A-Za-zÄÖÜäöüß][\p{L}.'’ -]{1,48})/iu,
  },
  {
    key: "herkunft",
    re: /(?:ich komme aus|ich stamme aus|i(?:'m| am) from)\s+([A-Za-zÄÖÜäöüß][\p{L}.'’ -]{1,48})/iu,
  },
  {
    key: "arbeit",
    re: /(?:ich arbeite als|arbeite als|mein beruf ist|von beruf bin ich|i work as(?: an?)?)\s+([A-Za-zÄÖÜäöüß][\p{L}.'’ -]{1,48})/iu,
  },
  {
    key: "ungern",
    re: /(?:ich mag\s+(?:kein(?:e|en|em)?|nicht)|ich hasse|i (?:don't|do not) like|i hate)\s+([^,.!?]{2,48})/iu,
  },
  {
    key: "mag",
    re: /(?:ich mag|ich liebe|am liebsten mag ich|i like|i love)\s+(?!kein(?:e|en|em)?\b|nicht\b)([^,.!?]{2,48})/iu,
  },
  {
    key: "merk",
    re: /(?:bitte\s+)?(?:merk(?:e)?\s+dir|remember(?:\s+that)?)\s*[:,]?\s+([^.]{3,90})/iu,
  },
];

const SPRACHE =
  /(?:sprich(?:\s+bitte)?(?:\s+mit mir)?(?:\s+auf)?|bitte auf|i prefer)\s+(deutsch|englisch|german|english)/iu;

const BEZUG =
  /\bmein(?:e)?\s+(schwester|bruder|partnerin|partner|frau|mann|tochter|sohn|mutter|vater|freundin|freund|hund|katze)\s+(?:heißt|ist)\s+([A-Za-zÄÖÜäöüß][\p{L}'’-]{1,24})/iu;

function mergeBezug(prev: string | undefined, next: string): string {
  const relation = next.split(" ")[0]?.toLowerCase() ?? "";
  const parts = (prev ?? "")
    .split(", ")
    .filter(Boolean)
    .filter((part) => !part.toLowerCase().startsWith(`${relation} `));
  parts.push(next);
  return clip(parts.join(", "), MAX_VALUE);
}

function applyFacts(memory: DurableMemory, text: string) {
  for (const rule of RULES) {
    const match = text.match(rule.re);
    if (!match?.[1]) continue;
    const value = takePhrase(match[1]);
    if (!value) continue;
    memory.facts[rule.key] = value;
  }
  const language = text.match(SPRACHE);
  if (language?.[1]) {
    const value = languageName(language[1]);
    if (value) memory.facts.sprache = value;
  }
  const person = text.match(BEZUG);
  if (person?.[1] && person[2]) {
    const value = `${titleWord(person[1])} ${clip(person[2], 24)}`;
    memory.facts.bezug = mergeBezug(memory.facts.bezug, value);
  }
}

const FORGET_KEY: Array<{ key: FactKey; re: RegExp }> = [
  { key: "wohnort", re: /vergiss (?:meinen )?wohnort|forget where i live/i },
  { key: "herkunft", re: /vergiss (?:meine )?herkunft|forget where i(?:'m| am) from/i },
  { key: "arbeit", re: /vergiss (?:meine )?arbeit|vergiss meinen beruf|forget (?:my )?job/i },
  { key: "mag", re: /vergiss was ich mag|forget what i like/i },
  { key: "ungern", re: /vergiss was ich nicht mag/i },
  { key: "bezug", re: /vergiss (?:meinen bezug|meine leute)|forget (?:my )?(?:people|family)/i },
  { key: "merk", re: /vergiss was du dir merken|forget what i told you to remember/i },
  { key: "sprache", re: /vergiss (?:die |meine )?sprache|forget (?:the |my )?language/i },
];

function applyForget(
  memory: DurableMemory,
  text: string,
  turns: readonly Line[],
): { clearName: boolean; clearAll: boolean } {
  const clearAll =
    /vergiss alles|vergiss das alles|forget everything|lösch(?:e)? (?:bitte )?(?:dein |das )?gedächtnis/i.test(
      text,
    );
  const clearName = clearAll || /vergiss meinen namen|forget my name/i.test(text);
  if (clearAll) {
    memory.facts = {};
    memory.thema = "";
    memory.earlier = [];
    memory.seen = turns
      .filter((turn) => turn.role === "user")
      .map((turn) => fingerprint(turn.content))
      .slice(-MAX_SEEN);
    return { clearName, clearAll };
  }
  for (const item of FORGET_KEY) {
    if (item.re.test(text)) delete memory.facts[item.key];
  }
  if (
    /vergiss (?:das thema|worüber wir gesprochen haben)|forget (?:the topic|what we talked about)/i.test(
      text,
    )
  ) {
    memory.thema = "";
    memory.earlier = [];
  }
  return { clearName, clearAll };
}

function substantive(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 18) return "";
  if (GREETING.test(clean)) return "";
  if (isRepairRequest(clean)) return "";
  if (/[?？]\s*$/.test(clean) && clean.length < 48) return "";
  const sentences = clean
    .split(/(?<=[.!?？])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (/[?？]\s*$/.test(sentence) && sentence.length < 48) continue;
    const note = clip(sentence, MAX_NOTE);
    if (note.length >= 18 && !GREETING.test(note)) return note;
  }
  return "";
}

function coveredByFacts(note: string, facts: DurableMemory["facts"]): boolean {
  let rest = note.toLowerCase();
  for (const value of Object.values(facts)) {
    if (!value) continue;
    rest = rest.replaceAll(value.toLowerCase(), " ");
  }
  rest = rest.replace(
    /\b(ich|hei(?:ß|ss)e|wohne|in|und|arbeite|als|mein|meine|name|ist|bin|mag|keinen|keine|komme|aus|bitte|dir)\b/gi,
    " ",
  );
  rest = rest.replace(/[^a-zäöüß]+/gi, " ").trim();
  return rest.length < 12;
}

function fold(memory: DurableMemory, turns: readonly Line[], windowTurns: number) {
  const window = Math.max(0, Math.floor(windowTurns));
  const older = turns.slice(0, Math.max(0, turns.length - window));
  const recent = turns.slice(Math.max(0, turns.length - window));
  const recentBlob = recent
    .map((turn) => turn.content)
    .join("\n")
    .toLowerCase();

  for (const turn of older) {
    if (turn.role !== "user") continue;
    const id = fingerprint(turn.content);
    if (memory.seen.includes(id)) continue;
    memory.seen.push(id);
    const note = substantive(turn.content);
    if (!note || coveredByFacts(note, memory.facts)) continue;
    if (note.toLowerCase() === memory.thema.toLowerCase()) continue;
    if (memory.thema) memory.earlier.push(memory.thema);
    memory.thema = note;
  }

  if (memory.thema && recentBlob.includes(memory.thema.toLowerCase())) memory.thema = "";
  const unique: string[] = [];
  for (const note of memory.earlier) {
    if (recentBlob.includes(note.toLowerCase())) continue;
    if (note.toLowerCase() === memory.thema.toLowerCase()) continue;
    if (unique.some((item) => item.toLowerCase() === note.toLowerCase())) continue;
    unique.push(note);
  }
  memory.earlier = unique.slice(-MAX_EARLIER);
  memory.seen = memory.seen.slice(-MAX_SEEN);
}

export function absorbMemory(
  prev: DurableMemory,
  userText: string,
  turns: readonly Line[],
  windowTurns: number,
): { memory: DurableMemory; clearName: boolean } {
  const memory = cloneMemory(prev);
  const forgotten = applyForget(memory, userText, turns);
  applyFacts(memory, userText);
  if (!forgotten.clearAll) fold(memory, turns, windowTurns);
  return { memory, clearName: forgotten.clearName };
}

export function memoryPrompt(memory: DurableMemory): string {
  const bits: string[] = [];
  for (const key of FACT_KEYS) {
    const value = memory.facts[key];
    if (value) bits.push(`${LABELS[key]}: ${value}`);
  }
  if (memory.thema) bits.push(`Thema davor: ${memory.thema}`);
  if (memory.earlier.length > 0) bits.push(`Noch davor: ${memory.earlier.slice(-3).join(" · ")}`);
  const text = bits.join(". ");
  if (text.length <= MAX_PROMPT) return text;
  return text
    .slice(0, MAX_PROMPT)
    .replace(/\s+\S*$/u, "")
    .trim();
}

export function acceptMemory(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let text = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    text += code < 32 ? " " : ch;
  }
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT);
}

function englishQuestion(text: string): boolean {
  return /\b(what|where|who|my)\b/i.test(text) && !/[äöüß]/i.test(text);
}

export function recallReply(user: string, memory: DurableMemory, name: string): string | null {
  const text = user.trim();
  if (!text || isRepairRequest(text)) return null;
  const en = englishQuestion(text);
  if (/(?:wie hei(?:ß|ss)e ich|wie ist mein name|what(?:'s| is) my name)/i.test(text)) {
    if (!name) return null;
    return en ? `Your name is ${name}.` : `Du heißt ${name}.`;
  }
  if (/(?:wo wohne ich|where do i live)/i.test(text) && memory.facts.wohnort) {
    return en ? `You live in ${memory.facts.wohnort}.` : `Du wohnst in ${memory.facts.wohnort}.`;
  }
  if (
    /(?:woher komme ich|where am i from|where do i come from)/i.test(text) &&
    memory.facts.herkunft
  ) {
    return en
      ? `You come from ${memory.facts.herkunft}.`
      : `Du kommst aus ${memory.facts.herkunft}.`;
  }
  if (
    /(?:was arbeite ich|was mache ich beruflich|was ist mein beruf|what do i do for work|what(?:'s| is) my job)/i.test(
      text,
    ) &&
    memory.facts.arbeit
  ) {
    return en ? `You work as ${memory.facts.arbeit}.` : `Du arbeitest als ${memory.facts.arbeit}.`;
  }
  if (/(?:was mag ich|what do i like)/i.test(text) && memory.facts.mag) {
    return en ? `You like ${memory.facts.mag}.` : `Du magst ${memory.facts.mag}.`;
  }
  if (/(?:was sollst du dir merken|what should you remember)/i.test(text) && memory.facts.merk) {
    return en
      ? `You asked me to remember: ${memory.facts.merk}.`
      : `Du wolltest, dass ich mir merke: ${memory.facts.merk}.`;
  }
  if (
    /(?:worüber haben wir|was war das thema|erinnerst du dich|what were we (?:talking|speaking) about)/i.test(
      text,
    )
  ) {
    if (memory.thema)
      return en
        ? `Before that it was about: ${memory.thema}.`
        : `Davor ging es darum: ${memory.thema}.`;
    if (memory.earlier.length > 0) {
      const last = memory.earlier[memory.earlier.length - 1] ?? "";
      return en ? `Before that it was about: ${last}.` : `Davor ging es darum: ${last}.`;
    }
  }
  return null;
}

export function loadMemory(): DurableMemory {
  if (typeof localStorage === "undefined") return emptyMemory();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) ?? "") as unknown;
    if (!parsed || typeof parsed !== "object") return emptyMemory();
    const rec = parsed as { facts?: unknown; thema?: unknown; earlier?: unknown; seen?: unknown };
    const facts: DurableMemory["facts"] = {};
    if (rec.facts && typeof rec.facts === "object") {
      for (const key of FACT_KEYS) {
        const value = (rec.facts as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) facts[key] = clip(value, MAX_VALUE);
      }
    }
    const earlier = Array.isArray(rec.earlier)
      ? rec.earlier
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => clip(item, MAX_NOTE))
          .slice(-MAX_EARLIER)
      : [];
    const seen = Array.isArray(rec.seen)
      ? rec.seen.filter((item): item is string => typeof item === "string").slice(-MAX_SEEN)
      : [];
    return {
      facts,
      thema: typeof rec.thema === "string" ? clip(rec.thema, MAX_NOTE) : "",
      earlier,
      seen,
    };
  } catch {
    return emptyMemory();
  }
}

export function saveMemory(memory: DurableMemory) {
  if (typeof localStorage === "undefined") return;
  const compact: DurableMemory = {
    facts: memory.facts,
    thema: memory.thema,
    earlier: memory.earlier.slice(-MAX_EARLIER),
    seen: memory.seen.slice(-MAX_SEEN),
  };
  localStorage.setItem(STORE, JSON.stringify(compact));
}
