# KUSHIM-SPEZIFIKATION
Stand: Stufe 10 (Scouting verworfen) ist erledigt. Das setzt keinen nächsten Schritt. Jacin entscheidet die nächsten Schritte. Satzmelodie bleibt ausgesetzt.
Bindende Bildreferenz ist 00-ZIEL in `kushim-aussehen-masterprompt.md`. Stufe 3 Glas liegt schon auf main (#38), nicht offen.

## Referenz 00-ZIEL
Durchsichtiger Glaskörper, außen cyan/türkiser Fresnel-Rand, innen dichtes Limetten-/Gelbgrün-Filamentnetz (dicht im Rumpf, feiner an den Gliedern). Kopf ohne Gesicht, mit weichem unterem Dunst. Dezenter Bodenreflex und Fuß-Glow. Dreiviertelansicht. Athletischer Mann, etwa 7,5–8 Kopflängen, breite Schultern, schmale Taille. Menschliche Proportionen, exakt links/rechts symmetrisch nach 01-VORLAGE-zusatz.jpg. Kein roter Schulterknoten, keine Gelenkkugeln, keine Farbblöcke, keine ungleiche Wade.

Kein GLB, kein Anny, kein MPFB2, kein MakeHuman, keine Orbit-Steuerung, kein Bloom.

## Körper
Durchsichtiger erwachsener Mann, athletisch, neutral, nicht sexualisiert. Kein Geist, keine Rüstung, kein Roboter, kein Comic. Etwa 7,5–8 Kopflängen, breite Schultern, schmale Taille, Beine nicht überlängt. Menschliche Proportionen, exakt links/rechts symmetrisch nach 01-VORLAGE-zusatz.jpg. Beide Seiten sind Spiegel, die Waden eingeschlossen. Gewicht mittig. Kamera: ganze Figur, Dreiviertel, Augenhöhe, leichtes Tele, Kopfraum. Dezenter Bodenreflex und Fuß-Glow.

Atmung sitzt im Brustbein-Gelenk, nicht in einer Skalierung des Brustkorbs. 14 Züge pro Minute. Einatmen 40 % des Zyklus, Ausatmen 60 % (1 : 1,5), damit das Gewicht länger unten ruht. Spitzenhub 0,02 rad (etwa 1,1°) nur nach hinten-oben am Brustbein, Schultern und Schlüsselbeine bleiben liegen. Im Schweigen bleibt der Hub bei 75 % sichtbar; Lautstärke hebt nur die Amplitude bis 100 %, nie das Tempo. Es gibt keinen roten Schulterknoten.

## Material
Glasklar, Transmission, keine milchige Hülle, keine Haut, kein Stoff, kein Haar. Die Körperhülle ist ein dünnes klares Medium, kein Glasblock. Außen cyan/türkiser Fresnel-Rand. Stufe 3 Glas liegt schon auf main (#38), nicht offen. Optische Dicke 0,02 (vorher 0,25): die Silhouette bleibt, Filamente bleiben die Anatomie. Transmission bleibt 0,94, Rauheit 0,06, Metall 0, Opazität 1. Licht nur emissiv. Kopf ohne Gesicht, mit weichem unterem Dunst. Keine Augäpfel.

## Stromflüsse
Innen dichtes Limetten-/Gelbgrün-Filamentnetz, dicht im Rumpf, feiner an Armen und Beinen, links und rechts gleich. Kein roter Schulterknoten, keine Gelenkkugeln, keine Farbblöcke.

## Aura
Der äußere Rand ist der cyan/türkise Fresnel, keine zweite Hülle, kein Bloom, kein Nebel, der den Körper zudeckt. Der Radius steht: Skalierung 1, kein Sinus, kein Mitwachsen mit Atem oder Stimme. Im Idle keine eigene Schwingung. Helligkeit (emissiv) 0,12, daraus Opazität 0,066. Sprache hebt nur diese Helligkeit glatt bis 0,20, Opazität dann 0,11. Anstieg 0,45 s, Abfall 1,10 s, langsamer als die Filamente, damit der Rand ruhig bleibt. Kein roter Schulterknoten.

## Gesten
Nur die Grundhaltung. Keine Geste auf Silben. Nichts Übertriebenes. Der Atem ist keine Geste.

## Idle
Ruhiger Stand, Gewicht mittig. Kopf ohne Gesicht, weicher unterer Dunst. Kein roter Schulterknoten, keine Gelenkkugeln, keine Farbblöcke. Kein Gang, keine Kamerafahrt, keine Gewichtsverlagerung. Die Ansicht bleibt Dreiviertel.

## Gesprächsverhalten
Grundzustand, noch nicht trainiert. Zuhören vor dem Antworten. Eine Sache pro Turn. Kein Mehr-Text.

## Sprache
Deutsch. Erst der Satz, dann die Nuance. Natürliche Pause. Kurz. Keine Imitation eines anderen Assistenten.

## Farbe
Außen cyan/türkiser Fresnel-Rand. Innen Limette und Gelbgrün. Kein Rot als Schultersignal, keine Farbblöcke.

## Parameter
body.headUnits = 7.5..8
body.shoulderBuild = broad
body.waist = narrow
body.symmetry = left-right
body.proportion = 01-VORLAGE-zusatz.jpg
body.view = three-quarter
body.fingertipAnchor = "femur.mid"
body.armAbductionDeg = 8
body.elbowSoftDeg = 12
body.palmFacing = "camera"
body.fingersPerHand = 5
body.stance = "feet.together"
body.weight = "center"
breath.ratePerMin = 14
breath.inhaleShare = 0.4
breath.exhaleShare = 0.6
breath.sternumLiftRad = 0.02
breath.drive = "chest.rotation.x"
breath.scale = 1
breath.shoulders = "locked"
breath.audioAmp = "0.75..1.0"
material.transmission = 0.94
material.thickness = 0.02
material.roughness = 0.06
material.metalness = 0
material.opacity = 1
flow.paths = "chest-head, chest-hips, both-arms, both-legs"
flow.lateralDrift = 0
flow.density = "torso dense, limbs finer"
flow.symmetry = "left-right"
idle.weightShift = 0
