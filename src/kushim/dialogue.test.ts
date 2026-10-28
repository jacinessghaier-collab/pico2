import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closeUninvitedQuestion,
  cutUtterance,
  isOpenUtterance,
  isRepairRequest,
  mentionNameOnce,
  repairPhrase,
  shapeReply,
  trimInterrupted,
} from "./dialogue.ts";

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
    assert.equal(cutUtterance("Der Kern sitzt in der Brust und bleibt ruhig.", 0.45).endsWith("…"), true);
    const turns = [
      { role: "user" as const, content: "Hallo" },
      { role: "assistant" as const, content: "Der Kern sitzt in der Brust und bleibt ruhig." },
    ];
    const cut = trimInterrupted(turns, 0.4);
    assert.equal(cut[1]?.content.endsWith("…"), true);
    assert.equal(trimInterrupted(turns, 1)[1]?.content, turns[1].content);
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
