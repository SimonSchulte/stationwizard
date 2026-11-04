# Konzept: Einsatzplanung mit Vorbereitung (VB)

Status: **Plan, nicht umgesetzt.** Abstimmung über drei Oberflächen-Mocks und eine
Laufzettel-Druckvorschau. Grundlage: der Laufzettel „Weihnachtsmarkt Ummeln 2025“ (Excel,
47 Zeilen) und die „Führungshilfe Aufgaben aus Liste“ (Word, Hochformat, drei Aufträge je
Seite).

## 1. Ziel

Der Bereich „Einsatz“ heißt künftig durchgängig **Einsatzplanung**. Zu jedem Einsatz gehören
zwei Bausteine:

- **PEP** (Personaleinsatzplanung) – besteht bereits, bleibt fachlich unverändert.
- **VB** (Vorbereitung) – neu: eine Packliste aus **Laufzetteln** (Aufträgen), die vor dem
  Einsatz abgearbeitet werden. Grundlage ist eine **VB-Vorlage**, die beim Anlegen kopiert
  und mit dem Einsatz verknüpft wird. Die Kopie ist frei änderbar; Änderungen lassen sich
  **nach Rückfrage** auf die Vorlage zurückschreiben.

Zur VB gehören **Allgemeine Anweisungen** (Freitext, ein Blatt A4 quer). Ausgedruckt wird
die VB als dieses Blatt plus **drei Laufzettel je A4-Querseite**: schmale Streifen für einen
Bonhalter wie in der Gastronomie.

Nicht Gegenstand dieses Wurfs: digitales Abhaken der Laufzettel im Einsatz, Rollenprüfung,
Verknüpfung von „Transport mit“ mit dem Fahrzeugmodul (bleibt Freitext, weil die Quelle auch
Rollwagen, Gitterwagen und Einkaufskisten nennt).

## 2. Fachmodell

```text
Einsatz ─┬─ PEP (Nextcloud, <UUID>.pep.json, unverändert)
         └─ Vorbereitung (0..1) ── Abschnitt (n) ── Laufzettel (n) ── Position (n)
VB-Vorlage ── Abschnitt ── Laufzettel ── Position        (gleiche Struktur)
```

- **Einsatz** (neu als eigene Zeile): `id` (UUID), `titel`, `beginn`, `ende`, optional
  `hiorgVeranstaltungId` (eindeutig) und `pepId` (UUID der PEP-Datei). Bisher gibt es keinen
  Einsatz als Datensatz – nur HiOrg-Veranstaltungen und PEP-Dateien. Ohne diese Zeile müsste
  die Übersicht jede PEP-Datei laden, um ihre Veranstaltung zu finden (die Nextcloud-Liste
  liefert nur UUID/ETag). Ein Einsatz entsteht beim ersten Anlegen von PEP oder VB zu einer
  HiOrg-Veranstaltung oder von Hand ohne HiOrg.
- **Abschnitt**: `id`, `titel`, `farbe`, optional `fachgruppe` – fachliche Gruppierung, im
  Beispiel nach Auftraggeber (GF Betreuung, GF TeSi, GF Verpflegung). Reihenfolge =
  Druckreihenfolge. `farbe` ist ein Schlüssel aus einer festen Palette von acht
  Abschnittsfarben (`ABSCHNITT_FARBEN`, Tokens `--abschnitt-1` … `--abschnitt-8` in
  `src/tokens.less`, Druckwerte in `PDF_FARBEN`); kein frei wählbarer Farbwert, damit der
  Ausdruck lesbar bleibt und keine zweite Palette entsteht. Die `fachgruppe` des Abschnitts
  ist die Vorgabe für seine Laufzettel und lässt sich auf alle übertragen.
- **Laufzettel**: `id`, `ueberschrift` (Auftragstext, Vorgabe „Material verlasten“),
  `lagerort`, `transportMit`, `auftraggeber` (Auftraggeber für Rückfragen), optional
  `fachgruppe`, `positionen`.
- **Fachgruppe**: die in der App bekannten Gruppen der Gruppenführungsrollen
  (`sanitaet`, `betreuung`, `verpflegung`, `tesi`, `fuehrung`, siehe `Hauptrolle` in
  `benutzerverwaltung/models/benutzerkonto.model.ts`), dargestellt mit den vorhandenen
  Kategorienfarben `--kat-san`, `--kat-btvp`, `--kat-tesi`, `--kat-fuehrung`. Die Liste wird
  nach `kern/` gezogen statt aus der Benutzerverwaltung importiert.
  Die laufende Nummer wird **nicht gespeichert**, sondern beim Anzeigen und Drucken aus der
  Reihenfolge gebildet – ein Verschieben braucht dann keine Neunummerierung.
- **Position**: `id`, `anzahl` (Text, darf leer sein: in der Quelle fehlt sie z. B. bei
  Suppe, Ketchup, Pommes), `material`.
- Die VB-Kopie trägt `vorlageId`/`vorlageVersion`, jeder kopierte Abschnitt, Laufzettel und
  jede Position eine `herkunftId` (Id des Gegenstücks in der Vorlage) – dasselbe Muster wie
  `herkunftEintragId` im Angebotswesen. Darauf beruht der Abgleich in Abschnitt 5.

### Übernahme der Excel-Quelle

Die Excel-Datei hat eine Zeile je Material (Spalten LdfNr, Anzahl, erl., Material, Lagerort,
Transport mit, Ansprechpartner); die Word-Führungshilfe fasst mehrere Materialien zu einem
Auftrag zusammen. Vorschlag: beim Übernehmen **gleiche Kombinationen aus Lagerort, Transport
und Ansprechpartner zu einem Laufzettel zusammenfassen**. Aus 47 Zeilen werden so
17 Laufzettel in 3 Abschnitten (6 Druckseiten). Die Spalte „erl.“ entfällt in der Vorlage,
sie wird auf dem Ausdruck zum Kästchen je Position.

## 3. Speicherung und Worker

Eigene D1-Datenbank `EINSATZPLANUNG_DB` (`stationwizard-einsatzplanung`), dokumentartig wie
`angebote` und `pruefvorlagen`: eine Zeile je Vorlage bzw. je Vorbereitung, Inhalt als
geprüftes JSON, eigene `version`. Ein Speichern ist ein Schreibvorgang, nicht einer je
Position (Free-Tier). Kein Fremdschlüssel in andere Datenbanken nötig; Präzedenz
`ANGEBOTSWESEN_DB`.

| Tabelle          | Inhalt                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- |
| `einsaetze`      | Kopfdaten, `hiorg_veranstaltung_id` partiell eindeutig, `pep_id`, `version`           |
| `vb_vorlagen`    | `titel`, `inhalt` (Abschnitte/Laufzettel/Positionen + Anweisungen), Kennzahlenspalten |
| `vorbereitungen` | `einsatz_id` eindeutig, `vorlage_id`, `vorlage_version`, `inhalt`, `version`          |

Startbestand „Weihnachtsmarkt Ummeln“ als `INSERT` in der Migration (feste Ids), wie die
NFR-EE-Liste. Die Quelle enthält nur Material, Lagerorte und Funktionsbezeichnungen, keine
Personendaten.

Neue Endpunkte (`worker/src/einsatzplanung.ts` als Verteiler, `einsatzplanung-gemeinsam.ts`,
je Ressource eine Datei; Körper über `leseJsonKoerper()`, Versionen über `etag.ts`):

| Pfad                                      | Methode            | Vertrag                                                            |
| ----------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| `/api/einsatzplanung/einsaetze`           | GET / POST         | Alle Einsätze samt VB-Kennzahlen; Neuanlage mit `If-None-Match: *` |
| `/api/einsatzplanung/einsaetze/<UUID>`    | GET / PUT          | Einzelner Einsatz; Update nur mit `If-Match`                       |
| `/api/einsatzplanung/einsaetze/<UUID>/vb` | GET / PUT / DELETE | Vorbereitung; Anlage mit `If-None-Match: *`, sonst `If-Match`      |
| `/api/einsatzplanung/vb-vorlagen`         | GET / POST         | Vorlagen als Kopfdaten mit Kennzahlen                              |
| `/api/einsatzplanung/vb-vorlagen/<UUID>`  | GET / PUT / DELETE | Vorlage samt Inhalt; Update nur mit `If-Match`                     |

Grenzen: höchstens 30 Abschnitte, 300 Laufzettel, 50 Positionen je Laufzettel, Textfelder
200 Zeichen, Anweisungen 6000 Zeichen; Körper ≤ 256 KB. Das „Kopieren“ einer Vorlage macht
der Client (neue Ids, `herkunftId` gesetzt) und legt das Ergebnis mit `If-None-Match: *` an –
kein eigener Kopierendpunkt. Ein 412 beim Zurückschreiben auf die Vorlage bewahrt die VB und
zeigt beide Stände (Abschnitt „Konflikte“ in `CLAUDE.md`).

## 4. Oberfläche

**Umbenennung.** Navigation „Einsatz“ → „Einsatzplanung“ als aufklappbarer Zweig wie
„Personal“: _Einsätze_, _PEP_, _VB-Vorlagen_. Route `/einsatzplanung`, `/einsatz` und
`/einsatz/editor` leiten weiter. Der Code bleibt unter `src/app/einsatz/` (Präzedenz:
Kalender unter `ausbildung/`); neue Dateien unter `einsatz/vb/` bzw. `einsatz/components/`.

- **Mock 1 – Einsatz** (`/einsatzplanung/einsatz/<UUID>`): Seitenkopf mit Zurück-Pfeil,
  Kopfdaten aus HiOrg, zwei Karten **PEP** und **Vorbereitung**. Ohne VB: Leerzustand mit
  „Aus Vorlage anlegen“ (Hauptaktion) und „Leer beginnen“. Dialog zur Vorlagenwahl mit
  Suche, Kennzahlen und Version.
- **Mock 2 – VB-Editor** (`/einsatzplanung/einsatz/<UUID>/vb`): Reiter _Laufzettel_ und
  _Allgemeine Anweisungen_. Links Abschnitte mit Laufzettelkarten (Ziehen per CDK
  Drag & Drop zwischen Abschnitten), rechts die Bearbeitung des gewählten Laufzettels
  (Felder, Positionen, Position hinzufügen, Laufzettel teilen/zusammenführen,
  duplizieren, löschen). Hinweis an der Liste „n Abweichungen von der Vorlage“ mit
  „Auf Vorlage anwenden…“. Aktionen: Drucken, Speichern, Menü (Als neue Vorlage
  speichern, VB löschen). `VerlassenSchutz` für ungesicherte Änderungen, Rückgängig wie im
  Kalender.
- **Mock 3 – VB-Vorlagen** (`/einsatzplanung/vb-vorlagen`): Liste links, Ansicht rechts,
  Bearbeiten mit demselben Editor. Dialog „Änderungen auf Vorlage anwenden?“ listet jede
  Abweichung (geändert/neu/gelöscht) mit Ankreuzfeld; Löschungen sind standardmäßig nicht
  angekreuzt, weil sie oft nur für diesen Einsatz gelten.

Mobil: Ansehen und Drucken ja, Bearbeiten bleibt wie der PEP-Editor auf Desktop
ausgerichtet; die Grenze wird in der Oberfläche benannt.

## 5. Abgleich mit der Vorlage

Reine Funktion `vbAbgleich(vorlage, vb)` (eigener Test) über `herkunftId`:

- **neu**: Element ohne `herkunftId` bzw. mit einer, die es in der Vorlage nicht gibt.
- **gelöscht**: Vorlagenelement, auf das keine `herkunftId` mehr zeigt.
- **geändert**: Felder oder Reihenfolge weichen ab.

„Übernehmen“ wendet nur die angekreuzten Änderungen auf den **frisch geladenen** Stand der
Vorlage an, schreibt mit `If-Match` und setzt danach `vorlageVersion` und die `herkunftId`s
neuer Elemente in der VB. Andere Einsätze mit älteren Kopien bleiben unverändert – eine Kopie
ist eine Momentaufnahme.

## 6. Druck

pdfmake über `ladePdfBibliothek()`, Farben aus `PDF_FARBEN`; keine zweite Palette.

- **Seite 1 – Allgemeine Anweisungen**, A4 quer: Einsatz, Zeitraum, Ort, Freitext in zwei
  Spalten, Fußzeile mit Anzahl der Laufzettel.
- **Folgeseiten – Laufzettel**, A4 quer, drei Streifen je Seite (je ca. 99 × 210 mm),
  gestrichelte Schnittlinien. Inhalte nach der Word-Führungshilfe, aber so dicht gesetzt,
  dass der größte Teil des Streifens den Materialzeilen gehört:
  - oben ein freier **Klemmrand** (ca. 13 mm) für den Bonhalter mit dem Einsatztitel,
  - ein Kopf aus „Auftrag“, Fachgruppe als beschrifteter Chip in ihrer Farbe, Überschrift
    und LfdNr,
  - ein **Farbband** (ca. 2 mm) in der Abschnittsfarbe links über die ganze Länge des
    Streifens, dazu Farbpunkt und Abschnittsname am Klemmrand – so bleiben Abschnitt und
    Fachgruppe auch im Schwarz-Weiß-Druck über den Text erkennbar,
  - der **Materialbereich mit festem Raster von 23 Zeilen** (je ca. 5 mm, Kästchen, Anzahl,
    Material); nicht belegte Zeilen bleiben mit Kästchen für Nachträge von Hand,
  - Lagerort, Transport mit und „Rückfragen an“ als je eine kleine Zeile,
  - „Durchführung von“, „Durchgeführt ☐ Ja ☐ nicht möglich“ und „Grund“ kompakt am Fuß.

### Platzberechnung und Warnung

Reine Funktion `laufzettelPlatz(laufzettel)` (eigener Test), die **der Druck und der Editor
gemeinsam** verwenden, damit Warnung und Ausdruck nie auseinanderlaufen:

- Kapazität 23 Materialzeilen. Eine Position belegt `max(1, ⌈Zeichen / 38⌉)` Zeilen (Breite
  des Materialtexts bei 13 pt auf dem Streifen); der genaue Wert wird beim Umsetzen gegen das
  echte pdfmake-Ergebnis geeicht.
- Bricht Lagerort, Transport oder Auftraggeber um, kostet jede Umbruchzeile über die erste
  Reserve hinaus eine Materialzeile.
- Ergebnis: belegte Zeilen, Kapazität, Zustand `ok` / `knapp` (ab 21) / `zu-voll`.

Der Editor zeigt die Belegung an jeder Laufzettelkarte („6 / 23“) und als Balken unter der
Positionentabelle. Bei `zu-voll` erscheint ein Hinweis direkt an der Karte und an der Tabelle
(„Passt nicht auf einen Laufzettel: 2 Zeilen zu viel“) mit der Aktion „In zwei Laufzettel
aufteilen“. Speichern bleibt möglich. Beim Drucken meldet der `MeldungsDienst` eine Warnung
mit der Anzahl betroffener Laufzettel; gedruckt wird dann ein Fortsetzungsstreifen
„LfdNr 16 (Fortsetzung)“, nie eine kleinere Schrift.

## 7. Arbeitspakete

1. **AP-E1 Umbenennung**: Navigation als Zweig, Route `/einsatzplanung` mit Weiterleitungen,
   Titel und Texte; Tests der Routen.
2. **AP-E2 Worker**: `EINSATZPLANUNG_DB`, Migration mit Startvorlage, Endpunkte aus
   Abschnitt 3, Prüfung des Inhalts, Worker-Tests; `CLAUDE.md`-API-Tabelle, Einrichtung.
3. **AP-E3 Einsätze**: Einsatz-Store, Einsatzseite (Mock 1), Anlage aus HiOrg-Veranstaltung,
   Verknüpfung mit bestehender PEP.
4. **AP-E4 VB-Editor** (Mock 2) samt Kopie aus Vorlage und Anweisungen.
5. **AP-E5 Vorlagen und Abgleich** (Mock 3), `vbAbgleich()` mit Tests.
6. **AP-E6 Druck** (Anweisungsblatt, Laufzettelstreifen), `laufzettelPlatz()` mit Tests,
   Platzanzeige und Warnung im Editor (Mock 2b).
7. **AP-E7 (optional) Excel-Import** weiterer Vorlagen im Format der Quelle,
   `@e965/xlsx` dynamisch.

## 8. Offene Fragen

1. Ist ein Einsatz immer eine HiOrg-Veranstaltung, oder braucht es Einsätze ohne HiOrg
   (Plan: beides möglich)?
2. Zusammenfassen der Excel-Zeilen zu Laufzetteln nach Lagerort/Transport/Ansprechpartner –
   passt das, oder soll jede Zeile ein eigener Laufzettel bleiben?
3. Eigene Datenbank `EINSATZPLANUNG_DB` (Plan) oder Tabellen in einer bestehenden?
4. Gehören Uhrzeit/Fälligkeit („bis Freitag 18 Uhr“) auf den Laufzettel?
5. Wer darf Vorlagen ändern? Vorerst „Rechte vorerst alle, Rollen später“.
6. Betreuung und Verpflegung teilen sich heute die Farbe `--kat-btvp` (im Kalender eine
   Kategorie „Bt/Vp“). Auf dem Laufzettel unterscheidet sie nur die Beschriftung. Soll
   Verpflegung eine eigene Farbe bekommen (neues Token `--kat-vp`)?
