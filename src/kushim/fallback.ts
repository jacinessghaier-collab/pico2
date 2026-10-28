import { isRepairRequest, shapeReply } from "@/kushim/dialogue";
import type { Gesture } from "@/kushim/lock";
import { recallReply, type DurableMemory } from "@/kushim/memory";

export function fallbackReply(
  user: string,
  ctx?: { name?: string; previous?: string; memory?: DurableMemory },
): { say: string; gesture: Gesture } {
  const q = user.toLowerCase();
  const recalled = ctx?.memory ? recallReply(user, ctx.memory, ctx.name ?? "") : null;
  let say = "Ich habe dich gehört. Erzähl mir das eine Detail, das dir dabei wichtig ist.";
  let gesture: Gesture = "listen";
  if (recalled) {
    say = recalled;
    gesture = "speak";
  } else if (/^(hi|hey|hallo|guten|moin|servus)\b/.test(q)) {
    say = "Hallo. Ich bin da. Was beschäftigt dich gerade?";
    gesture = "acknowledge";
  } else if (/schulter|schmerz|weh|rot|signal|aura/.test(q)) {
    say =
      "Nur die rechte Schulter. Das Rot markiert die Stelle, es erklärt sie nicht. Wenn du dort etwas trägst, kannst du es sagen.";
    gesture = "empathize";
  } else if (/wer bist|dein name|wie heißt/.test(q)) {
    say = "Ich bin Kushim. Ein Mensch aus Licht, kein Kittel und kein Menü.";
    gesture = "speak";
  } else if (/traurig|angst|furcht|einsam|schwer/.test(q)) {
    say = "Das ist viel. Ich bleibe bei dem Satz, den du gerade gesagt hast.";
    gesture = "empathize";
  } else if (/\?/.test(user) && !isRepairRequest(user)) {
    say = "Die Stimme ist nicht verbunden. Sag mir, was du davon selbst schon glaubst.";
    gesture = "think";
  }
  if (isRepairRequest(user)) gesture = "acknowledge";
  return {
    say: shapeReply(say, { name: ctx?.name ?? "", userText: user, previous: ctx?.previous }),
    gesture,
  };
}
