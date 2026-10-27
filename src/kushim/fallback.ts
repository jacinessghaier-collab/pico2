import type { Gesture } from "@/kushim/lock";

export function fallbackReply(user: string): { say: string; gesture: Gesture } {
  const q = user.toLowerCase();
  if (/^(hi|hey|hallo|guten|moin|servus)\b/.test(q)) {
    return {
      say: "Hallo. Ich bin da. Was beschäftigt dich gerade?",
      gesture: "acknowledge",
    };
  }
  if (/schulter|schmerz|weh|rot|signal|aura/.test(q)) {
    return {
      say: "Das Rot sitzt nur in meiner rechten Schulter. Es markiert die Stelle, es erklärt sie nicht. Wenn du dort etwas trägst, kannst du es sagen.",
      gesture: "empathize",
    };
  }
  if (/wer bist|dein name|wie heißt/.test(q)) {
    return {
      say: "Ich bin Kushim. Ein Mensch aus Licht, kein Kittel und kein Menü.",
      gesture: "speak",
    };
  }
  if (/nicht verstanden|wie bitte|was\?|hä\b|nochmal/.test(q)) {
    return {
      say: "Ich sage es kürzer: ich höre zu. Sag den einen Satz, der zählt.",
      gesture: "acknowledge",
    };
  }
  if (/traurig|angst|furcht|einsam|schwer/.test(q)) {
    return {
      say: "Das ist viel. Ich bleibe bei dem Satz, den du gerade gesagt hast.",
      gesture: "empathize",
    };
  }
  if (/\?/.test(user)) {
    return {
      say: "Ich würde dir das lieber mit meiner verbundenen Stimme beantworten. Bis dahin: sag mir, was du davon selbst schon glaubst.",
      gesture: "think",
    };
  }
  return {
    say: "Ich habe dich gehört. Erzähl mir das eine Detail, das dir dabei wichtig ist.",
    gesture: "listen",
  };
}
