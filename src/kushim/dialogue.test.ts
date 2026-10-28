import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIRST_PAUSE_MS,
  closeUninvitedQuestion,
  cutUtterance,
  gapAfterSentence,
  isOpenUtterance,
  isRepairRequest,
  mentionNameOnce,
  repairPhrase,
  shapeReply,
  shortenFirstSentence,
  splitSentences,
  textForLeo,
  trimInterrupted,
} from "./dialogue.ts";

function wordsOf(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

describe("name once", () => {
  it("keeps the first mention and drops the rest", () => {
    assert.equal(mentionNameOnce("Hallo Jacin, danke Jacin.", "Jacin"), "Hallo Jacin, danke.");
  });

  it("does not invent a name", () => {
    assert.equal(mentionNameOnce("Ich bin da.", ""), "Ich bin da.");
  });
});

describe("open utterance", () => {
  it("treats a real question as open and a closed sentence as closed", () => {
    assert.equal(isOpenUtterance("Magst du Tee?"), true);
    assert.equal(isOpenUtterance("Ich mag Tee."), false);
    assert.equal(isOpenUtterance("Ich bleibe, weil"), true);
    assert.equal(isOpenUtterance("Was ist das"), true);
  });

  it("drops a trailing question when the person was not open", () => {
    assert.equal(
      closeUninvitedQuestion("Ich höre den Satz. Meinst du die Schulter?"),
      "Ich höre den Satz.",
    );
  });
});

describe("repair", () => {
  it("recognizes not-understood and repeats one sentence without the apology", () => {
    assert.equal(isRepairRequest("Ich habe dich nicht verstanden"), true);
    assert.equal(isRepairRequest("Ich mag Tee."), false);
    assert.equal(
      repairPhrase("Es tut mir leid, der Kern sitzt in der Brust. Er leuchtet noch."),
      "Der Kern sitzt in der Brust.",
    );
  });
});

describe("interrupt", () => {
  it("cuts the assistant line on a word and leaves a closed thought alone", () => {
    assert.equal(
      cutUtterance("Der Kern sitzt in der Brust und bleibt ruhig.", 0.45).endsWith("…"),
      true,
    );
    const turns = [
      { role: "user" as const, content: "Hallo" },
      { role: "assistant" as const, content: "Der Kern sitzt in der Brust und bleibt ruhig." },
    ];
    const cut = trimInterrupted(turns, 0.4);
    assert.equal(cut[1]?.content.endsWith("…"), true);
    assert.equal(trimInterrupted(turns, 1)[1]?.content, turns[1].content);
  });
});

describe("shorter first sentence", () => {
  it("keeps a short opener and does not drop words", () => {
    const samples = [
      "Ich höre. Was meinst du?",
      "Das Rot sitzt nur in meiner rechten Schulter. Es markiert die Stelle, es erklärt sie nicht.",
      "Ich würde dir das lieber mit meiner verbundenen Stimme beantworten. Bis dahin sag mir, was du davon selbst schon glaubst.",
      "Ich bleibe heute bei dem einen Satz ohne Umschweife und ohne eine zweite Geschichte.",
      "Nur die rechte Schulter. Das Rot markiert die Stelle, es erklärt sie nicht.",
    ];
    for (const sample of samples) {
      const out = shortenFirstSentence(sample);
      const parts = splitSentences(out);
      assert.deepEqual(wordsOf(out), wordsOf(sample));
      assert.equal(shortenFirstSentence(out), out);
      assert.equal(out.includes("[pause]"), false);
      const opening = parts[0] ?? "";
      assert.ok(wordsOf(opening).length <= 8);
      assert.equal(/\b(der|die|das|mit|in|und|für)$/i.test(opening.replace(/[.!?]$/u, "")), false);
      if (parts.length >= 2) {
        const second = parts[1] ?? "";
        const wa = wordsOf(opening).length;
        const wb = wordsOf(second).length;
        assert.ok(wa < wb || (wa === wb && opening.length < second.length));
      }
    }
  });

  it("leaves a one-sentence repair intact", () => {
    const previous =
      "Der Kern sitzt in der Brust und leuchtet noch sehr ruhig im Raum hier vor dir.";
    assert.equal(
      shapeReply("Tut mir leid, ganz anders.", {
        name: "",
        userText: "wie bitte",
        previous,
      }),
      repairPhrase(previous),
    );
    assert.equal(splitSentences(repairPhrase(previous)).length, 1);
  });

  it("breaks a long opener on a clause", () => {
    assert.equal(
      shortenFirstSentence(
        "Das Rot sitzt nur in meiner rechten Schulter. Es markiert die Stelle, es erklärt sie nicht.",
      ),
      "Das Rot sitzt nur. In meiner rechten Schulter. Es markiert die Stelle, es erklärt sie nicht.",
    );
    assert.equal(
      shortenFirstSentence(
        "Ich würde dir das lieber mit meiner verbundenen Stimme beantworten. Bis dahin sag mir, was du davon selbst schon glaubst.",
      ),
      "Ich würde dir das lieber. Mit meiner verbundenen Stimme beantworten. Bis dahin sag mir, was du davon selbst schon glaubst.",
    );
  });

  it("puts one Leo pause after the first sentence only", () => {
    const say = shortenFirstSentence(
      "Das Rot sitzt nur in meiner rechten Schulter. Es markiert die Stelle, es erklärt sie nicht.",
    );
    const leo = textForLeo(say);
    assert.equal(leo.split("[pause]").length, 2);
    assert.equal(leo.startsWith(`${splitSentences(say)[0]} [pause] `), true);
    assert.equal(textForLeo(textForLeo(say)), leo);
    assert.equal(textForLeo("Ich bin da."), "Ich bin da.");
  });

  it("holds once after the opening sentence and keeps later gaps", () => {
    assert.equal(gapAfterSentence(0, 2, 80), Math.max(80, FIRST_PAUSE_MS));
    assert.equal(gapAfterSentence(1, 3, 80), 80);
    assert.equal(gapAfterSentence(0, 1, 200), 200);
    assert.equal(FIRST_PAUSE_MS < 500, true);
  });
});

describe("shapeReply", () => {
  it("repairs from the previous line, then allows a question only when open", () => {
    assert.equal(
      shapeReply("Tut mir leid, ich formuliere neu.", {
        name: "Jacin",
        userText: "wie bitte",
        previous: "Der Kern sitzt in der Brust.",
      }),
      "Der Kern sitzt in der Brust.",
    );
    assert.equal(
      shapeReply("Ich höre. Was meinst du genau, Jacin Jacin?", {
        name: "Jacin",
        userText: "Ich bin müde.",
        previous: "",
      }),
      "Ich höre.",
    );
    assert.equal(
      shapeReply("Ich höre. Was meinst du?", {
        name: "",
        userText: "Und was nun?",
        previous: "",
      }),
      "Ich höre. Was meinst du?",
    );
  });
});
