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

Der erste Satz ist kürzer als der zweite. Danach eine kurze Pause: im Browser `FIRST_PAUSE_MS` (320), bei Leo einmal `[pause]`. Der Chat zeigt die Pause nicht. Die eine Pause bleibt, solange nichts sie als falsch ausweist. Die Mundöffnung folgt dem vorhandenen Atem: Lautstärke setzt die Stärke, das Einatmen nimmt sechs Prozent weg, die Öffnung wird durch die Brustskala geteilt. Brusttempo und Brustkorb bleiben. Liegt der Sprechbus still, ruht der Mund: Lippe auf Skala 1, Kiefer auf der Ruhe, auch in der Satzpause und während die Pose noch spricht. Kein Flattern. Endet der Texttakt vor `onend`, liegt dieselbe Ruhe an: die letzte Form bleibt nicht stehen. Kein Ausblenden. Satzmelodie bleibt ausgesetzt.

Bildzeit: `src/kushim/frame-time.ts` misst das rohe Frame-Delta der laufenden Szene, vor der 50-ms-Klemme der Bewegung. Ein Schalter „Bildzeit“ unter der Kopfzeile zeigt Mittel, Bilder pro Sekunde und Spitze über 60 Frames. Aus ist der Normalzustand. Die Zeile liegt im DOM, nicht in der Szene. Kein Bloom, keine zweite Aura, kein neues Material.

Lock erneut gelesen: dieselbe Prüfung in `src/kushim/lock-check.ts`. Ein Bruch wirft weiter `LockBreach`, deutsch und englisch. Zusätzlich fallen ein ausgetauschter Shader oder eine andere Geometrie, ein umgehängtes oder ausgeblendetes Teil, eine seitliche oder kopfüber stehende Kamera, ein verschobener Szenenursprung, ein anderer Farbraum und ein Raum mit Hintergrund, Nebel, Ersatzmaterial, Umgebungskarte oder einem zweiten Objekt. `lock.ts` und die Figur sind unverändert. Der Takt bleibt zwei Sekunden.

Stabilitätscheck um 09:00: dieselbe Prüfung, gelesen über die Trainingsstunden, Takt `LOCK_READ_SEC` (zwei Sekunden). Kein zweiter Check, kein Post-Pass, kein visueller Eingriff. Gemessen in `src/kushim/lock-check.test.ts`. `lock.ts` bleibt. Die Pause von 320 ms bleibt. Satzmelodie bleibt ausgesetzt.

Scouting um 18:40: der vorgelegte 10-Stufen-Plan (Weg A, B und C) beschreibt eine andere Figur als das gesperrte Still. Referenz bleibt Cyan auf Schwarz, eine rote Schulter, kein Boden, kein Nebel, frontale Kamera, acht Kopflängen. Stufen 1 bis 6 des Plans liegen schon im prozeduralen Rig. Boden, Nebel, Orbit, Bloom, Transmission-Buffer, Anny, MPFB2, Audio2Face und ein GLB-Tausch fallen an `lock-check`. Nichts davon ist gebaut. Kein zweites Rig.

Bau: Stufe 10 von 10 erledigt. Die Stundenpipeline ist zu. Eine elfte Stufe gibt es nicht. Der letzte Visem endet mit dem Texttakt, gemessen in `src/kushim/speech.test.ts`. Satzmelodie bleibt ausgesetzt. Die Pause von 320 ms bleibt. Marker: `src/kushim/stand.ts`. Die Kopfzeile nennt keine nächste Stufe mehr.

## Fünf Schritte voraus

Geprüft, bevor sie als Arbeit gelten. Alle fünf entfallen. Die Satzmelodie ist keiner dieser Schritte. Die Antwortform bleibt auf ihrer eigenen Spur.

1. **Kein zweites Körpermodell.** Anny, MPFB2, SOMA-X, SMPL-X und ein gedroptes GLB ersetzen Geometrie. `auditBaseline` wirft das schon. Das laufende Rig bleibt.
2. **Keine Bühne.** Boden, Reflektor, Nebel, Bloom, Umgebungskarte und eine transparente Clear-Farbe wirft `assertClearLock`. Orbit und FOV ungleich 26 wirft `assertFrontalCamera`. Der Void bleibt deckend schwarz.
3. **Keine neue Farbe.** Strom, Kern, Filament und das eine Rot bleiben die Schlüssel in `lock.ts`. Ein türkiser Rim und ein gelbgrünes Nerven-Retarget sind eine andere Palette.
4. **Kein zweiter Mund.** wLipSync, HeadAudio und Audio2Face brauchen Blendshapes oder CUDA. Dieser Mund ist der vorhandene Visem-Pfad. Keine zweite Uhr. `FIRST_PAUSE_MS` bleibt 320.
5. **Keine lokale Brücke.** SenseVoice, Qwen3-TTS und ein Electron-Pet laufen nicht in dieser Laufzeit. Stimme bleibt Leo, sonst der Browser. Ein Socket nach `127.0.0.1` wäre ein zweiter Pfad.

## Antwortform — fünf Schritte

Geprüft am Rohtext. Abkürzungen stehen dabei. Aussehen, Lock, Bildzeit, Mund und `FIRST_PAUSE_MS` gehören nicht dazu. Die Satzmelodie auch nicht.

Erledigt: 2 und 3. Offen bleiben diese drei:

1. **Namen nicht erfragen.** Offen. `shapeReply` streicht eine Frage nach dem Namen nicht. Geschlossen wird daraus „Wie heißt du.“ Der Satz „Frage nicht nach dem Namen.“ bleibt deshalb im Systemtext, sonst gäbe es keinen Pfad. Nicht nachbauen, solange der Satz hält. Fällt er doch, nur in `shapeReply` streichen und den Satz in derselben Änderung löschen.
2. **Reparatur ohne Vorgänger.** Erledigt. Ohne vorherige Zeile streicht `shapeReply` die Entschuldigung und kürzt. Kein Ersatzsatz, auch nicht „Sag den Satz noch einmal.“ `fallback.ts` setzt bei der Reparatur keine eigene Zeile. Der leere Reparatur-Prompt in Stufe 6 bleibt leer.
3. **Name an der Wortgrenze.** Erledigt. `mentionNameOnce` trifft den Namen nur als ganzes Wort. `Jacin` bleibt in `Jacinta` stehen. Kein zweiter Reiniger.
4. **Abbruch bleibt an der Historie.** Offen. `trimInterrupted` schneidet den gesprochenen Satz. `shapeReply` formt die neue Zeile. Den Abbruch nicht in den Systemtext verlagern und nicht doppelt schneiden.
5. **Nächste Regel, dieselbe Funktion.** Offen. Ein Aufruf in der Oberfläche, Rohtext davor, `shapeReply(shapeReply(x)) === shapeReply(x)`. Kein neues Modul und keine Formzeile in `stages.ts`.
