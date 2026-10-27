# Kushim — Stundenplan

Das Aussehen ist fertig und gesperrt. Quelle: `kushim-aussehen-masterprompt.md` und `src/kushim/lock.ts`.

Nicht anfassen: Silhouette, acht-Kopf-Proportion, Farben Void `#02060A` / Strom `#3AD7FF` / Kern `#E7FBFF` / Signal `#FF3B4E`, eine rote Stelle nur an Kushims rechter Schulter (links im Bild), frontale Kamera, kein Boden, keine zweite Person.

Erlaubt, eine Sache pro Stunde: Gesten in `src/kushim/motion.ts`, Gespräch in `src/kushim/stages.ts` und im Systemtext von `src/kushim/server.ts`, Pausen und Sprechrate. Filamentdichte nur innerhalb 0.86–1.

Die laufende App schaltet dieselben Stufen schon über die Echtzeit seit dem ersten Öffnen frei (`trainingHour`). Ein Stundenschritt ergänzt höchstens die nächste noch nicht gebaute Zeile unten und hakt sie ab.

## Noch nicht gebaut

- [ ] Name, den der Mensch nennt, höchstens einmal pro Antwort und nie erzwungen. (Erkennung liegt schon in `rememberName`.)
- [ ] Wenn der Mensch Kushim unterbricht, bricht der Satz ab und die nächste Antwort beginnt beim neuen Thema. (Stop liegt in `stopSpeech`.)
- [ ] Kurze Rückfrage nur, wenn der letzte Satz des Menschen wirklich offen ist.
- [ ] Bei „nicht verstanden“ denselben Inhalt in einem Satz, ohne Entschuldigungsschleife.
- [ ] Stabil: keine weiteren Codeänderungen, nur prüfen dass `lock.ts` unverändert ist.

## Schon in der App

Atem, Rückkanal beim Tippen, Einatmen vor dem Wort, Sätze mit Pause, Gedächtnis der letzten Züge, Schulter nur auf Ansprache, Reparatur, langsameres Gewicht, Leo-Stimme mit Browser-Ersatz, Gesten idle/listen/think/speak/explain/acknowledge/empathize.
