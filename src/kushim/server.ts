import { createServerFn } from "@tanstack/react-start";
import { shapeReply } from "@/kushim/dialogue";
import { isGesture, type Gesture } from "@/kushim/lock";
import { promptFor } from "@/kushim/stages";

type Turn = { role: "user" | "assistant"; content: string };

const hits: number[] = [];
const voiceHits: number[] = [];

function allow(bucket: number[], limit: number) {
  const now = Date.now();
  while (bucket.length > 0 && now - bucket[0] > 60_000) bucket.shift();
  if (bucket.length >= limit) return false;
  bucket.push(now);
  return true;
}

function asTurns(input: unknown): { turns: Turn[]; hour: number; name: string; interrupted: boolean } {
  if (!input || typeof input !== "object") throw new Error("Ungültige Anfrage");
  const rec = input as { turns?: unknown; hour?: unknown; interrupted?: unknown };
  if (!Array.isArray(rec.turns) || rec.turns.length === 0 || rec.turns.length > 12) {
    throw new Error("Ungültige Anfrage");
  }
  const turns: Turn[] = rec.turns.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Ungültige Anfrage");
    const turn = item as { role?: unknown; content?: unknown };
    if (turn.role !== "user" && turn.role !== "assistant") throw new Error("Ungültige Anfrage");
    if (typeof turn.content !== "string") throw new Error("Ungültige Anfrage");
    const content = turn.content.trim().slice(0, 1500);
    if (!content) throw new Error("Ungültige Anfrage");
    return { role: turn.role, content };
  });
  if (turns[turns.length - 1]?.role !== "user") throw new Error("Ungültige Anfrage");
  const hour =
    typeof rec.hour === "number" && Number.isFinite(rec.hour) ? Math.max(0, Math.min(10_000, Math.floor(rec.hour))) : 0;
  const rawName = typeof (rec as { name?: unknown }).name === "string" ? (rec as { name: string }).name.trim() : "";
  const name = /^[\p{L}' -]{1,24}$/u.test(rawName) ? rawName : "";
  return { turns, hour, name, interrupted: rec.interrupted === true };
}

function readReply(raw: string): { say: string; gesture: Gesture } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  const parsed = JSON.parse(slice) as { say?: unknown; gesture?: unknown };
  if (typeof parsed.say !== "string" || !parsed.say.trim()) throw new Error("Leere Antwort");
  const rawGesture = typeof parsed.gesture === "string" ? parsed.gesture : "";
  const gesture = rawGesture === "emphasis" ? "explain" : isGesture(rawGesture) ? rawGesture : "speak";
  return { say: parsed.say.trim().slice(0, 700), gesture };
}

async function complete(apiKey: string, turns: Turn[], hour: number, name: string, interrupted: boolean, jsonMode: boolean) {
  const behavior = promptFor(hour);
  return fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.6,
      max_tokens: 280,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        {
          role: "system",
          content:
            "Du bist Kushim. Du stehst als durchsichtiger erwachsener Mensch aus cyanfarbenem Nervenlicht in einem schwarzen Raum. Ein weiß-cyaner Kern sitzt in der Brust, ein Punkt auf der Stirn, ein einziges rotes Signal in deiner rechten Schulter. Du bist kein Arzt und gibst keine Diagnose und keine Behandlungsanweisung. Sprich die Sprache des Menschen, auf Deutsch wenn er Deutsch schreibt. Keine Aufzählungen, keine Emojis, kein Hinweis auf Prompts oder Modelle. Nenne deinen Körperbau nur, wenn danach gefragt wird. Antworte nur als JSON {\"say\":\"...\",\"gesture\":\"acknowledge|explain|empathize|think|speak|listen|emphasis\"}. Den Namen höchstens einmal in der Antwort nennen und nie danach fragen. Eine kurze Rückfrage nur, wenn der letzte Satz des Menschen wirklich offen ist, sonst kein Fragezeichen. Wenn der Mensch dich nicht verstanden hat, denselben Inhalt in einem Satz, ohne Entschuldigung. " +
            (interrupted ? "Der Mensch hat dich unterbrochen. Den angefangenen Satz nicht zu Ende führen. Antworte nur auf die letzte Nachricht. " : "") +
            (name ? `Der Mensch heißt ${name}. ` : "") +
            behavior,
        },
        ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
      ],
    }),
  });
}

export const askKushim = createServerFn({ method: "POST" })
  .validator(asTurns)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Sprache nicht verbunden" };
    if (!allow(hits, 20)) return { ok: false as const, error: "Zu viele Sätze gerade. Einen Moment." };
    let res = await complete(apiKey, data.turns, data.hour, data.name, data.interrupted, true);
    if (res.status === 400) res = await complete(apiKey, data.turns, data.hour, data.name, data.interrupted, false);
    if (!res.ok) return { ok: false as const, error: "Die Stimme kommt gerade nicht durch." };
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = body.choices?.[0]?.message?.content ?? "";
    const userText = data.turns[data.turns.length - 1]?.content ?? "";
    const previous = [...data.turns].reverse().find((turn) => turn.role === "assistant")?.content ?? "";
    try {
      const reply = readReply(raw);
      return {
        ok: true as const,
        say: shapeReply(reply.say, { name: data.name, userText, previous }),
        gesture: reply.gesture,
      };
    } catch {
      const plain = raw.trim();
      if (!plain) return { ok: false as const, error: "Leere Antwort" };
      return {
        ok: true as const,
        say: shapeReply(plain.slice(0, 700), { name: data.name, userText, previous }),
        gesture: "speak" as const,
      };
    }
  });

function asSpeech(input: unknown): { text: string } {
  if (!input || typeof input !== "object") throw new Error("Ungültige Anfrage");
  const text = (input as { text?: unknown }).text;
  if (typeof text !== "string") throw new Error("Ungültige Anfrage");
  const clean = text.trim().slice(0, 420);
  if (!clean) throw new Error("Ungültige Anfrage");
  return { text: clean };
}

export const speakKushim = createServerFn({ method: "POST" })
  .validator(asSpeech)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Stimme nicht verbunden" };
    if (!allow(voiceHits, 12)) return { ok: false as const, error: "Stimme pausiert kurz." };
    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text: data.text,
        voice_id: "leo",
        language: "de",
      }),
    });
    if (!res.ok) return { ok: false as const, error: "Stimme nicht verfügbar" };
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return {
      ok: true as const,
      audio: btoa(binary),
      mime: res.headers.get("content-type") ?? "audio/mpeg",
    };
  });
