# Kushim — Lock-Check (2026-10-28 04 CET)

Nur dieser Punkt. Das Gesprächsgedächtnis liegt in `src/kushim/memory.ts` und in `Kushim-Hourly-Plan-20261028-04.md`.

## Dieser Schritt

`LOCK` ist zur Laufzeit eingefroren. Die Werte (Void `#02060A`, Strom `#3AD7FF`, Kern `#E7FBFF`, Signal `#FF3B4E`, Proportionen) sind unverändert. `src/kushim/lock-check.ts` prüft die Figur beim Bau und danach alle zwei Sekunden. Ein Bruch wirft `LockBreach` (deutsch und englisch) und die Ansicht zeigt die Meldung. Farben der Shader sind versiegelt. Atmung, Gesten, Filament 0.86–1, der Schulterpuls, Viseme, Kiefer, Blick und Blinzeln bleiben im bisherigen Rahmen. Test: `src/kushim/lock-check.test.ts`.

## Fünf Schritte voraus

Geprüft, bevor sie als Arbeit gelten. Abkürzungen stehen dabei.

1. **Hülle an `tickKushim` koppeln, nicht nachbauen.** Atem (±0.008 / 0.012 / 0.01), Kernpuls (0.08, mal 1.15 bei Ansprache) und Filament 0.86–1 stehen als Konstanten in `LOCK_CANON`. Ändert sich die Amplitude, bricht der Check absichtlich. Dieselbe Änderung muss die Konstante mitziehen. Kein zweiter Bewegungsrechner.
2. **Lippen und Viseme nur auf vorhandenem Glas.** Der Mund aus der Lippensynchron bleibt das vorhandene Glas. Öffnung, Kiefer (höchstens 0.01), Blick (±0.006 / ±0.004) und Blinzeln (Deckkraft bis 0.15) stehen in `LOCK_CANON`. Eine neue Farbe oder ein Haut-Material fällt durch die Materialzählung.
3. **Kein Pixelvergleich.** DPR und der Funkenring machen Bild-Hashes unruhig. Die strukturelle Prüfung (Proportion, eine rote Stelle auf −X, Void, FOV 26, keine Kamerarolle) bleibt der stabile Ersatz.
4. **Void nicht nachbelichten.** Kein Tone-Mapping, kein Postprocessing, das `#02060A` anhebt. `assertClearLock` deckt Clear-Color, Alpha und `NoToneMapping` ab. Ein Bloom-Pass wäre ein Lock-Bruch, kein Feinschliff.
5. **Zweites Rot nur als bewusste Lock-Änderung.** Ein weiteres rotes Material außerhalb der rechten Schulter wirft sofort. Dafür müssten Masterprompt, `LOCK`, `LOCK_CANON` und dieser Test gemeinsam geändert werden. Still mitziehen ist der Fehler, den der Check verhindern soll.

## Nicht in diesem Lauf

Namensnennung, Unterbrechen, Rückfrage, Reparatur und das längere Gedächtnis. Die stehen schon in der App. Nächster Stundenpunkt nach dem Lock ist die Mundöffnung gegen den Atem, ohne die gesperrte Silhouette anzufassen.
