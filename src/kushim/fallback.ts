import { isRepairRequest, shapeReply } from "@/kushim/dialogue";
import type { Gesture } from "@/kushim/lock";

export function fallbackReply(
  user: string,
  ctx?: { name?: string; previous?: string },
): { say: string; gesture: Gesture } {
  const q = user.toLowerCase();
  let say = "Ich habe dich gehört. Erzähl mir das eine Detail, das dir dabei wichtig ist.";
  let gesture: Gesture = "listen";
  if (/^(hi|hey|hallo|guten|moin|servus)\b/.test(q)) {
    say = "Hallo. Ich bin da. Was beschäftigt dich gerade?";
    gesture = "acknowledge";
  } else if (/schulter|schmerz|weh|rot|signal|aura/.test(q)) {
    say = "Das Rot sitzt nur in meiner rechten Schulter. Es markiert die Stelle, es erklärt sie nicht. Wenn du dort etwas trägst, kannst du es sagen.";
    gesture = "empathize";
  } else if (/wer bist|dein name|wie heißt/.test(q)) {
    say = "Ich bin Kushim. Ein Mensch aus Licht, kein Kittel und kein Menü.";
    gesture = "speak";
  } else if (/traurig|angst|furcht|einsam|schwer/.test(q)) {
    say = "Das ist viel. Ich bleibe bei dem Satz, den du gerade gesagt hast.";
    gesture = "empathize";
  } else if (/\?/.test(user) && !isRepairRequest(user)) {
    say = "Ich würde dir das lieber mit meiner verbundenen Stimme beantworten. Bis dahin: sag mir, was du davon selbst schon glaubst.";
    gesture = "think";
  }
  if (isRepairRequest(user)) gesture = "acknowledge";
  return {
    say: shapeReply(say, { name: ctx?.name ?? "", userText: user, previous: ctx?.previous }),
    gesture,
  };
}
