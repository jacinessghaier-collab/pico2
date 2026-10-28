# Kushim — Mundöffnung gegen den Atem (2026-10-28 06 CET)

Nur dieser Punkt. Aussehen, `lock.ts` und `lock-check.ts` bleiben liegen. Die Satzmelodie bleibt ausgesetzt.

## Dieser Schritt

Stunden-Schritt 6. Die Mundöffnung und der Brustkorb haben sich vorher geschlagen: das Visem aa hatte einen eigenen Sinus (`elapsed * 16`, ±6 %), und die Brustskala hat die Öffnung mitgedehnt, weil der Kopf am Brustkorb hängt.

- Eine Phase für beide: `breathCueAt` in `src/kushim/lipsync.ts`. Sprechen 1,35 Hz, Mitfühlen 0,55, Ruhe 0,85. Unverändert.
- Die Lautstärke setzt die Stärke, von der Schwelle 0,35 bis 1.
- Das Einatmen nimmt nur diese alten 6 % weg. Das Ausatmen bleibt bei der Lautstärke. Kein zweiter Sinus, die Spitze steigt nicht über die Lautstärke.
- Die Öffnung (nicht die ruhende Lippe) wird durch die Brustskala geteilt. Die Skala kommt aus `LOCK_CANON.breathX/Y/Z`, derselben Konstante wie der Lock-Check. `sx` teilt durch Y, `sy` durch X, `sz` durch Z.
- Der Kieferabstand bleibt `JAW_DROP` (0,05) und wird auf `jawDrop` (0,01) begrenzt.
- `lock.ts` ist nicht angefasst.

Stand: Pico erledigt 9, nächste Stufe 10 (der Lock-Check liegt schon). Stundenpipeline erledigt 6, nächster Schritt 7. Marker: `src/kushim/stand.ts`.

## Fünf Schritte voraus

Geprüft, bevor sie als Arbeit gelten. Abkürzungen stehen dabei. Die Satzmelodie ist keiner dieser Schritte.

1. **Pause nur an einer Stelle nachziehen.** Wenn die eine Pause zu kurz oder zu lang ist, nur `FIRST_PAUSE_MS`. Kein `[long-pause]`, kein Flüstern, keine Tonhöhen-Tags.
2. **Bildzeit ohne neues Material.** Die laufende Szene messen. Kein Bloom, keine zweite Aura, kein Shader. Ein Post-Pass, der `#02060A` anhebt, wäre ein Lock-Bruch.
3. **Stabilitätscheck nur lesen.** `lock-check.ts` wirft `LockBreach` schon. Solange `lock.test.ts` und `lock-check.test.ts` grün sind, gibt es in der Stunde keinen visuellen Eingriff.
4. **Eine Form für die Antwort.** Name, Abbruch, Rückfrage, Reparatur und der kurze erste Satz laufen durch `shapeReply`. Kein zweiter Pfad in der Oberfläche oder im Systemtext.
5. **Mund in der Satzpause zu.** Solange der Sprechbus still ist, schreibt `applySpeechMouth` die Ruhe. Nur nachziehen, wenn die Lippe über `FIRST_PAUSE_MS` offen bleibt. Keine Melodie.

## English

Mouth opening now uses the chest breath that was already there. Loudness sets the viseme strength. The inhale eases that strength by the old 6 percent flutter, and the opening delta is divided by the chest scale so the torso does not stretch it. The separate `aa` sine is gone. Breath rate, the chest, and `lock.ts` are unchanged. Sentence melody stays deferred.
