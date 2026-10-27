import { i as __toESM } from "../_runtime.mjs";
import { n as stageAt } from "./stages-C8e_oXZy.mjs";
import { C as require_jsx_runtime, w as require_react } from "../_libs/@react-three/fiber+[...].mjs";
import { H as isRedirect, y as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { i as Mic, n as Volume2, r as Send, t as VolumeX } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Dr1K6T2t.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function useServerFn(serverFn) {
	const router = useRouter();
	return import_react.useCallback(async (...args) => {
		try {
			const res = await serverFn(...args);
			if (isRedirect(res)) throw res;
			return res;
		} catch (err) {
			if (isRedirect(err)) {
				err.options._fromLocation = router.stores.location.get();
				return router.navigate(router.resolveRedirect(err).options);
			}
			throw err;
		}
	}, [router, serverFn]);
}
function fallbackReply(user) {
	const q = user.toLowerCase();
	if (/^(hi|hey|hallo|guten|moin|servus)\b/.test(q)) return {
		say: "Hallo. Ich bin da. Was beschäftigt dich gerade?",
		gesture: "acknowledge"
	};
	if (/schulter|schmerz|weh|rot|signal|aura/.test(q)) return {
		say: "Das Rot sitzt nur in meiner rechten Schulter. Es markiert die Stelle, es erklärt sie nicht. Wenn du dort etwas trägst, kannst du es sagen.",
		gesture: "empathize"
	};
	if (/wer bist|dein name|wie heißt/.test(q)) return {
		say: "Ich bin Kushim. Ein Mensch aus Licht, kein Kittel und kein Menü.",
		gesture: "speak"
	};
	if (/nicht verstanden|wie bitte|was\?|hä\b|nochmal/.test(q)) return {
		say: "Ich sage es kürzer: ich höre zu. Sag den einen Satz, der zählt.",
		gesture: "acknowledge"
	};
	if (/traurig|angst|furcht|einsam|schwer/.test(q)) return {
		say: "Das ist viel. Ich bleibe bei dem Satz, den du gerade gesagt hast.",
		gesture: "empathize"
	};
	if (/\?/.test(user)) return {
		say: "Ich würde dir das lieber mit meiner verbundenen Stimme beantworten. Bis dahin: sag mir, was du davon selbst schon glaubst.",
		gesture: "think"
	};
	return {
		say: "Ich habe dich gehört. Erzähl mir das eine Detail, das dir dabei wichtig ist.",
		gesture: "listen"
	};
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
function asTurns(input) {
	if (!input || typeof input !== "object") throw new Error("Ungültige Anfrage");
	const rec = input;
	if (!Array.isArray(rec.turns) || rec.turns.length === 0 || rec.turns.length > 12) throw new Error("Ungültige Anfrage");
	const turns = rec.turns.map((item) => {
		if (!item || typeof item !== "object") throw new Error("Ungültige Anfrage");
		const turn = item;
		if (turn.role !== "user" && turn.role !== "assistant") throw new Error("Ungültige Anfrage");
		if (typeof turn.content !== "string") throw new Error("Ungültige Anfrage");
		const content = turn.content.trim().slice(0, 1500);
		if (!content) throw new Error("Ungültige Anfrage");
		return {
			role: turn.role,
			content
		};
	});
	if (turns[turns.length - 1]?.role !== "user") throw new Error("Ungültige Anfrage");
	const hour = typeof rec.hour === "number" && Number.isFinite(rec.hour) ? Math.max(0, Math.min(1e4, Math.floor(rec.hour))) : 0;
	const rawName = typeof rec.name === "string" ? rec.name.trim() : "";
	return {
		turns,
		hour,
		name: /^[\p{L}' -]{1,24}$/u.test(rawName) ? rawName : ""
	};
}
var askKushim = createServerFn({ method: "POST" }).validator(asTurns).handler(createSsrRpc("4731ed30873dcab39f89519bcbef5324d95b4fa9fa665360b8052993a1fe5043"));
function asSpeech(input) {
	if (!input || typeof input !== "object") throw new Error("Ungültige Anfrage");
	const text = input.text;
	if (typeof text !== "string") throw new Error("Ungültige Anfrage");
	const clean = text.trim().slice(0, 420);
	if (!clean) throw new Error("Ungültige Anfrage");
	return { text: clean };
}
var speakKushim = createServerFn({ method: "POST" }).validator(asSpeech).handler(createSsrRpc("9179eddee64445dcc1741e2f7119bdfd14e35de1f8ca9e999e506a8624ceedc1"));
var current = null;
var token = 0;
function stopSpeech() {
	token += 1;
	if (current) {
		current.pause();
		current.src = "";
		current = null;
	}
	if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}
function pickVoice(langHint) {
	const voices = window.speechSynthesis.getVoices();
	const lang = langHint.toLowerCase();
	const same = voices.filter((voice) => voice.lang.toLowerCase().startsWith(lang));
	return same.find((voice) => /male|markus|stefan|hans|leo|daniel/i.test(voice.name)) ?? same[0] ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(lang.slice(0, 2))) ?? null;
}
function speakBrowser(text, rate, gapMs, lang) {
	const mine = ++token;
	const parts = text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
	const lines = parts.length > 0 ? parts : [text];
	return new Promise((resolve) => {
		const step = (index) => {
			if (mine !== token) {
				resolve();
				return;
			}
			if (index >= lines.length) {
				resolve();
				return;
			}
			const utterance = new SpeechSynthesisUtterance(lines[index]);
			utterance.lang = lang;
			utterance.rate = rate;
			utterance.pitch = .92;
			const voice = pickVoice(lang);
			if (voice) utterance.voice = voice;
			utterance.onend = () => {
				window.setTimeout(() => step(index + 1), gapMs);
			};
			utterance.onerror = () => resolve();
			window.speechSynthesis.speak(utterance);
		};
		const start = () => step(0);
		if (window.speechSynthesis.getVoices().length === 0) window.speechSynthesis.onvoiceschanged = () => {
			window.speechSynthesis.onvoiceschanged = null;
			start();
		};
		else start();
	});
}
async function speakLeo(audioBase64, mime) {
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
	await new Promise((resolve) => {
		audio.onended = () => resolve();
		audio.onerror = () => resolve();
		audio.play().catch(() => resolve());
	});
	URL.revokeObjectURL(url);
	if (current === audio) current = null;
}
var BORN = "kushim-born-at";
var THREAD = "kushim-thread";
var NAME = "kushim-name";
var VOICE = "kushim-voice";
function trainingHour() {
	if (typeof localStorage === "undefined") return 0;
	const raw = localStorage.getItem(BORN);
	let born = raw ? Number(raw) : NaN;
	if (!Number.isFinite(born)) {
		born = Date.now();
		localStorage.setItem(BORN, String(born));
	}
	return Math.max(0, Math.floor((Date.now() - born) / 36e5));
}
function loadThread() {
	if (typeof localStorage === "undefined") return [];
	try {
		const parsed = JSON.parse(localStorage.getItem(THREAD) ?? "[]");
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item) => !!item && typeof item === "object" && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-24);
	} catch {
		return [];
	}
}
function saveThread(turns) {
	localStorage.setItem(THREAD, JSON.stringify(turns.slice(-24)));
}
function loadName() {
	if (typeof localStorage === "undefined") return "";
	return (localStorage.getItem(NAME) ?? "").slice(0, 24);
}
function rememberName(text) {
	const match = text.match(/(?:ich hei(?:ß|ss)e|mein name ist|i am|i'm)\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß'-]{1,20})/i);
	if (!match) return loadName();
	const name = match[1];
	localStorage.setItem(NAME, name);
	return name;
}
function loadVoice() {
	if (typeof localStorage === "undefined") return {
		on: true,
		leo: true
	};
	const raw = localStorage.getItem(VOICE);
	if (raw === "off") return {
		on: false,
		leo: false
	};
	if (raw === "browser") return {
		on: true,
		leo: false
	};
	return {
		on: true,
		leo: true
	};
}
function saveVoice(on, leo) {
	localStorage.setItem(VOICE, !on ? "off" : leo ? "leo" : "browser");
}
var emptyPose = () => ({
	gesture: "idle",
	speaking: false,
	hour: 0,
	reducedMotion: false,
	shoulderTopic: false,
	attention: 0,
	typing: false
});
function wait(ms) {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function langOf(text) {
	return /[äöüßÄÖÜ]|\b(ich|und|nicht|das|die|der|ein|du|ist|wir)\b/i.test(text) ? "de-DE" : "en-US";
}
function mentionsShoulder(text) {
	return /schulter|schmerz|weh|signal|\brot\b/i.test(text);
}
function createRecognition() {
	const host = window;
	const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
	return Ctor ? new Ctor() : null;
}
function KushimApp() {
	const ask = useServerFn(askKushim);
	const speak = useServerFn(speakKushim);
	const poseRef = (0, import_react.useRef)(emptyPose());
	const run = (0, import_react.useRef)(0);
	const recRef = (0, import_react.useRef)(null);
	const scroller = (0, import_react.useRef)(null);
	const [Scene, setScene] = (0, import_react.useState)(null);
	const [msgs, setMsgs] = (0, import_react.useState)([]);
	const [draft, setDraft] = (0, import_react.useState)("");
	const [pending, setPending] = (0, import_react.useState)(false);
	const [gesture, setGesture] = (0, import_react.useState)("idle");
	const [speaking, setSpeaking] = (0, import_react.useState)(false);
	const [hour, setHour] = (0, import_react.useState)(0);
	const [voiceOn, setVoiceOn] = (0, import_react.useState)(true);
	const [leo, setLeo] = (0, import_react.useState)(true);
	const [focused, setFocused] = (0, import_react.useState)(false);
	const [listening, setListening] = (0, import_react.useState)(false);
	const [attention, setAttention] = (0, import_react.useState)(0);
	const [shoulder, setShoulder] = (0, import_react.useState)(false);
	const [reduced, setReduced] = (0, import_react.useState)(false);
	const [booted, setBooted] = (0, import_react.useState)(false);
	const [note, setNote] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		import("./KushimScene-Ds07A30z.mjs").then((mod) => setScene(() => mod.KushimScene));
		setMsgs(loadThread());
		setHour(trainingHour());
		const voice = loadVoice();
		setVoiceOn(voice.on);
		setLeo(voice.leo);
		setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
		setBooted(true);
		const id = window.setInterval(() => setHour(trainingHour()), 3e4);
		return () => window.clearInterval(id);
	}, []);
	(0, import_react.useEffect)(() => {
		if (booted) saveVoice(voiceOn, leo);
	}, [
		booted,
		voiceOn,
		leo
	]);
	(0, import_react.useEffect)(() => {
		scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
	}, [msgs, pending]);
	(0, import_react.useEffect)(() => {
		if (attention <= 0) return;
		const id = window.setTimeout(() => setAttention(0), 1800);
		return () => window.clearTimeout(id);
	}, [attention]);
	const typing = focused && draft.trim().length > 16 && !pending && !speaking;
	poseRef.current = {
		gesture: speaking ? gesture : pending ? "think" : typing ? "listen" : gesture,
		speaking,
		hour,
		reducedMotion: reduced,
		shoulderTopic: shoulder,
		attention,
		typing
	};
	async function sayAloud(text, hourNow, mine) {
		if (!voiceOn) {
			setGesture("idle");
			return;
		}
		const stage = stageAt(hourNow);
		if (!reduced) await wait(stage.inhaleMs);
		if (mine !== run.current) return;
		setSpeaking(true);
		try {
			if (leo) {
				const audio = await speak({ data: { text } });
				if (mine !== run.current) return;
				if (audio.ok) await speakLeo(audio.audio, audio.mime);
				else await speakBrowser(text, stage.speechRate, stage.sentenceGapMs, langOf(text));
			} else await speakBrowser(text, stage.speechRate, stage.sentenceGapMs, langOf(text));
		} catch {
			setNote("Die Stimme ist gerade still.");
		} finally {
			if (mine === run.current) {
				setSpeaking(false);
				setGesture("idle");
			}
		}
	}
	async function sendText(raw) {
		const clean = raw.trim();
		if (!clean || pending) return;
		const mine = ++run.current;
		stopSpeech();
		setNote("");
		setListening(false);
		const next = [...msgs, {
			role: "user",
			content: clean
		}];
		setMsgs(next);
		setDraft("");
		setPending(true);
		setShoulder(mentionsShoulder(clean));
		setAttention(1);
		const hourNow = trainingHour();
		const nameNow = rememberName(clean);
		setHour(hourNow);
		const memory = next.slice(-stageAt(hourNow).memoryTurns);
		let reply = fallbackReply(clean);
		try {
			const result = await ask({ data: {
				turns: memory,
				hour: hourNow,
				name: nameNow
			} });
			if (mine !== run.current) return;
			if (result.ok) reply = {
				say: result.say,
				gesture: result.gesture
			};
			else setNote(result.error);
		} catch {
			if (mine !== run.current) return;
			setNote("Ich bleibe bei einem kurzen Satz.");
		}
		const withReply = [...next, {
			role: "assistant",
			content: reply.say
		}];
		setMsgs(withReply);
		saveThread(withReply);
		setPending(false);
		setGesture(reply.gesture);
		await sayAloud(reply.say, hourNow, mine);
	}
	function onSubmit(event) {
		event.preventDefault();
		sendText(draft);
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
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "relative h-dvh overflow-hidden bg-void text-kern",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "sr-only",
				children: "Kushim"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "sr-only",
				"aria-live": "polite",
				children: pending ? "Kushim denkt." : last
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 md:p-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium tracking-widest text-strom",
					children: "KUSHIM"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-sm text-mist",
					children: [
						"Stunde ",
						hour,
						" · ",
						stage.label
					]
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "pointer-events-auto flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-pressed": leo,
						disabled: !voiceOn,
						onClick: () => setLeo((value) => !value),
						className: "h-11 rounded-full border border-line px-4 text-sm text-strom disabled:opacity-40",
						children: leo ? "Leo" : "Klar"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-pressed": voiceOn,
						"aria-label": voiceOn ? "Stimme aus" : "Stimme an",
						onClick: () => setVoiceOn((value) => !value),
						className: "grid h-11 w-11 place-items-center rounded-full border border-line text-strom",
						children: voiceOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-5" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, { className: "size-5" })
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "absolute inset-0",
				children: Scene ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scene, { poseRef }) : null
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: scroller,
				className: "pointer-events-auto absolute inset-x-4 bottom-24 z-10 max-h-32 overflow-y-auto md:inset-x-auto md:top-24 md:right-6 md:bottom-28 md:max-h-none md:w-80",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-3",
					children: [
						msgs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-mist",
							children: "Er steht. Sprich ihn an."
						}) : null,
						msgs.slice(-8).map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: item.role === "user" ? "text-sm text-kern" : "text-sm text-strom",
							children: item.content
						}, `${item.role}-${index}`)),
						pending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-mist",
							children: "…"
						}) : null,
						note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-mist",
							children: note
						}) : null
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("form", {
				onSubmit,
				className: "pointer-events-auto absolute inset-x-0 bottom-4 z-10 flex justify-center px-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex w-full max-w-xl items-center gap-1 rounded-full border bg-void px-1 py-1 " + (listening ? "border-strom" : "border-line"),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": listening,
							"aria-label": listening ? "Mikrofon stoppen" : "Mikrofon",
							onClick: toggleMic,
							className: "grid h-11 w-11 shrink-0 place-items-center text-strom",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, { className: "size-5" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: draft,
							onChange: (event) => setDraft(event.target.value.slice(0, 500)),
							onFocus: () => setFocused(true),
							onBlur: () => setFocused(false),
							placeholder: "Sprich mit Kushim",
							"aria-label": "Nachricht an Kushim",
							className: "h-11 min-w-0 flex-1 bg-transparent px-2 text-base text-kern outline-none placeholder:text-mist"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							"aria-label": "Senden",
							disabled: pending || draft.trim().length === 0,
							className: "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-strom text-void disabled:opacity-40",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Send, { className: "size-5" })
						})
					]
				})
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KushimApp, {});
}
//#endregion
export { Home as component };
