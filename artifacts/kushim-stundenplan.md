# Kushim — Stundenplan

Das Aussehen ist fertig und gesperrt. Quelle: `kushim-aussehen-masterprompt.md` und `src/kushim/lock.ts`.

Nicht anfassen: Silhouette, acht-Kopf-Proportion, Farben Void `#02060A` / Strom `#3AD7FF` / Kern `#E7FBFF` / Signal `#FF3B4E`, eine rote Stelle nur an Kushims rechter Schulter (links im Bild), frontale Kamera, kein Boden, keine zweite Person.

Erlaubt, eine Sache pro Stunde: Gesten in `src/kushim/motion.ts`, Gespräch in `src/kushim/stages.ts` und im Systemtext von `src/kushim/server.ts`, Pausen und Sprechrate. Filamentdichte nur innerhalb 0.86–1.

Die laufende App schaltet dieselben Stufen schon über die Echtzeit seit dem ersten Öffnen frei (`trainingHour`). Ein Stundenschritt ergänzt höchstens die nächste noch nicht gebaute Zeile unten und hakt sie ab.

## Noch nicht gebaut

- [x] Stabil: `lock.ts`-Werte unverändert und eingefroren. `src/kushim/lock-check.ts` wirft `LockBreach`, wenn Farbe, Silhouette, das eine rote Signal oder die frontale Kamera kippen. Wertevergleich: `src/kushim/lock.test.ts`. Laufzeit: `src/kushim/lock-check.test.ts`.

## Schon in der App

Atem, Rückkanal beim Tippen, Einatmen vor dem Wort, Sätze mit Pause, Gedächtnis der letzten Züge plus Schlüssel und ein kurzer älterer Faden, Schulter nur auf Ansprache, Reparatur, langsameres Gewicht, Leo-Stimme mit Browser-Ersatz, Gesten idle/listen/think/speak/explain/acknowledge/empathize.

Name höchstens einmal und nie erzwungen. Unterbrechung bricht den gesprochenen Satz ab (`trimInterrupted`), die nächste Antwort gilt dem neuen Thema. Rückfrage nur bei offenem Satz. Bei „nicht verstanden“ derselbe Inhalt in einem Satz, ohne Entschuldigung. Die sichtbare Antwort läuft einmal durch `shapeReply`: Server und Ersatz liefern Rohtext, die Oberfläche formt. Dieselben Formregeln stehen nicht noch einmal im Systemtext. Lippen: Viseme aa/ih/ou/ee/oh, bei Leo aus den Frequenzbändern, sonst im Texttakt. Blick mit Lerp 0,10. Blinzeln beider Augen ohne Silbenkopplung.

Der erste Satz ist kürzer als der zweite. Danach eine kurze Pause: im Browser `FIRST_PAUSE_MS` (320), bei Leo einmal `[pause]`. Der Chat zeigt die Pause nicht. Die eine Pause bleibt, solange nichts sie als falsch ausweist. Die Mundöffnung folgt dem vorhandenen Atem: Lautstärke setzt die Stärke, das Einatmen nimmt sechs Prozent weg, die Öffnung wird durch die Brustskala geteilt. Brusttempo und Brustkorb bleiben. Liegt der Sprechbus still, ruht der Mund: Lippe auf Skala 1, Kiefer auf der Ruhe, auch in der Satzpause und während die Pose noch spricht. Kein Flattern. Satzmelodie bleibt ausgesetzt.

Bildzeit: `src/kushim/frame-time.ts` misst das rohe Frame-Delta der laufenden Szene, vor der 50-ms-Klemme der Bewegung. Ein Schalter „Bildzeit“ unter der Kopfzeile zeigt Mittel, Bilder pro Sekunde und Spitze über 60 Frames. Aus ist der Normalzustand. Die Zeile liegt im DOM, nicht in der Szene. Kein Bloom, keine zweite Aura, kein neues Material.

Lock erneut gelesen: dieselbe Prüfung in `src/kushim/lock-check.ts`. Ein Bruch wirft weiter `LockBreach`, deutsch und englisch. Zusätzlich fallen ein ausgetauschter Shader oder eine andere Geometrie, ein umgehängtes oder ausgeblendetes Teil, eine seitliche oder kopfüber stehende Kamera, ein verschobener Szenenursprung, ein anderer Farbraum und ein Raum mit Hintergrund, Nebel, Ersatzmaterial, Umgebungskarte oder einem zweiten Objekt. `lock.ts` und die Figur sind unverändert. Der Takt bleibt zwei Sekunden.

Bau: Stufe 9 von 10 erledigt (kürzerer erster Satz). Nächste Stufe ist der Stabilitätscheck; der Lock liegt schon. Satzmelodie bleibt ausgesetzt. Stundenpipeline: Schritt 8 Mund in der Ruhe, gemessen in `src/kushim/speech.test.ts`, und Lock erneut gelesen. Die Pause von 320 ms ist geprüft und geblieben. Die Form des Mundes bleibt. Marker: `src/kushim/stand.ts`.

## Fünf Schritte voraus

Geprüft. Abkürzungen stehen dabei. Die Satzmelodie ist keiner dieser Schritte.

1. **Antwort nur durch `shapeReply`.** Erledigt: ein Aufruf in der Oberfläche, Rohtext aus Server und Ersatz, die Formregeln sind aus dem Systemtext. Keine weitere Form, kein zweiter Block im Systemtext. Die nächsten fünf Schritte dieser Zeile stehen unter „Antwortform“.
2. **Spitze nur lesen.** Die Lock-Prüfung läuft schon höchstens alle zwei Sekunden. Liegt die Spitze neben dem Mittel, entfällt der Eingriff. Kein DPR, kein Material, kein Bloom. Ein Ausreißer auf diesem Takt wäre der einzige Anlass, die Prüfung aus dem Frame zu nehmen.
3. **Sprechrate bleibt die Stufe.** `stage.speechRate` ist die eine Rate. Keine zweite Uhr, keine Tonhöhe. `FIRST_PAUSE_MS` bleibt 320, solange niemand die eine Pause als falsch hört.
4. **Dichte bleibt die Stufe.** `stage.filament` ist die eine Dichte. Der Check kennt schon 0.86–1. Keine zweite Dichte und kein Bloom.
5. **Letzten Visem nicht über den Texttakt halten.** Wenn `onend` später kommt als `durationMs`, bleibt sonst die letzte Form stehen. Nur nachziehen, wenn das gemessen offen ist: ein Vergleich in `sampleSpeechMouth`, dieselbe Ruhe, kein Ausblenden. Die Schätzung kann kürzer sein als die Stimme. Keine Melodie.

## Antwortform — fünf Schritte

Geprüft am Rohtext. Abkürzungen stehen dabei. Aussehen, Lock, Bildzeit, Mund und `FIRST_PAUSE_MS` gehören nicht dazu. Die Satzmelodie auch nicht.

1. **Namen nicht erfragen.** `shapeReply` streicht eine Frage nach dem Namen nicht. Geschlossen wird daraus „Wie heißt du.“ Der Satz „Frage nicht nach dem Namen.“ bleibt deshalb im Systemtext, sonst gäbe es keinen Pfad. Nicht nachbauen, solange der Satz hält. Fällt er doch, nur in `shapeReply` streichen und den Satz in derselben Änderung löschen.
2. **Reparatur ohne Vorgänger.** Ohne vorherige Zeile streicht `shapeReply` die Entschuldigung und kürzt. Kein Ersatzsatz in `fallback.ts`. Der leere Reparatur-Prompt in Stufe 6 bleibt leer.
3. **Name an der Wortgrenze.** `mentionNameOnce` trifft heute auch eine Vorsilbe (`Jacin` in `Jacinta`). Nur diese Funktion ändern, und nur wenn ein Name so zerlegt wird. Kein zweiter Reiniger.
4. **Abbruch bleibt an der Historie.** `trimInterrupted` schneidet den gesprochenen Satz. `shapeReply` formt die neue Zeile. Den Abbruch nicht in den Systemtext verlagern und nicht doppelt schneiden.
5. **Nächste Regel, dieselbe Funktion.** Ein Aufruf in der Oberfläche, Rohtext davor, `shapeReply(shapeReply(x)) === shapeReply(x)`. Kein neues Modul und keine Formzeile in `stages.ts`.
