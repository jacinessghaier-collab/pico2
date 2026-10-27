let current: HTMLAudioElement | null = null;
let token = 0;

export function stopSpeech() {
  token += 1;
  if (current) {
    current.pause();
    current.src = "";
    current = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function pickVoice(langHint: string) {
  const voices = window.speechSynthesis.getVoices();
  const lang = langHint.toLowerCase();
  const same = voices.filter((voice) => voice.lang.toLowerCase().startsWith(lang));
  return (
    same.find((voice) => /male|markus|stefan|hans|leo|daniel/i.test(voice.name)) ??
    same[0] ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(lang.slice(0, 2))) ??
    null
  );
}

export function speakBrowser(text: string, rate: number, gapMs: number, lang: string) {
  const mine = ++token;
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const lines = parts.length > 0 ? parts : [text];
  return new Promise<void>((resolve) => {
    const step = (index: number) => {
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
      utterance.pitch = 0.92;
      const voice = pickVoice(lang);
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        window.setTimeout(() => step(index + 1), gapMs);
      };
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    };
    const start = () => step(0);
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        start();
      };
    } else start();
  });
}

export async function speakLeo(audioBase64: string, mime: string) {
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
  await new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().catch(() => resolve());
  });
  URL.revokeObjectURL(url);
  if (current === audio) current = null;
}
