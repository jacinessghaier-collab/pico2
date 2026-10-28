# Kushim — Kürzerer erster Satz (2026-10-28 05 CET)

Nur dieser Punkt. Aussehen, `lock.ts`, `lock-check.ts`, Anatomie, Lippensynchron-Kern und der Gedächtnisspeicher bleiben liegen.

## Dieser Schritt

Pico-Stufe 9. Der erste Satz einer Antwort ist kürzer als der zweite. Danach genau eine kurze Pause.

- Sichtbarer Text entsteht in `shapeReply` (`src/kushim/dialogue.ts`). Kein `[pause]` im Chat.
- Browser-Stimme: nach dem ersten Satz `FIRST_PAUSE_MS` (320 ms), danach die bisherige Satzlücke.
- Leo: derselbe Text mit einem `[pause]` an der xAI-Stimme. Keine weiteren Tags, keine Tonhöhe.
- Ein-Satz-Reparatur bleibt ein Satz.
- Satzmelodie bleibt ausgesetzt.

Stand: Pico erledigt 9, nächste Stufe 10 (der Lock-Check liegt schon). Stundenpipeline erledigt 5, nächster Schritt 6. Marker: `src/kushim/stand.ts`.

## Fünf Schritte voraus

Geprüft, bevor sie als Arbeit gelten. Abkürzungen stehen dabei. Die Satzmelodie ist keiner dieser Schritte.

1. **Mundöffnung gegen den Atem, nicht neu rechnen.** Stunden-Schritt 6. Die Viseme-Stärke darf mit der Lautstärke steigen. Atemtempo und Brustkorb bleiben. `lock.ts` nicht anfassen. Dieselbe Konstante, die der Lock-Check schon kennt, nicht duplizieren.
2. **Pause nur an einer Stelle nachziehen.** Wenn die eine Pause zu kurz oder zu lang ist, nur `FIRST_PAUSE_MS`. Kein `[long-pause]`, kein Flüstern, keine Tonhöhen-Tags.
3. **Bildzeit ohne neues Material.** Die laufende Szene messen. Kein Bloom, keine zweite Aura, kein Shader. Ein Post-Pass, der `#02060A` anhebt, wäre ein Lock-Bruch.
4. **Stabilitätscheck nur lesen.** `lock-check.ts` wirft `LockBreach` schon. Solange `lock.test.ts` und `lock-check.test.ts` grün sind, gibt es in der Stunde keinen visuellen Eingriff.
5. **Eine Form für die Antwort.** Name, Abbruch, Rückfrage, Reparatur und der kurze erste Satz laufen durch `shapeReply`. Kein zweiter Pfad in der Oberfläche oder im Systemtext.

## English

The first sentence of a reply is shorter than the second, then one short pause. Browser speech waits; Leo gets a single `[pause]` tag. The chat stays clean. Sentence melody stays deferred. Appearance and the lock are untouched.
