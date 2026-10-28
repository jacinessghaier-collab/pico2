import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { absorbMemory, acceptMemory, emptyMemory, memoryPrompt, recallReply } from "./memory.ts";

const line = (role: "user" | "assistant", content: string) => ({ role, content });

describe("keyed facts", () => {
  it("keeps place and work, and does not let a job swallow the city", () => {
    const { memory } = absorbMemory(
      emptyMemory(),
      "Ich wohne in Berlin und arbeite als Ingenieurin.",
      [line("user", "Ich wohne in Berlin und arbeite als Ingenieurin.")],
      4,
    );
    assert.equal(memory.facts.wohnort, "Berlin");
    assert.equal(memory.facts.arbeit, "Ingenieurin");
    assert.equal(memory.thema, "");
  });

  it("stores a dislike without also storing it as a like", () => {
    const { memory } = absorbMemory(
      emptyMemory(),
      "Ich mag keinen Kaffee, aber ich mag Tee.",
      [line("user", "Ich mag keinen Kaffee, aber ich mag Tee.")],
      4,
    );
    assert.equal(memory.facts.ungern, "Kaffee");
    assert.equal(memory.facts.mag, "Tee");
  });

  it("keeps a person and an explicit pin", () => {
    let state = emptyMemory();
    state = absorbMemory(
      state,
      "Mein Hund heißt Bello.",
      [line("user", "Mein Hund heißt Bello.")],
      4,
    ).memory;
    state = absorbMemory(
      state,
      "Meine Schwester heißt Lea.",
      [line("user", "Meine Schwester heißt Lea.")],
      4,
    ).memory;
    state = absorbMemory(
      state,
      "Merk dir: der Termin ist am Freitag.",
      [line("user", "Merk dir: der Termin ist am Freitag.")],
      4,
    ).memory;
    assert.equal(state.facts.bezug, "Hund Bello, Schwester Lea");
    assert.equal(state.facts.merk, "der Termin ist am Freitag");
  });

  it("ignores a mood that is not a fact", () => {
    const { memory } = absorbMemory(
      emptyMemory(),
      "Ich bin müde.",
      [line("user", "Ich bin müde.")],
      4,
    );
    assert.deepEqual(memory.facts, {});
  });

  it("forgets one key and can wipe the thread digest without refilling it", () => {
    const older = "Der Apfelbaum hinter dem Haus ist krank.";
    const turns = [
      line("user", older),
      line("assistant", "Ich höre."),
      line("user", "Vergiss alles."),
    ];
    const kept = absorbMemory(emptyMemory(), older, turns.slice(0, 2), 1);
    assert.equal(kept.memory.thema, older.replace(/\.$/, ""));
    const wiped = absorbMemory(kept.memory, "Vergiss alles.", turns, 1);
    assert.equal(wiped.clearName, true);
    assert.deepEqual(wiped.memory.facts, {});
    assert.equal(wiped.memory.thema, "");
    assert.deepEqual(wiped.memory.earlier, []);
    const again = absorbMemory(wiped.memory, "Und nun?", turns, 1);
    assert.equal(again.memory.thema, "");
  });
});

describe("thread digest", () => {
  it("folds only the user lines that have left the window", () => {
    const garden = "Ich schreibe an einem langen Text über den Garten.";
    const tree = "Der Apfelbaum ist dieses Jahr krank.";
    const turns = [
      line("user", garden),
      line("assistant", "Ich höre."),
      line("user", tree),
      line("assistant", "Das ist schade."),
      line("user", "Was meinst du dazu?"),
    ];
    const first = absorbMemory(emptyMemory(), "Was meinst du dazu?", turns, 2);
    assert.equal(first.memory.thema, "Der Apfelbaum ist dieses Jahr krank");
    assert.deepEqual(first.memory.earlier, ["Ich schreibe an einem langen Text über den Garten"]);
    const second = absorbMemory(first.memory, "Was meinst du dazu?", turns, 2);
    assert.deepEqual(second.memory.earlier, first.memory.earlier);
    assert.equal(second.memory.thema, first.memory.thema);
  });

  it("keeps an older topic when a later line is only a name and stored facts", () => {
    const tree = "Der Apfelbaum hinter dem Haus ist krank.";
    const intro = "Ich heiße Jacin. Ich wohne in Berlin und arbeite als Ingenieurin.";
    const turns = [
      line("user", tree),
      line("assistant", "Ich höre."),
      line("user", "Weiter."),
      line("assistant", "Ich bin da."),
      line("user", "Gut."),
      line("assistant", "Ich höre."),
      line("user", intro),
    ];
    const { memory } = absorbMemory(emptyMemory(), intro, turns, 4);
    assert.equal(memory.facts.wohnort, "Berlin");
    assert.equal(memory.facts.arbeit, "Ingenieurin");
    assert.equal(memory.thema, "Der Apfelbaum hinter dem Haus ist krank");
    assert.equal(
      recallReply("Worüber haben wir gesprochen?", memory, "Jacin"),
      "Davor ging es darum: Der Apfelbaum hinter dem Haus ist krank.",
    );
  });

  it("does not treat a greeting as a topic", () => {
    const turns = [
      line("user", "Hallo"),
      line("assistant", "Ich bin da."),
      line("user", "Schon gut."),
    ];
    const { memory } = absorbMemory(emptyMemory(), "Schon gut.", turns, 1);
    assert.equal(memory.thema, "");
  });

  it("keeps the prompt short", () => {
    const memory = emptyMemory();
    memory.facts.merk = "x".repeat(400);
    memory.thema = "y".repeat(400);
    memory.earlier = ["z".repeat(400), "q".repeat(400)];
    const prompt = memoryPrompt(memory);
    assert.ok(prompt.length <= 420);
    assert.equal(prompt.includes("\n"), false);
  });
});

describe("recall and wire format", () => {
  it("answers a stored place in one sentence", () => {
    const { memory } = absorbMemory(
      emptyMemory(),
      "Ich wohne in Berlin.",
      [line("user", "Ich wohne in Berlin.")],
      4,
    );
    assert.equal(recallReply("Wo wohne ich?", memory, "Jacin"), "Du wohnst in Berlin.");
    assert.equal(recallReply("Wie heiße ich?", memory, "Jacin"), "Du heißt Jacin.");
    assert.equal(recallReply("Wie bitte?", memory, "Jacin"), null);
    assert.equal(memoryPrompt(memory), "Wohnort: Berlin");
  });

  it("accepts only a single capped line from the client", () => {
    assert.equal(
      acceptMemory("Wohnort: Berlin\nThema davor: Garten"),
      "Wohnort: Berlin Thema davor: Garten",
    );
    assert.equal(acceptMemory(12), "");
    assert.equal(acceptMemory("a".repeat(900)).length, 420);
  });
});
