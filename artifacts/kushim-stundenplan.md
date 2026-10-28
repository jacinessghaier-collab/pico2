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

Der erste Satz ist kürzer als der zweite. Danach eine kurze Pause: im Browser `FIRST_PAUSE_MS`, bei Leo einmal `[pause]`. Der Chat zeigt die Pause nicht. Die Mundöffnung folgt dem vorhandenen Atem: Lautstärke setzt die Stärke, das Einatmen nimmt sechs Prozent weg, die Öffnung wird durch die Brustskala geteilt. Brusttempo und Brustkorb bleiben. Satzmelodie bleibt ausgesetzt.

Bau: Stufe 9 von 10 erledigt (kürzerer erster Satz). Nächste Stufe ist der Stabilitätscheck; der Lock liegt schon. Satzmelodie bleibt ausgesetzt. Stundenpipeline: Schritt 6 Mund gegen Atem steht in `src/kushim/lipsync.ts` und `src/kushim/motion.ts`. Der eigene Sinus auf aa ist weg. Nächster Stundenschritt ist die eine Pause, nur wenn sie falsch liegt. Marker: `src/kushim/stand.ts`.

## Fünf Schritte voraus

Geprüft. Abkürzungen stehen dabei. Die Satzmelodie ist keiner dieser Schritte.

1. Wenn die eine Pause falsch liegt, nur `FIRST_PAUSE_MS` ändern. Keine Tonhöhe, keine weiteren Sprech-Tags.
2. Bildzeit der laufenden Szene. Kein Bloom, keine zweite Aura, kein neues Shader-Material.
3. Stabilitätscheck nur erneut lesen. `lock-check.ts` wirft schon. Kein Eingriff, solange der Test steht.
4. Neue Antwortform nur in `shapeReply`. Name, Abbruch, Reparatur und der kurze erste Satz sind schon dort.
5. Mund in der Satzpause zu. Liegt der Bus still, bleibt die Lippe in der Ruhe. Nur nachziehen, wenn eine Messung sie offen lässt.
