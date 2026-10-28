import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
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
import { STAGES } from "./stages.ts";

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

  it("matches the name as a whole word and still drops a repeat", () => {
    assert.equal(mentionNameOnce("Hallo Jacinta.", "Jacin"), "Hallo Jacinta.");
    assert.equal(mentionNameOnce("Hallo Jacin2.", "Jacin"), "Hallo Jacin2.");
    assert.equal(mentionNameOnce("Hallo Jacin und Jacinta.", "Jacin"), "Hallo Jacin und Jacinta.");
    assert.equal(
      mentionNameOnce("Jacinta kennt Jacin und Jacin.", "Jacin"),
      "Jacinta kennt Jacin und.",
    );
    assert.equal(
      mentionNameOnce("Hallo JACIN, danke jacinta und Jacin.", "Jacin"),
      "Hallo JACIN, danke jacinta und.",
    );
    assert.equal(mentionNameOnce("Jacin sagt Jacin bleibt.", "Jacin"), "Jacin sagt bleibt.");
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
    assert.equal(FIRST_PAUSE_MS, 320);
  });
});

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSources(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function calls(source: string, name: string): number {
  return source.match(new RegExp(`\\b${name}\\s*\\(`, "g"))?.length ?? 0;
}

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

  it("keeps the same words when the same reply is shaped again", () => {
    const samples: Array<[string, { name: string; userText: string; previous?: string }]> = [
      [
        "[pause] Tut mir leid, Jacin Jacin. Was meinst du?",
        { name: "Jacin", userText: "wie bitte", previous: "Der Kern sitzt in der Brust." },
      ],
      [
        "Ich höre. Was meinst du genau, Jacin Jacin?",
        { name: "Jacin", userText: "Ich bin müde.", previous: "" },
      ],
      [
        "Hallo. Ich bin da. Was beschäftigt dich gerade?",
        { name: "", userText: "Hallo", previous: "" },
      ],
      [
        "Ich würde dir das lieber mit meiner verbundenen Stimme beantworten. Bis dahin sag mir, was du davon selbst schon glaubst.",
        { name: "Jacin", userText: "Wer bist du?", previous: "" },
      ],
      [
        "Tut mir leid, Jacin Jacin. Der Kern sitzt in der Brust und leuchtet noch sehr ruhig hier.",
        { name: "Jacin", userText: "wie bitte", previous: "" },
      ],
      [
        "Jacinta bleibt hier. Jacin Jacin hört den Satz.",
        { name: "Jacin", userText: "Ich bin müde.", previous: "" },
      ],
    ];
    for (const [say, opts] of samples) {
      const once = shapeReply(say, opts);
      assert.equal(shapeReply(once, opts), once);
      assert.equal(once.includes("[pause]"), false);
    }
  });

  it("is the only reply-form call in the app", () => {
    const helpers = [
      "mentionNameOnce",
      "closeUninvitedQuestion",
      "shortenFirstSentence",
      "repairPhrase",
      "stripLeadingApology",
    ];
    const surface = join(srcRoot, "components/KushimApp.tsx");
    const definition = join(srcRoot, "kushim/dialogue.ts");
    for (const file of listSources(srcRoot)) {
      const source = readFileSync(file, "utf8");
      const shaped = calls(source, "shapeReply");
      if (file === surface) assert.equal(shaped, 1, file);
      else if (file === definition) assert.equal(shaped, 1, file);
      else assert.equal(shaped, 0, file);
      if (file === definition) continue;
      for (const helper of helpers) assert.equal(calls(source, helper), 0, `${file} ${helper}`);
    }

    const server = readFileSync(join(srcRoot, "kushim/server.ts"), "utf8");
    const stages = readFileSync(join(srcRoot, "kushim/stages.ts"), "utf8");
    const duplicated = [
      "höchstens einmal",
      "kürzer als der zweite",
      "ohne Entschuldigung",
      "kein Fragezeichen",
      "nicht verstanden",
      "Rückfrage",
    ];
    for (const phrase of duplicated) {
      assert.equal(server.includes(phrase), false, phrase);
      assert.equal(stages.includes(phrase), false, phrase);
    }
    assert.equal(server.includes("Frage nicht nach dem Namen."), true);
  });

  it("strips the apology and shortens when the previous line is empty", () => {
    const opts = { name: "Jacin", userText: "wie bitte", previous: "" };
    const out = shapeReply(
      "Tut mir leid, Jacin Jacin. Der Kern sitzt in der Brust und leuchtet noch sehr ruhig hier.",
      opts,
    );
    assert.equal(out, "Jacin. Der Kern sitzt in der Brust und leuchtet noch sehr ruhig hier.");
    assert.equal(/tut mir leid|entschuldigung|sorry|verzeih/i.test(out), false);
    assert.equal(out.includes("Sag den Satz noch einmal"), false);
    assert.equal(shapeReply(out, opts), out);
    assert.equal(
      shapeReply("Entschuldigung. Der Kern sitzt in der Brust und leuchtet noch sehr ruhig hier.", {
        name: "",
        userText: "nicht verstanden",
      }),
      "Der Kern sitzt. In der Brust und leuchtet noch sehr ruhig hier.",
    );
    assert.equal(
      shapeReply("Es tut mir leid.", { name: "Jacin", userText: "was?", previous: "  " }),
      "",
    );
    assert.equal(
      shapeReply("Ganz anders.", {
        name: "",
        userText: "wie bitte",
        previous: "Es tut mir leid.",
      }),
      repairPhrase("Es tut mir leid."),
    );

    const repairStage = STAGES.find((stage) => stage.hour === 6);
    assert.equal(repairStage?.label, "Reparatur");
    assert.equal(repairStage?.prompt, "");

    const fallback = readFileSync(join(srcRoot, "kushim/fallback.ts"), "utf8");
    assert.equal(fallback.includes("Sag den Satz noch einmal"), false);
    const repairTail = fallback.slice(fallback.indexOf("if (isRepairRequest(user))"));
    assert.match(repairTail, /if \(isRepairRequest\(user\)\) gesture = "acknowledge";/);
    assert.equal(/say\s*=/.test(repairTail), false);
  });

  it("keeps Jacinta whole and drops only a repeated Jacin", () => {
    const opts = { name: "Jacin", userText: "Ich bin müde.", previous: "" };
    const out = shapeReply("Jacinta bleibt hier. Jacin Jacin hört den Satz.", opts);
    assert.equal(out, "Jacinta bleibt hier. Jacin hört den Satz.");
    assert.equal(shapeReply(out, opts), out);
  });
});
