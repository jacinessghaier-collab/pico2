import { useServerFn } from "@tanstack/react-start";
import { Mic, Send, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ComponentType, FormEvent, RefObject } from "react";
import { BildzeitReadout } from "@/kushim/BildzeitReadout";
import { isRepairRequest, shapeReply, textForLeo, trimInterrupted } from "@/kushim/dialogue";
import { fallbackReply } from "@/kushim/fallback";
import type { Gesture } from "@/kushim/lock";
import type { Pose } from "@/kushim/motion";
import { absorbMemory, loadMemory, memoryPrompt, saveMemory } from "@/kushim/memory";
import { askKushim, speakKushim } from "@/kushim/server";
import { speakBrowser, speakLeo, spokenFraction, stopSpeech } from "@/kushim/speech";
import { DONE_STEP, NEXT_STEP, STEPS } from "@/kushim/stand";
import { stageAt } from "@/kushim/stages";
import {
  clearName,
  loadThread,
  loadVoice,
  nameInText,
  rememberName,
  saveThread,
  saveVoice,
  trainingHour,
  type Turn,
} from "@/kushim/training";

const emptyPose = (): Pose => ({
  gesture: "idle",
  speaking: false,
  hour: 0,
  reducedMotion: false,
  shoulderTopic: false,
  attention: 0,
  typing: false,
});

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function langOf(text: string) {
  return /[äöüßÄÖÜ]|\b(ich|und|nicht|das|die|der|ein|du|ist|wir)\b/i.test(text) ? "de-DE" : "en-US";
}

function mentionsShoulder(text: string) {
  return /schulter|schmerz|weh|signal|\brot\b/i.test(text);
}

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function createRecognition() {
  const host = window as Window & {
    SpeechRecognition?: new () => Rec;
    webkitSpeechRecognition?: new () => Rec;
  };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function KushimApp() {
  const ask = useServerFn(askKushim);
  const speak = useServerFn(speakKushim);
  const poseRef = useRef<Pose>(emptyPose());
  const run = useRef(0);
  const phase = useRef<"idle" | "think" | "speak">("idle");
  const threadRef = useRef<Turn[]>([]);
  const recRef = useRef<Rec | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [Scene, setScene] = useState<ComponentType<{ poseRef: RefObject<Pose> }> | null>(null);
  const [msgs, setMsgs] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [gesture, setGesture] = useState<Gesture>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [hour, setHour] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [leo, setLeo] = useState(true);
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [attention, setAttention] = useState(0);
  const [shoulder, setShoulder] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [booted, setBooted] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    void import("@/kushim/KushimScene").then((mod) => setScene(() => mod.KushimScene));
    const loaded = loadThread();
    threadRef.current = loaded;
    setMsgs(loaded);
    setHour(trainingHour());
    const voice = loadVoice();
    setVoiceOn(voice.on);
    setLeo(voice.leo);
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setBooted(true);
    const id = window.setInterval(() => setHour(trainingHour()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (booted) saveVoice(voiceOn, leo);
  }, [booted, voiceOn, leo]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs, pending]);

  useEffect(() => {
    if (attention <= 0) return;
    const id = window.setTimeout(() => setAttention(0), 1800);
    return () => window.clearTimeout(id);
  }, [attention]);

  const typing = focused && draft.trim().length > 16 && !pending && !speaking;
  const shown: Gesture = speaking ? gesture : pending ? "think" : typing ? "listen" : gesture;
  poseRef.current = {
    gesture: shown,
    speaking,
    hour,
    reducedMotion: reduced,
    shoulderTopic: shoulder,
    attention,
    typing,
  };

  async function sayAloud(text: string, hourNow: number, mine: number) {
    if (!voiceOn) {
      if (mine === run.current) {
        phase.current = "idle";
        setGesture("idle");
      }
      return;
    }
    const stage = stageAt(hourNow);
    if (!reduced) await wait(stage.inhaleMs);
    if (mine !== run.current) return;
    setSpeaking(true);
    try {
      if (leo) {
        const audio = await speak({ data: { text: textForLeo(text) } });
        if (mine !== run.current) return;
        if (audio.ok) await speakLeo(audio.audio, audio.mime, text);
        else await speakBrowser(text, stage.speechRate, stage.sentenceGapMs, langOf(text));
      } else {
        await speakBrowser(text, stage.speechRate, stage.sentenceGapMs, langOf(text));
      }
    } catch {
      setNote("Die Stimme ist gerade still.");
    } finally {
      if (mine === run.current) {
        phase.current = "idle";
        setSpeaking(false);
        setGesture("idle");
      }
    }
  }

  async function sendText(raw: string) {
    const clean = raw.trim();
    if (!clean) return;
    const interrupted = phase.current !== "idle";
    const fraction = interrupted ? spokenFraction() : 1;
    const mine = ++run.current;
    stopSpeech();
    phase.current = "think";
    setNote("");
    setListening(false);
    const history = interrupted ? trimInterrupted(threadRef.current, fraction) : threadRef.current;
    const previous =
      [...history].reverse().find((item) => item.role === "assistant")?.content ?? "";
    const next: Turn[] = [...history, { role: "user", content: clean }];
    threadRef.current = next;
    setMsgs(next);
    setDraft("");
    setPending(true);
    setShoulder(mentionsShoulder(clean));
    setAttention(1);
    const hourNow = trainingHour();
    const introduced = nameInText(clean);
    let nameNow = rememberName(clean);
    const windowTurns = stageAt(hourNow).memoryTurns;
    const absorbed = absorbMemory(loadMemory(), clean, next, windowTurns);
    if (absorbed.clearName && !introduced) {
      clearName();
      nameNow = "";
    }
    saveMemory(absorbed.memory);
    setHour(hourNow);
    const recent = next.slice(-windowTurns);
    let reply = fallbackReply(clean, { name: nameNow, memory: absorbed.memory });
    const repair = isRepairRequest(clean) && previous.trim().length > 0;
    if (!repair) {
      try {
        const result = await ask({
          data: {
            turns: recent,
            hour: hourNow,
            name: nameNow,
            interrupted,
            memory: memoryPrompt(absorbed.memory),
          },
        });
        if (mine !== run.current) return;
        if (result.ok) reply = { say: result.say, gesture: result.gesture };
        else setNote(result.error);
      } catch {
        if (mine !== run.current) return;
        setNote("Ich bleibe bei einem kurzen Satz.");
      }
    }
    // Sole reply-form call. Server and fallback hand back raw text.
    reply = {
      say: shapeReply(reply.say, { name: nameNow, userText: clean, previous }),
      gesture: reply.gesture,
    };
    if (mine !== run.current) return;
    const withReply: Turn[] = [...next, { role: "assistant", content: reply.say }];
    threadRef.current = withReply;
    setMsgs(withReply);
    saveThread(withReply);
    setPending(false);
    setGesture(reply.gesture);
    phase.current = "speak";
    await sayAloud(reply.say, hourNow, mine);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendText(draft);
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = createRecognition();
    if (!rec) {
      setNote("Dieses Fenster hört kein Mikrofon. Schreib mir.");
      return;
    }
    rec.lang = "de-DE";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0]?.transcript ?? "";
      setDraft(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setFocused(true);
    } catch {
      setNote("Das Mikrofon bleibt zu.");
    }
  }

  const stage = stageAt(hour);
  const last = msgs.filter((item) => item.role === "assistant").at(-1)?.content ?? "";

  return (
    <main className="relative h-dvh overflow-hidden bg-void text-kern">
      <h1 className="sr-only">Kushim</h1>
      <p className="sr-only" aria-live="polite">
        {pending ? "Kushim denkt." : last}
      </p>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 md:p-6">
        <div>
          <p className="text-xs font-medium tracking-widest text-strom">KUSHIM</p>
          <p className="mt-1 text-sm text-mist">
            Stunde {hour} · {stage.label}
          </p>
          <p className="text-xs text-mist">
            Stufe {DONE_STEP} von {STEPS.length} · Nächste:{" "}
            {STEPS.find((item) => item.id === NEXT_STEP)?.title}
          </p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            aria-pressed={leo}
            disabled={!voiceOn}
            onClick={() => setLeo((value) => !value)}
            className="h-11 rounded-full border border-line px-4 text-sm text-strom disabled:opacity-40"
          >
            {leo ? "Leo" : "Klar"}
          </button>
          <button
            type="button"
            aria-pressed={voiceOn}
            aria-label={voiceOn ? "Stimme aus" : "Stimme an"}
            onClick={() => setVoiceOn((value) => !value)}
            className="grid h-11 w-11 place-items-center rounded-full border border-line text-strom"
          >
            {voiceOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </button>
        </div>
      </header>

      <div className="absolute inset-0">{Scene ? <Scene poseRef={poseRef} /> : null}</div>
      <BildzeitReadout />

      <div
        ref={scroller}
        className="pointer-events-auto absolute inset-x-4 bottom-24 z-10 max-h-32 overflow-y-auto md:inset-x-auto md:top-24 md:right-6 md:bottom-28 md:max-h-none md:w-80"
      >
        <div className="flex flex-col gap-3">
          {msgs.length === 0 ? <p className="text-sm text-mist">Er steht. Sprich ihn an.</p> : null}
          {msgs.slice(-8).map((item, index) => (
            <p
              key={`${item.role}-${index}`}
              className={item.role === "user" ? "text-sm text-kern" : "text-sm text-strom"}
            >
              {item.content}
            </p>
          ))}
          {pending ? <p className="text-sm text-mist">…</p> : null}
          {note ? <p className="text-sm text-mist">{note}</p> : null}
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="pointer-events-auto absolute inset-x-0 bottom-4 z-10 flex justify-center px-4"
      >
        <div
          className={
            "flex w-full max-w-xl items-center gap-1 rounded-full border bg-void px-1 py-1 " +
            (listening ? "border-strom" : "border-line")
          }
        >
          <button
            type="button"
            aria-pressed={listening}
            aria-label={listening ? "Mikrofon stoppen" : "Mikrofon"}
            onClick={toggleMic}
            className="grid h-11 w-11 shrink-0 place-items-center text-strom"
          >
            <Mic className="size-5" />
          </button>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 500))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Sprich mit Kushim"
            aria-label="Nachricht an Kushim"
            className="h-11 min-w-0 flex-1 bg-transparent px-2 text-base text-kern outline-none placeholder:text-mist"
          />
          <button
            type="submit"
            aria-label="Senden"
            disabled={draft.trim().length === 0}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-strom text-void disabled:opacity-40"
          >
            <Send className="size-5" />
          </button>
        </div>
      </form>
    </main>
  );
}
