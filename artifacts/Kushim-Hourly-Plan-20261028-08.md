# Kushim — Mund in der Ruhe (2026-10-28 08 CET)

Nur dieser Punkt. Aussehen, `lock.ts` und `lock-check.ts` bleiben liegen. Bildzeit bleibt liegen. Die Satzmelodie bleibt ausgesetzt. `FIRST_PAUSE_MS` bleibt 320.

## Dieser Schritt

Stunden-Schritt 8, nach der Bildzeit. Die Lippe soll zu sein, solange der Sprechbus still ist. Nachgezogen wird nur, wenn eine Messung sie offen lässt.

Gemessen, an der laufenden Kette `speakBrowser` → `sampleSpeechMouth` → `tickKushim`:

- Vor dem ersten Wort ist der Bus still. Lippe auf Skala 1, Kiefer auf der Ruhe, auch wenn die Pose schon `speak` sagt.
- Nach `onend` bleibt der Bus still, bis der Pausentimer die nächste Zeile startet. Der Timer ist `FIRST_PAUSE_MS`. Die alten Viseme-Rahmen liegen noch im Bus. Eine Uhr mitten in das offene „a“ von „Abend“ spielt sie nicht noch einmal.
- Dieselbe Ruhe über mehr als `FIRST_PAUSE_MS`, Frame für Frame gleich. Kein Flattern. Ein wilder Atem öffnet nichts.
- Die nächste Zeile öffnet den Mund wieder. `stopSpeech` setzt die Ruhe und hält sie.
- Leo: `[pause]` lässt den Bus aktiv. Die Pausenlänge steht nicht in den Samples. Ein geratenes Schweigen würde die Viseme verschieben. Deshalb kein zweites Fenster.

Die Form ist nicht nachgezogen. Bildzeit, `frame-time.ts` und der Schalter bleiben. Marker: `src/kushim/stand.ts`. Stand: Pico erledigt 9, nächste Stufe 10. Stundenpipeline erledigt 8, nächster Schritt 9.

## Fünf Schritte voraus

Geprüft, bevor sie als Arbeit gelten. Abkürzungen stehen dabei. Die Satzmelodie ist keiner dieser Schritte.

1. **Stabilitätscheck nur lesen.** `lock-check.ts` wirft `LockBreach` schon. Solange `lock.test.ts` und `lock-check.test.ts` grün sind, gibt es keinen visuellen Eingriff. Kein zweiter Check, kein Post-Pass.
2. **Antwort nur durch `shapeReply`.** Der Pfad läuft schon in `server.ts`, `fallback.ts` und noch einmal in der Oberfläche. Keine vierte Form, kein zweiter Block im Systemtext. Nur anfassen, wenn eine Antwort daran vorbeigeht.
3. **Spitze nur lesen.** Die Lock-Prüfung läuft schon höchstens alle zwei Sekunden. Liegt die Spitze neben dem Mittel, entfällt der Eingriff. Kein DPR, kein Material, kein Bloom. Ein Ausreißer auf diesem Takt wäre der einzige Anlass, die Prüfung aus dem Frame zu nehmen.
4. **Sprechrate bleibt die Stufe.** `stage.speechRate` ist die eine Rate. Keine zweite Uhr, keine Tonhöhe. `FIRST_PAUSE_MS` bleibt 320, solange niemand die eine Pause als falsch hört.
5. **Letzten Visem nicht über den Texttakt halten.** `weightsAt` lässt die letzte Form stehen, bis `onend` den Bus stilllegt. Nur nachziehen, wenn das gemessen offen ist: ein Vergleich in `sampleSpeechMouth`, dieselbe Ruhe, kein Ausblenden. Die Schätzung kann kürzer sein als die Stimme. Keine Melodie.

## English

While the speech bus is idle the mouth stays at rest: lip scale 1, jaw on its rest pose, including the sentence gap and while the speak pose is still set. Stale viseme frames are not replayed. There is no flicker. The shape was not retuned. Frame time, `FIRST_PAUSE_MS`, and the appearance lock stay as they are. Sentence melody stays deferred.
