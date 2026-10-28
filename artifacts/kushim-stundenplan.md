# Kushim — Stundenplan

Das Aussehen ist fertig und gesperrt. Quelle: `kushim-aussehen-masterprompt.md` und `src/kushim/lock.ts`.

Nicht anfassen: Silhouette, acht-Kopf-Proportion, Farben Void `#02060A` / Strom `#3AD7FF` / Kern `#E7FBFF` / Signal `#FF3B4E`, eine rote Stelle nur an Kushims rechter Schulter (links im Bild), frontale Kamera, kein Boden, keine zweite Person.

Erlaubt, eine Sache pro Stunde: Gesten in `src/kushim/motion.ts`, Gespräch in `src/kushim/stages.ts` und im Systemtext von `src/kushim/server.ts`, Pausen und Sprechrate. Filamentdichte nur innerhalb 0.86–1.

Die laufende App schaltet dieselben Stufen schon über die Echtzeit seit dem ersten Öffnen frei (`trainingHour`). Ein Stundenschritt ergänzt höchstens die nächste noch nicht gebaute Zeile unten und hakt sie ab.

## Noch nicht gebaut

- [x] Stabil: `lock.ts`-Werte unverändert und eingefroren. `src/kushim/lock-check.ts` wirft `LockBreach`, wenn Farbe, Silhouette, das eine rote Signal oder die frontale Kamera kippen. Wertevergleich: `src/kushim/lock.test.ts`. Laufzeit: `src/kushim/lock-check.test.ts`.

## Schon in der App

Atem, Rückkanal beim Tippen, Einatmen vor dem Wort, Sätze mit Pause, Gedächtnis der letzten Züge plus Schlüssel und ein kurzer älterer Faden, Schulter nur auf Ansprache, Reparatur, langsameres Gewicht, Leo-Stimme mit Browser-Ersatz, Gesten idle/listen/think/speak/explain/acknowledge/empathize.

Name höchstens einmal und nie erzwungen. Unterbrechung bricht den gesprochenen Satz ab (`trimInterrupted`), die nächste Antwort gilt dem neuen Thema. Rückfrage nur bei offenem Satz. Bei „nicht verstanden“ derselbe Inhalt in einem Satz, ohne Entschuldigung. Lippen: Viseme aa/ih/ou/ee/oh, bei Leo aus den Frequenzbändern, sonst im Texttakt. Blick mit Lerp 0,10. Blinzeln beider Augen ohne Silbenkopplung.

Der erste Satz ist kürzer als der zweite. Danach eine kurze Pause: im Browser `FIRST_PAUSE_MS` (320), bei Leo einmal `[pause]`. Der Chat zeigt die Pause nicht. Die eine Pause bleibt, solange nichts sie als falsch ausweist. Die Mundöffnung folgt dem vorhandenen Atem: Lautstärke setzt die Stärke, das Einatmen nimmt sechs Prozent weg, die Öffnung wird durch die Brustskala geteilt. Brusttempo und Brustkorb bleiben. Satzmelodie bleibt ausgesetzt.

Bildzeit: `src/kushim/frame-time.ts` misst das rohe Frame-Delta der laufenden Szene, vor der 50-ms-Klemme der Bewegung. Ein Schalter „Bildzeit“ unter der Kopfzeile zeigt Mittel, Bilder pro Sekunde und Spitze über 60 Frames. Aus ist der Normalzustand. Die Zeile liegt im DOM, nicht in der Szene. Kein Bloom, keine zweite Aura, kein neues Material.

Bau: Stufe 9 von 10 erledigt (kürzerer erster Satz). Nächste Stufe ist der Stabilitätscheck; der Lock liegt schon. Satzmelodie bleibt ausgesetzt. Stundenpipeline: Schritt 7 Bildzeit. Die Pause von 320 ms ist geprüft und geblieben. Marker: `src/kushim/stand.ts`.

## Fünf Schritte voraus

Geprüft. Abkürzungen stehen dabei. Die Satzmelodie ist keiner dieser Schritte.

1. **Stabilitätscheck nur lesen.** `lock-check.ts` wirft `LockBreach` schon. Solange `lock.test.ts` und `lock-check.test.ts` grün sind, gibt es keinen visuellen Eingriff. Kein zweiter Check, kein Post-Pass.
2. **Antwort nur durch `shapeReply`.** Der Pfad läuft schon in `server.ts`, `fallback.ts` und noch einmal in der Oberfläche. Keine vierte Form, kein zweiter Block im Systemtext. Nur anfassen, wenn eine Antwort daran vorbeigeht.
3. **Mund in der Satzpause nicht neu bauen.** `speakBrowser` setzt den Bus in der Lücke still, `sampleSpeechMouth` gibt dann die Ruhe, `applySpeechMouth` schreibt sie. Nur nachziehen, wenn eine Beobachtung die Lippe über `FIRST_PAUSE_MS` offen zeigt. Die Ruhe bei stillem Bus bleibt, wo sie ist. Keine Melodie.
4. **Spitze nur lesen.** Die Lock-Prüfung läuft schon höchstens alle zwei Sekunden. Liegt die Spitze neben dem Mittel, entfällt der Eingriff. Kein DPR, kein Material, kein Bloom. Ein Ausreißer auf diesem Takt wäre der einzige Anlass, die Prüfung aus dem Frame zu nehmen.
5. **Sprechrate bleibt die Stufe.** `stage.speechRate` ist die eine Rate. Keine zweite Uhr, keine Tonhöhe. `FIRST_PAUSE_MS` bleibt 320, solange niemand die eine Pause als falsch hört.
