/** Conversation policy. Visual lock stays untouched. */

const APOLOGY = /^(?:es tut mir leid|tut mir leid|entschuldigung|entschuldige|sorry|verzeihung|verzeih)[,.]?\s*/i;

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
  if (/\b(wie|was|wer|wo|wann|warum|wieso|weshalb|wohin|woher|welche[rsmn]?)\b/i.test(t) && !/[.!]\s*$/.test(t)) {
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

export function repairPhrase(previous: string): string {
  const clean = stripLeadingApology(previous.replace(/…+$/u, "").trim());
  const sentence = clean.split(/(?<=[.!?])\s+/).find((part) => part.trim())?.trim() ?? clean;
  let out = stripLeadingApology(sentence);
  if (out.length > 220) out = out.slice(0, 220).replace(/\s+\S*$/, "").trim();
  if (!out) return "Sag den Satz noch einmal.";
  if (!/[.!?]$/.test(out)) out += ".";
  return capitalize(out);
}

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

export function shapeReply(
  say: string,
  opts: { name: string; userText: string; previous?: string },
): string {
  const previous = opts.previous?.trim() ?? "";
  let out = say.trim();
  if (isRepairRequest(opts.userText) && previous) out = repairPhrase(previous);
  else if (!isOpenUtterance(opts.userText)) out = closeUninvitedQuestion(out);
  if (isRepairRequest(opts.userText)) out = stripLeadingApology(out);
  out = mentionNameOnce(out, opts.name);
  return out.replace(/\s{2,}/g, " ").trim();
}

export function cutUtterance(text: string, fraction: number): string {
  if (fraction >= 0.92) return text;
  const cut = Math.max(1, Math.round(text.length * Math.min(1, Math.max(0, fraction))));
  const sliced = text.slice(0, cut).replace(/\s+\S*$/, "").trim();
  if (!sliced) return "…";
  return sliced.endsWith("…") ? sliced : `${sliced}…`;
}

export function trimInterrupted(turns: Array<{ role: "user" | "assistant"; content: string }>, fraction: number) {
  if (fraction >= 0.92 || turns.length === 0) return turns;
  const last = turns[turns.length - 1];
  if (!last || last.role !== "assistant") return turns;
  const content = cutUtterance(last.content, fraction);
  if (content === last.content) return turns;
  return [...turns.slice(0, -1), { ...last, content }];
}
