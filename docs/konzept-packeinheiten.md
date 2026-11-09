# Konzept: Packeinheiten, Lager und abgeleitete Zettel

Status: **Entwurf; Stufe 1 (Lager und Artikel) umgesetzt, Stufen 2 und 3 offen** (siehe `docs/arbeitsstand.md`). Er löst das heutige Modell der VB (Abschnitte mit Laufzetteln,
`docs/konzept-einsatzplanung-vb.md`) ab, sobald die Stufen unten gebaut sind. Das bestehende
Datenmodell wird nicht migriert: der Betreiber legt die Daten neu an (siehe Abschnitt 8).
Mocks: Artifact „Packeinheiten“, Entscheidungen aus dem Gespräch mit dem Betreiber.

## 1. Warum

Die Auswertung einer echten Vorbereitung (Weihnachtsmarkt, 7 Abschnitte) zeigte ein zu feingliedriges
Modell: 33 Laufzettel für 66 Positionen (im Schnitt zwei), 21 Laufzettel mit genau einer Position, 24
mit der Überschrift „Material verlasten“, 15 verschiedene Lager (mit abweichenden Schreibweisen wie
„ZF Büro“ und „ZF-Büro“) und ein Lager (Küchenlager) mit 9 Laufzetteln in 5 Abschnitten. Die
eigentlichen **packbaren Einheiten** (Kiste „Gastro-Material“, Box „Hygiene 1“, Gewürzkiste, Rollwagen,
Fahrzeug) stehen nur als Text in Überschriften und Positionen. Ziel ist, dass Einheiten entstehen, die
**ein Helfer** von Anfang bis Ende packt.

## 2. Begriffe und Entscheidungen

| Begriff             | Festlegung                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Einheit**         | Drei Ebenen: **Kiste**, **Wagen**, **Fahrzeug**. Eine Kiste kommt in einen Wagen oder lose auf ein Fahrzeug, ein Wagen auf ein Fahrzeug. Eine Kiste enthält keine Kiste.                                                           |
| **Kiste**           | **Stammdatum**: Name, Heimatlager, Inhalt (Artikel mit Menge). Wird in vielen Einsätzen verwendet. Im Aufbau eines Einsatzes lässt sich der Inhalt abweichend setzen.                                                              |
| **Wagen, Fahrzeug** | Kein Stammdatum. Werden je Aufbau (Einsatz oder Vorlage) angelegt. Ein Fahrzeug darf später auf das Fahrzeugmodul verweisen (offen).                                                                                               |
| **Artikel**         | Stammdatum aus dem **Artikelkatalog**: Name, Einheit (Stück, Liter, Packung …), **Heimatlager**. Eine **Position** ist Artikel + Menge + Bemerkung.                                                                                |
| **Lager**           | **Feste Liste**, einmal gepflegt, mit einer Reihenfolge für den Laufweg. Das Lager einer Position ergibt sich aus dem Artikel und lässt sich je Position überschreiben.                                                            |
| **Laufzettel**      | **Abgeleitet**, kein eigenes Objekt. Je Einheit ein Zettel, den **ein Helfer** abarbeitet. Positionen nach Lager sortiert (Laufweg). Von Hand pflegbar nur „Anweisung“ und „Bemerkung“ der Einheit. Ein einziger Haken „Erledigt“. |
| **Schild**          | Je Einheit. Ziel oben, Einsatz unten, Foto mit Farbrahmen, Soll-Inhalt, Zeile für das Gewicht (handschriftlich). Kistenschild nach der Vorlage „Kistenbezeichnung“.                                                                |
| **Farbe**           | Die Farbe des **obersten Ziels** im Aufbau (Fahrzeug oder Wagen auf oberster Ebene), von Kisten und Wagen darin geerbt. Auf dem Zettel als Farbband, auf dem Schild als Rahmen ums Foto. Keine Fachgruppe.                         |
| **Ansprechperson**  | Eine je Einsatz („Rückfragen an“), auf allen Zetteln gleich.                                                                                                                                                                       |
| **Reihenfolge**     | Nur Hinweise („vorher“, „zum Schluss“) als Phase an Eintrag oder Einheit. Die App erzwingt nichts. Die Zettelnummern folgen der natürlichen Packfolge: erst Kisten, dann Wagen, dann Fahrzeuge.                                    |
| **Material-Modul**  | Bleibt getrennt. Eine Kiste der Vorbereitung ist keine Behälter-Instanz des Fahrzeugchecks. Der Artikelkatalog könnte später geteilt werden.                                                                                       |
| **Jährlicher Plan** | Aus einer **Aufbau-Vorlage** kopiert (Momentaufnahme wie heute bei der VB-Vorlage), dann angepasst.                                                                                                                                |

## 3. Fachmodell

```
Lager (Reihenfolge)
  └─ Artikel (Heimatlager, Einheit)
       ├─ Kiste (Stammdatum: Heimatlager, Inhalt = [Artikel × Menge])
       └─ Position im Aufbau (Artikel × Menge, Lager überschreibbar)

Aufbau (je Einsatz / Vorlage)
  └─ Fahrzeug | Wagen (oberste Ebene = Ziel, trägt Farbe und Foto)
       ├─ Wagen (nur in einem Fahrzeug)
       ├─ Kiste (Verweis auf Stammdatum, Anzahl, optional abweichender Inhalt)
       └─ Artikel × Menge (lose)
```

Abgeleitet (nie gespeichert):

- **Zettel einer Einheit**: Nummer, Name, Ziel (die Einheit, in die sie kommt, sonst „Einsatzort“),
  Farbe, Zeilen. Zeilen sind die Positionen der Einheit **plus** die Kisten und Wagen darin als je eine
  Zeile („1 Kiste Gastro-Material“), nach Lager der Zeile sortiert, dann nach Name. Ein Lagerwechsel
  steht als Trennzeile („Küchenlager“). Das Lager einer Kiste ist ihr Heimatlager, das eines Wagens oder
  Fahrzeugs der Einsatzort (keine Trennzeile).
- **Nummern**: Kisten 1 … k, dann Wagen, dann Fahrzeuge, jeweils in Aufbaureihenfolge.
- **Schildinhalt**: Soll-Inhalt der Einheit, gleiche Positionen zusammengezählt (Menge × Artikel,
  nie Freitext addiert).
- **Lagerzettel** (später): je Lager alle Positionen aller Einheiten, die dort geholt werden.

## 4. Speicherung

Alles in `EINSATZPLANUNG_DB` (neue Migration `0023_packeinheiten.sql`), Muster wie `vorbereitungen`:
dokumentartig, vom Worker streng geprüftes JSON, eigene `version` je Zeile, `If-Match` beim Ändern,
`If-None-Match: *` beim Anlegen, `angelegt_von`/`geaendert_von` aus der geprüften Anmeldung.

| Tabelle           | Inhalt                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `lager`           | `id`, `name` (eindeutig in Vergleichsform), `reihenfolge`, `version`                                                                       |
| `artikel`         | `id`, `name` (eindeutig), `einheit`, `lager_id` (Heimatlager), `version`                                                                   |
| `kisten`          | `id`, `name` (eindeutig), `lager_id` (Heimatlager der Kiste), `inhalt` (JSON), Kennzahl `positionen`, `version`                            |
| `aufbauten`       | `einsatz_id` (Primärschlüssel, Fremdschlüssel auf `einsaetze`), `inhalt` (JSON), Kennzahlen `einheiten`, `kisten`, `positionen`, `version` |
| `aufbau_vorlagen` | `id`, `titel`, `inhalt` (JSON), Kennzahlen, `version`                                                                                      |

Kennzahlspalten setzt nur der Worker. Ein Lager oder Artikel lässt sich nur löschen, solange nichts
darauf verweist (409 `EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG`).

### Aufbau-Inhalt (Vorlage und Aufbau gleich)

```jsonc
{
  "anweisungen": "…",                       // allgemeine Anweisungen, wie bisher (≤ 6000)
  "einheiten": [                            // oberste Ebene: Fahrzeuge oder Wagen
    {
      "id": "<uuid>", "typ": "fahrzeug" | "wagen",
      "name": "Rollwagen 03", "farbe": "abschnitt-1" … "abschnitt-8",
      "foto": "<JPEG-Data-URL>",            // optional, wie bisher
      "anweisung": "", "bemerkung": "",
      "inhalt": [ /* Einträge */ ]
    }
  ]
}
// Eintrag
{ "art": "artikel", "id": "<uuid>", "artikelId": "<uuid>", "menge": 2, "bemerkung": "",
  "lagerId": "<uuid>" | null, "phase": null | "vorher" | "zum-schluss" }
{ "art": "kiste",   "id": "<uuid>", "kisteId": "<uuid>", "anzahl": 1,
  "inhalt": [ { "artikelId": "<uuid>", "menge": 3, "bemerkung": "" } ],   // Momentaufnahme
  "phase": null | … }
{ "art": "wagen",   "id": "<uuid>", "einheit": { /* Wagen wie oben, nur in einem Fahrzeug */ } }
```

- **Momentaufnahme der Kiste:** Beim Hinzufügen kopiert der Aufbau den aktuellen Inhalt der Kiste in
  `inhalt` und behält `kisteId` nur zur Nachverfolgung (wie `herkunftEintragId` im Angebot und
  `vorlage_id` bei Checks). Spätere Änderungen am Stammdatum wirken **nicht** rückwirkend; ein
  Abgleichshinweis („Kiste weicht von den Stammdaten ab“) bietet das Übernehmen an.
- **Grenzen (Vorschlag):** 100 Lager, 2000 Artikel, 300 Kisten mit je 100 Positionen, 60 Einheiten
  je Aufbau, 200 Einträge je Einheit, Texte 200 Zeichen, Körper ≤ 512 KB. Menge: positive Zahl,
  höchstens drei Nachkommastellen, in der Oberfläche „85 Liter“ mit Bemerkung „80–90“.
- **Prüfung:** unbekannte Felder abgelehnt, Ids je Art eindeutig, jede `artikelId`/`kisteId`/`lagerId`
  zeigt auf einen vorhandenen Datensatz, ein Wagen nur direkt in einem Fahrzeug, keine Kiste in einer
  Kiste, kein Zyklus.

### Endpunkte (Vorschlag, in `CLAUDE.md` nachzutragen)

| Pfad                                                | Methode                   | Vertrag                                                             |
| --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `/api/einsatzplanung/lager`                         | GET / POST                | Alle Lager in einem Aufruf; Neuanlage nur mit `If-None-Match: *`    |
| `/api/einsatzplanung/lager/<UUID>`                  | PUT / DELETE              | Update und Löschen nur mit `If-Match`; Löschen gesperrt bei Nutzung |
| `/api/einsatzplanung/artikel`                       | GET / POST                | Katalog in einem Aufruf; Neuanlage mit `If-None-Match: *`           |
| `/api/einsatzplanung/artikel/<UUID>`                | PUT / DELETE              | wie Lager                                                           |
| `/api/einsatzplanung/kisten`                        | GET / POST                | Kisten samt Inhalt in einem Aufruf (kleiner Bestand)                |
| `/api/einsatzplanung/kisten/<UUID>`                 | PUT / DELETE              | wie Lager                                                           |
| `/api/einsatzplanung/einsaetze/<UUID>/aufbau`       | GET / PUT / DELETE        | Anlage mit `If-None-Match: *`, sonst `If-Match`                     |
| `/api/einsatzplanung/aufbau-vorlagen` und `/<UUID>` | GET / POST / PUT / DELETE | wie `vb-vorlagen`                                                   |

Free-Tier: Stammdaten (Lager, Artikel, Kisten) kommen jeweils **in einem Aufruf** und werden über
`kern/abruf-puffer.ts` gebündelt, nach eigenen Schreibzugriffen verworfen. Eine Änderung im Aufbau
schreibt eine Zeile, nie eine je Eintrag.

## 5. Oberfläche

Bausteine wie in `CLAUDE.md` (`Seitenkopf`, `Leerzustand`, `MeldungsDienst`, Material-Komponenten).

1. **Stammdaten** (Verwaltung): _Lager_ (Liste mit Ziehgriff für die Reihenfolge), _Artikel_ (Tabelle mit
   Suche, Heimatlager, Einheit), _Kisten_ (Liste, Detail mit Inhalt, Heimatlager, Kistenschild-Vorschau).
2. **Aufbau-Editor** (ersetzt den VB-Editor): links der **Baum** (Fahrzeug → Wagen → Kisten und lose
   Artikel), rechts die gewählte Einheit mit Inhalt, Farbe (nur oberste Ebene), Foto, Anweisung,
   Bemerkung und **Zettelvorschau** (die abgeleiteten Zeilen mit Lagertrennern und Platzanzeige).
3. **Druckdialog**: Streifen je Seite, Reihenfolge des Aushangs (nach Lager des Zettels oder nach Nummer),
   Mitdrucken (Anweisungen, Zettel, Schilder, Kistenschilder), Prüfung vor dem Drucken (Zettel zu voll,
   Einheit ohne Foto, Artikel ohne Heimatlager, abweichende Kiste).
4. Mobil: ansehen und drucken, wie beim VB-Editor.

## 6. Druck

Der vorhandene Druck bleibt Grundlage (`vb-pdf-definition.ts`, `laufzettel-layout.ts`,
`laufzettel-platz.ts`) und wird auf abgeleitete Zettel umgestellt:

- **Streifen:** Kopf („Auftrag“, Name der Einheit, LfdNr), Farbband links als **einziger** Farbhinweis,
  Zielblock („VON“ = erstes Lager, „AUF / IN“ = Ziel), Raster mit 23 Zeilen, dazwischen Lagertrenner
  (kosten je eine Zeile), „Erledigt“ und „Bemerkung“ am Fuß. Fachgruppe entfällt.
- **Schild** (A5 quer, zwei je A4 hoch, Schnittlinie): Ziel groß im Kopfband, Soll-Inhalt links, Foto mit
  Farbrahmen rechts (leerer Rahmen ohne Foto), Gewichtszeile, unten der Einsatz.
- **Kistenschild** nach `Kistenbezeichnung.dotx`: Kistenbezeichnung, Inhalt, Gewicht; ein Foto gibt es
  nicht, die Farbe des Ziels steht als Rahmen um das Inhaltsfeld.
- **Aushang** nach Lager des Zettels (erstes Lager) oder nach Nummer sortierbar; die Nummern bleiben.

## 7. Stufen

1. **Lager und Artikel:** Tabellen, Endpunkte, Stammdatenseiten, Tests. Der VB-Editor nutzt das Lager
   schon als Auswahl (ersetzt das Freitext-Vorschlagsfeld).
2. **Kisten:** Stammdaten, Kistenschild, Kistenzettel im Druck.
3. **Aufbau:** Tabellen `aufbauten`/`aufbau_vorlagen`, Aufbau-Editor, Ableitung der Zettel, Umstellung des
   Drucks, Abgleich mit Stammdaten. Danach entfallen VB-Endpunkte und -Editor.

Jede Stufe ist eigenständig prüfbar, mit Worker-Tests (Prüfung, Konflikte, Löschschutz) und Frontend-Tests
(`zettelAbleiten()`, Sortierung, Zusammenzählen, Platzberechnung) sowie einer Sicht im Browser.

## 8. Bestehende Daten

Die vorhandenen VB-Daten werden **nicht** migriert. Der Betreiber legt Lager, Artikel, Kisten und den
Aufbau neu an. Bis Stufe 3 bleiben VB-Editor und Endpunkte unverändert bestehen. Ein Import aus der
Excel-Packliste ist nicht geplant.

## 9. Offene Fragen

Mit dem Vorschlag als **Annahme**, bis der Betreiber anders entscheidet:

1. **Artikelkatalog pflegen:** Wer legt Artikel an, und wie viele sind es? Annahme: wenige hundert,
   Anlage direkt aus dem Aufbau-Editor („Neuer Artikel …“), Pflege in der Verwaltung.
2. **Mengen:** „80–90 Liter“ wird Menge 85, Einheit Liter, Bemerkung „80–90“. Annahme: Zahl plus Einheit
   plus Bemerkung genügt.
3. **Abweichender Kisteninhalt:** gilt nur im jeweiligen Aufbau. Ob er in die Stammdaten zurückfließt,
   entscheidet eine Aktion „In Stammdaten übernehmen“, nie automatisch.
4. **Reihenfolge der Lager:** Annahme eine einfache Reihenfolge, keine Gebäude mit Räumen.
5. **Zettel für Fahrzeuge:** Annahme: Ein Fahrzeug bekommt Schild und kurzen Zettel („Rollwagen 01 … verladen“).
6. **Fahrzeuge aus dem Fahrzeugmodul:** Verweis oder getrennte Namen? Annahme: Freitext je Aufbau.
7. **Rollen:** wie bisher „Rechte vorerst alle, Rollen später“. Stammdaten ändern wäre der erste Fall für
   eine Rolle.
