# Kushim — Bildzeit (2026-10-28 07 CET)

Nur dieser Punkt. Aussehen, `lock.ts` und `lock-check.ts` bleiben liegen. Die Satzmelodie bleibt ausgesetzt. `FIRST_PAUSE_MS` bleibt 320.

## Dieser Schritt

Stunden-Schritt 7. Die eine Pause war die Bedingung davor: nur anfassen, wenn sie falsch liegt. `gapAfterSentence` hält nach dem ersten Satz `max(Satzlücke, 320)`. Die Satzlücken der Stufen liegen bei 80 bis 240 ms, der Test verlangt unter 500 ms. Nichts weist 320 als falsch aus. Abkürzung: keine Änderung.

Die laufende Szene misst die Bildzeit.

- `src/kushim/frame-time.ts` nimmt das rohe Delta aus dem bestehenden `useFrame`, in Millisekunden. Die Bewegung klemmt weiter bei 50 ms. Die Messung nicht.
- Fenster 60 angenommene Frames: Mittel, Bilder pro Sekunde, Spitze. Null, negativ und nicht endlich zählen nicht.
- Der Schalter „Bildzeit“ steht unter der Kopfzeile, links, und ist aus dem Normalzustand. Die Zeile aktualisiert sich alle 250 ms nur in sich selbst. Die Zahlen liegen als `data-ms`, `data-fps`, `data-peak-ms` am Schalter.
- Kein Bloom, keine zweite Aura, kein Shader, kein Post-Pass. `assertClearLock` sieht denselben Void.

Stand: Pico erledigt 9, nächste Stufe 10 (der Lock-Check liegt schon). Stundenpipeline erledigt 7, nächster Schritt 8. Marker: `src/kushim/stand.ts`.

## Fünf Schritte voraus

Geprüft, bevor sie als Arbeit gelten. Abkürzungen stehen dabei. Die Satzmelodie ist keiner dieser Schritte.

1. **Stabilitätscheck nur lesen.** `lock-check.ts` wirft `LockBreach` schon. Solange `lock.test.ts` und `lock-check.test.ts` grün sind, gibt es in der Stunde keinen visuellen Eingriff.
2. **Eine Form für die Antwort.** Name, Abbruch, Rückfrage, Reparatur und der kurze erste Satz laufen durch `shapeReply` in `server.ts`, `fallback.ts` und der Oberfläche. Kein weiterer Pfad.
3. **Mund in der Satzpause nicht neu bauen.** In der Lücke ist der Bus still, die Abtastung gibt die Ruhe zurück, `applySpeechMouth` schreibt sie. Nur nachziehen, wenn die Lippe über `FIRST_PAUSE_MS` offen bleibt. Die Ruhe bei stillem Bus nicht anfassen. Keine Melodie.
4. **Spitze nur lesen.** Die Lock-Prüfung ist schon auf zwei Sekunden getaktet. Liegt die Spitze neben dem Mittel, entfällt der Schritt. Kein DPR, kein Material. Nur ein Ausreißer auf diesem Takt wäre ein Anlass, die Prüfung aus dem Frame zu nehmen.
5. **Sprechrate bleibt die Stufe.** `stage.speechRate` ist die eine Rate. Keine zweite Uhr und keine Tonhöhe. `FIRST_PAUSE_MS` bleibt 320.

## English

Frame time of the live scene is measurable. The existing render loop records its raw delta; a toggle shows the 60-frame mean, frames per second, and the peak. It is off by default and draws no new material. The 320 ms opening pause stays. Sentence melody stays deferred. Appearance and the lock are untouched.
