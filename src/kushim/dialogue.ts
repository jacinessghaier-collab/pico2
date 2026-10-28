/** Conversation policy. Visual lock stays untouched. */

const APOLOGY =
  /^(?:es tut mir leid|tut mir leid|entschuldigung|entschuldige|sorry|verzeihung|verzeih)[,.]?\s*/i;

const REPAIR =
  /nicht verstanden|wie bitte|noch\s?mal|nochmal|verstehe(?: ich)? nicht|was meinst|wiederhol|say that again|come again|\bwhat\?|\bwas\?|\bhä\b|\bhae\b/i;

export function stripLeadingApology(text: string): string {
  let out = text.trim();
  while (APOLOGY.test(out)) out = out.replace(APOLOGY, "").trim();
  return out;
}

export function isRepairRequest(text: string): boolean {
  return REPAIR.test(text.trim());
}

export function isOpenUtterance(text: string): boolean {
  const t = text.trim();
  if (!t || isRepairRequest(t)) return false;
  if (/[?？]\s*$/.test(t)) return true;
  if (/\b(oder|weil|dass|wenn|ob|sowie)\s*$/i.test(t)) return true;
  if (/[,:;]\s*$/.test(t)) return true;
  if (
    /\b(wie|was|wer|wo|wann|warum|wieso|weshalb|wohin|woher|welche[rsmn]?)\b/i.test(t) &&
    !/[.!]\s*$/.test(t)
  ) {
    return true;
  }
  return false;
}

export function closeUninvitedQuestion(say: string): string {
  const parts = say
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const kept = parts.filter((part) => !part.endsWith("?"));
  if (kept.length > 0) return kept.join(" ");
  return say
    .replace(/\?/g, ".")
    .replace(/\.{2,}/g, ".")
    .trim();
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One brief hold after the short opening sentence. Not a melody. */
export const FIRST_PAUSE_MS = 320;

const FIRST_MAX_WORDS = 8;

const FUNCTION = new Set([
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einer",
  "einem",
  "einen",
  "eines",
  "und",
  "oder",
  "aber",
  "denn",
  "sondern",
  "mit",
  "in",
  "im",
  "an",
  "am",
  "auf",
  "zu",
  "zur",
  "zum",
  "für",
  "fuer",
  "von",
  "vom",
  "aus",
  "nach",
  "bei",
  "beim",
  "vor",
  "über",
  "ueber",
  "unter",
  "durch",
  "ohne",
  "um",
  "als",
  "dass",
  "weil",
  "wenn",
  "ob",
  "sowie",
  "mein",
  "meine",
  "meiner",
  "meinem",
  "meinen",
  "dein",
  "deine",
  "deiner",
  "deinem",
  "deinen",
  "sein",
  "seine",
  "seiner",
  "seinem",
  "seinen",
  "ihr",
  "ihre",
  "ihrer",
  "ihrem",
  "ihren",
]);

export function stripPauseTags(text: string): string {
  return text
    .replace(/\s*\[(?:long-)?pause\]\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function bare(word: string): string {
  return word.toLowerCase().replace(/^[„"«(\[]+|[»"')\],:;!.?…]+$/gu, "");
}

function isFunction(word: string): boolean {
  return FUNCTION.has(bare(word));
}

function canEnd(word: string): boolean {
  const token = bare(word);
  return token.length > 0 && !FUNCTION.has(token);
}

function plainWords(sentence: string): string[] {
  return sentence
    .replace(/[.!?…]+$/u, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function ensureEnd(text: string): string {
  const trimmed = text
    .trim()
    .replace(/[,:;]+$/u, "")
    .trim();
  if (!trimmed) return "";
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function wordCount(sentence: string): number {
  return plainWords(sentence).length;
}

function audibleShorter(first: string, second: string): boolean {
  const a = wordCount(first);
  const b = wordCount(second);
  if (a !== b) return a < b;
  return first.trim().length < second.trim().length;
}

function openingIsShort(sentences: string[]): boolean {
  if (sentences.length === 0) return false;
  const first = sentences[0] ?? "";
  const count = wordCount(first);
  if (count > FIRST_MAX_WORDS || count === 0) return false;
  const last = plainWords(first).at(-1) ?? "";
  if (count > 1 && !canEnd(last)) return false;
  if (sentences.length === 1) return true;
  return audibleShorter(first, sentences[1] ?? "");
}

/** Clean clause before a comma or a function word. Prefer at most five words, never more than eight. */
function cleanCut(words: string[]): number {
  const limit = Math.min(FIRST_MAX_WORDS, words.length - 1);
  const shorter: number[] = [];
  const any: number[] = [];
  for (let i = 2; i <= limit; i++) {
    const token = words[i - 1] ?? "";
    if (!canEnd(token)) continue;
    const clause = /[,;:—–-]$/u.test(token);
    const beforeFunction = isFunction(words[i] ?? "");
    if (!clause && !beforeFunction) continue;
    any.push(i);
    const head = ensureEnd(words.slice(0, i).join(" "));
    const tail = ensureEnd(capitalize(words.slice(i).join(" ")));
    if (audibleShorter(head, tail)) shorter.push(i);
  }
  const preferred = shorter.filter((i) => i <= 5);
  if (preferred.length > 0) return preferred[preferred.length - 1] ?? -1;
  if (shorter.length > 0) return shorter[shorter.length - 1] ?? -1;
  return any[any.length - 1] ?? -1;
}

/**
 * The opening sentence stays within eight words and, when another sentence
 * follows, audibly shorter than that sentence. Words move forward; nothing is dropped.
 * A one-sentence repair is left to the caller.
 */
export function shortenFirstSentence(text: string): string {
  const cleaned = stripPauseTags(text);
  if (!cleaned) return "";
  const parts = splitSentences(cleaned);
  if (parts.length === 0) return "";
  const normalized = parts.map((part) => ensureEnd(part));
  if (openingIsShort(normalized)) return normalized.join(" ");

  const firstWords = plainWords(parts[0] ?? "");
  const rest = parts.slice(1).map((part) => ensureEnd(part));
  if (firstWords.length < 2) return normalized.join(" ");

  const cut = cleanCut(firstWords);
  let sentences: string[];
  if (cut > 0) {
    sentences = [
      ensureEnd(firstWords.slice(0, cut).join(" ")),
      ensureEnd(capitalize(firstWords.slice(cut).join(" "))),
      ...rest,
    ];
  } else if (firstWords.length > FIRST_MAX_WORDS) {
    const keep = Math.min(FIRST_MAX_WORDS, Math.max(2, Math.floor((firstWords.length - 1) / 2)));
    let end = keep;
    while (end > 2 && !canEnd(firstWords[end - 1] ?? "")) end -= 1;
    sentences = [
      ensureEnd(firstWords.slice(0, end).join(" ")),
      ensureEnd(capitalize(firstWords.slice(end).join(" "))),
      ...rest,
    ];
  } else {
    sentences = [ensureEnd(firstWords.join(" ")), ...rest];
  }

  while (sentences.length >= 3 && !audibleShorter(sentences[0] ?? "", sentences[1] ?? "")) {
    const next = sentences[2] ?? "";
    const glued = `${(sentences[1] ?? "").replace(/[.!?]$/u, "")}, ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
    sentences = [sentences[0] ?? "", ensureEnd(glued), ...sentences.slice(3)];
  }
  if (!openingIsShort(sentences)) return normalized.join(" ");
  return sentences.filter(Boolean).join(" ");
}

export function spokenLines(text: string): string[] {
  const clean = stripPauseTags(text);
  if (!clean) return [];
  const parts = splitSentences(clean);
  return parts.length > 0 ? parts : [clean];
}

/** Leo hears one short pause after the opening sentence. The chat text stays clean. */
export function textForLeo(text: string): string {
  const lines = spokenLines(text);
  if (lines.length < 2) return lines[0] ?? "";
  return `${lines[0]} [pause] ${lines.slice(1).join(" ")}`;
}

/** Browser voice: one short hold after the first sentence, then the usual gap. */
export function gapAfterSentence(index: number, count: number, gapMs: number): number {
  if (count > 1 && index === 0) return Math.max(gapMs, FIRST_PAUSE_MS);
  return gapMs;
}

export function repairPhrase(previous: string): string {
  const clean = stripLeadingApology(previous.replace(/…+$/u, "").trim());
  const sentence =
    clean
      .split(/(?<=[.!?])\s+/)
      .find((part) => part.trim())
      ?.trim() ?? clean;
  let out = stripLeadingApology(sentence);
  if (out.length > 220)
    out = out
      .slice(0, 220)
      .replace(/\s+\S*$/, "")
      .trim();
  if (!out) return "Sag den Satz noch einmal.";
  if (!/[.!?]$/.test(out)) out += ".";
  return capitalize(out);
}

/** Reply form. The only arguments `shapeReply` accepts. */
export type ReplyShape = {
  name: string;
  userText: string;
  previous?: string;
};

export function mentionNameOnce(say: string, name: string): string {
  const clean = name.trim();
  if (!clean) return say.trim();
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  let seen = false;
  return say
    .replace(re, (hit) => {
      if (seen) return "";
      seen = true;
      return hit;
    })
    .replace(/\s+([,.:;!?])/g, "$1")
    .replace(/([,.:;])\s*([,.:;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.!?])/g, "$1")
    .trim();
}

/**
 * The only reply-form path. Call it once on raw model or fallback text.
 *
 * It alone applies, in this order: pause-tag strip, repair from the previous
 * line, dropping an uninvited question, stripping a leading apology on a
 * repair, the name at most once, and the short first sentence.
 * A second call with the same arguments is a no-op.
 *
 * Do not shape again in the surface, and do not restate these rules in the
 * system text or the stage lines. `trimInterrupted` cuts a spoken line in
 * history; it is not a second form. The one voice pause is `textForLeo` /
 * `gapAfterSentence`, and it never lands in the chat text.
 * Asking for the name is not stripped here.
 */
export function shapeReply(say: string, opts: ReplyShape): string {
  const previous = opts.previous?.trim() ?? "";
  const repaired = isRepairRequest(opts.userText) && previous.length > 0;
  let out = stripPauseTags(say);
  if (repaired) out = repairPhrase(previous);
  else if (!isOpenUtterance(opts.userText)) out = closeUninvitedQuestion(out);
  if (isRepairRequest(opts.userText)) out = stripLeadingApology(out);
  out = mentionNameOnce(out, opts.name);
  if (!repaired) out = shortenFirstSentence(out);
  return stripPauseTags(out)
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function cutUtterance(text: string, fraction: number): string {
  if (fraction >= 0.92) return text;
  const cut = Math.max(1, Math.round(text.length * Math.min(1, Math.max(0, fraction))));
  const sliced = text
    .slice(0, cut)
    .replace(/\s+\S*$/, "")
    .trim();
  if (!sliced) return "…";
  return sliced.endsWith("…") ? sliced : `${sliced}…`;
}

export function trimInterrupted(
  turns: Array<{ role: "user" | "assistant"; content: string }>,
  fraction: number,
) {
  if (fraction >= 0.92 || turns.length === 0) return turns;
  const last = turns[turns.length - 1];
  if (!last || last.role !== "assistant") return turns;
  const content = cutUtterance(last.content, fraction);
  if (content === last.content) return turns;
  return [...turns.slice(0, -1), { ...last, content }];
}
