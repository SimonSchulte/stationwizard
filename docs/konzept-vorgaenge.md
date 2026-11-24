# Konzept: Fahrzeugakte, Formulare und Vorgänge

Stand: Entwurf zur Abstimmung. Grundlage ist der klickbare Prototyp (Variante A) und die
Anlage 5 „Schadens- und Verlustmeldung“ (Stand 23.11.2023). Nichts davon ist umgesetzt.

## 1. Ziel und Abgrenzung

Eine Fahrzeugakte mit Reitern (Übersicht, Wartung, Kilometer, Formulare, Vorgänge, Verlauf)
ersetzt die zwei parallelen Oberflächen (Master-Detail in der Übersicht und
`/fahrzeuge/:id`). Darauf bauen zwei Features:

- **Formulare:** zunächst genau eines, die Schadens- und Verlustmeldung. Alle Felder werden
  in der Oberfläche ausgefüllt, die Unterschrift stammt aus dem Benutzerkonto, das
  gedruckte oder gemailte PDF ist das Original-Formular, befüllt.
- **Vorgänge:** zunächst genau eine feste Art, „Fahrzeug/Material defekt“, mit den Stufen
  Schadensmeldung ausgefüllt, Angebote eingeholt, Eingereicht, Genehmigt, Geplant, Erledigt.
  Weitere Vorgangsarten kommen später und sind nicht Teil dieses Plans.
- **Aufgaben:** Unterschriftsanfragen und Postfach-Zuordnungen erscheinen im Aufgabenbereich.
- **Postfach „angebote@“:** eine gemeinsame Adresse. Eingehende Angebote werden dort in der
  Oberfläche angesehen und einem Vorgang zugeordnet. Kein Postfach je Fahrzeug.

Nicht Teil: andere Vorgangsarten, mehrere Formulare, Benachrichtigungen per Mail an
Unterschriftsanfragen (nur Aufgabenbereich), ein richtiges Backend.

## 2. Getroffene Entscheidungen

| #   | Entscheidung                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ohne mindestens ein Angebot ist „Eingereicht“ nicht möglich, auch nicht nach nachträglichem Entfernen.                                                                                                         |
| 2   | Die Reihenfolge der Unterschriften ist egal. Pflicht sind „festgestellt durch“ und „verantwortliche Person“, „Leitung“ ist optional. Drucken, Senden und Einreichen gehen nach den zwei Pflichtunterschriften. |
| 3   | Die Unterschrift kommt aus dem Benutzerkonto (gezeichnet oder aus einer Schrift erzeugt).                                                                                                                      |
| 4   | Stellungnahme ist mit „Der Sachverhalt wird wie oben beschrieben bestätigt.“ vorbelegt. Zu langer Sachverhalt erzeugt beim Druck ein Beiblatt.                                                                 |
| 5   | Empfänger des Mailversands stehen in der Systemkonfiguration (Adressen folgen).                                                                                                                                |
| 6   | Ein Postfach `angebote@`, mit Vorschau und Zuordnung.                                                                                                                                                          |
| 7   | Andere Vorgangsarten später.                                                                                                                                                                                   |

## 3. Offene Entscheidungen

| #   | Frage                                                                        | Empfehlung                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Eingangsweg für `angebote@`: Cloudflare Email Worker oder Resend Inbound     | Email Worker, siehe 7.                                                                                                                                                                                                                      |
| E2  | Gibt es bereits Mail auf `hiorg-wache.com`? Der Eingang braucht MX-Einträge. | Eigene Subdomain (zum Beispiel `postfach.`), dann bleibt der Bestand unberührt. Hostname vom Betreiber bestätigen lassen (CLAUDE.md: kein DNS-/Mail-Bestand überschreiben).                                                                 |
| E3  | Wer darf Vorgänge anlegen, Stufen weiterschalten, Empfänger konfigurieren?   | Anlegen und Unterschreiben: jede Anmeldung. Stufe „Genehmigt“ und Empfänger: `zugfuehrung`. Bis zur Admin-Rolle gilt die bekannte Lücke der Rollenvergabe (siehe `rollen.ts`).                                                              |
| E4  | Löst das Senden die Stufe „Eingereicht“ aus?                                 | Ja, ein Schritt („Einreichen per E-Mail“). Zusätzlich reines Senden ohne Stufenwechsel für spätere Stufen.                                                                                                                                  |
| E5  | Reicht eine eingefügte Bildunterschrift als „digital unterschrieben“?        | Technisch ist das eine einfache elektronische Signatur ohne Nachweiswert wie eine qualifizierte. Ob die empfangende Stelle das akzeptiert, ist zu klären. Fallback bleibt der Ausdruck mit Handunterschrift (gewollt: Drucken ist möglich). |
| E6  | Aufbewahrung und Datenschutz der Mails und Angebote                          | Verworfene Mails und nicht zugeordnete Mails nach 30 Tagen löschen (beim Listen, kein Cron). Zugeordnete Angebote bleiben beim Vorgang. Fristen vom Betreiber bestätigen.                                                                   |
| E7  | R2-Bucket anlegen (Betreiber), siehe 8.                                      | Ja, vor dem Deployment des Workers.                                                                                                                                                                                                         |
| E8  | Wie werden Angebote an die Einreichungsmail gehängt?                         | Zuerst nur die Meldung als PDF. Angebote nur, wenn die Messung (Phase 0) zeigt, dass das Free-Tier-CPU-Limit hält.                                                                                                                          |

## 4. Architektur

Die Fachlogik bekommt ein eigenes Frontend-Modul `src/app/vorgaenge/`, weil „Vorgang“
später mehr als Fahrzeuge meint. Die Fahrzeugakte (`src/app/fahrzeuge/`) bindet dessen
Komponenten in den Reitern ein. Die Daten liegen in `FAHRZEUGE_DB`: ein Vorgang hängt an
genau einem `fahrzeuge.id`, die Berechtigung ergibt sich später aus `fahrzeuge.gruppe`. Das
ist dieselbe Begründung wie bei `material` (kein neues `[[d1_databases]]`). Dateien liegen
in einem neuen R2-Bucket, nicht in D1.

```
Browser                          Worker (index.ts)                  Speicher
Fahrzeugakte ── /api/vorgaenge ─→ vorgaenge*.ts ──────────────────→ FAHRZEUGE_DB
Formular, PDF (pdf-lib, Browser)  vorgaenge-versand.ts ──→ MailVersand (resend)
Postfach (postal-mime, Browser) ←─ /api/postfach/angebote ←─────── VORGAENGE_DATEIEN (R2)
                                  email()-Handler  ← Cloudflare Email Routing (angebote@)
Benutzerkonto ── /api/benutzer/unterschrift ───────────────────────→ BENUTZER_DB
```

Grundsätze, die aus der Repo-Praxis folgen:

- Der Worker rechnet und rendert nichts Schweres. PDF-Füllen, Mail-Parsen und
  Base64-Kodieren laufen im Browser (wie `xlsx`, `docx`, `zip`, Ehrungsantrag). Der Worker
  speichert, prüft Grenzen und Rechte und verschickt.
- Dokumentartige Tabellen mit eigener `version` je Zeile, `If-Match`/`If-None-Match: *`,
  `angelegt_von`/`geaendert_von` aus der geprüften Anmeldung, 412 bewahrt den lokalen Stand.
- Alles, was sich ändern darf, hat einen Server-Check, kein Vertrauen in den Client:
  Unterschrift und Name setzt der Worker, Stufenübergänge prüft der Worker.

## 5. Datenmodell

Migrationen: `worker/migrations/fahrzeuge/0027_vorgaenge.sql` und
`worker/migrations/benutzer/0028_benutzer_unterschriften.sql` (die Nummerierung läuft
projektweit, die letzte ist `0026`).

**FAHRZEUGE_DB**

| Tabelle                  | Inhalt                                                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vorgaenge`              | `id`, `art` (nur `fahrzeug-material-defekt`), `fahrzeug_id` (FK), `titel`, `stufe` (-1 bis 5), `geplant_am` (optional), `abgeschlossen_am`, `angelegt_*`, `geaendert_*`, `version`.                                                                                                                   |
| `schadensmeldungen`      | `id`, `vorgang_id` (eindeutig), `inhalt` (streng geprüftes JSON der Formularfelder, siehe 6), `version`, `gesperrt` (0/1, gesetzt mit der ersten Unterschrift).                                                                                                                                       |
| `meldung_unterschriften` | PK (`meldung_id`, `slot`), `slot` in `fest`/`leitung`/`verantw`, `status` (`angefragt`/`unterschrieben`), `an_email`, `angefragt_von`, `angefragt_am`, `name`, `unterschrieben_am`, `signatur` (unveränderliche Momentaufnahme als JSON). Aufgaben „für mich“ sind ein Index auf `an_email`+`status`. |
| `vorgang_angebote`       | `id`, `vorgang_id`, `dateiname`, `groesse`, `r2_schluessel`, `quelle` (`upload`/`email`), `mail_id`, `hochgeladen_von/am`.                                                                                                                                                                            |
| `postfach_mails`         | `id`, `message_id` (eindeutig, gegen Doppelzustellung), `empfangen_am`, `absender`, `betreff`, `groesse`, `anhaenge_anzahl`, `r2_schluessel` (rohe `.eml`), `status` (`offen`/`zugeordnet`/`verworfen`), `bearbeitet_von/am`.                                                                         |
| `vorgang_ereignisse`     | Protokoll wie `fahrzeug_aenderungen`: Zeitpunkt, Benutzer, Beschreibung. Nur der Worker schreibt, Beschreibung aus dem tatsächlichen Unterschied.                                                                                                                                                     |

**BENUTZER_DB**: `benutzer_unterschriften` (`email` PK, `art` `schrift`/`zeichnung`,
`daten` JSON, `geaendert_am`). Eine Zeile je Person, ohne Version, `PUT` ersetzt.

Warum Unterschriften als Momentaufnahme: ändert eine Person später ihre Unterschrift,
darf ein bereits unterschriebenes Dokument nicht umspringen. Der Worker kopiert beim
Unterschreiben die gespeicherte Unterschrift der **geprüften Identität** in
`meldung_unterschriften.signatur`. Der Client schickt nie ein Bild.

**Prüfung des Meldungsinhalts** (`pruefeSchadensmeldung()`, unbekannte Felder abgelehnt,
Grenzen im Worker und in `schadensmeldung.model.ts` gemeinsam ändern):

| Feld                          | Grenze                   |
| ----------------------------- | ------------------------ |
| `art`                         | `schaden` oder `verlust` |
| `datumFeststellung`           | Kalendertag `JJJJ-MM-TT` |
| `einheit`, `bezeichnung`      | je ≤ 100 Zeichen         |
| `kennzeichen`                 | ≤ 20                     |
| `ort`                         | ≤ 200                    |
| `sachverhalt`                 | ≤ 4.000                  |
| `stellungnahme`, `empfehlung` | je ≤ 400                 |

Unterschrift (`daten`): `schrift` mit Text ≤ 80 Zeichen und einer festen Schriftliste;
`zeichnung` mit höchstens 20 Strichen, 2.000 Punkten gesamt, ganzzahlige Koordinaten in
einem festen Raster (480×160), Körper ≤ 32 KB.

Dateien: Angebote nur PDF, PNG, JPEG (Magic-Bytes-Prüfung über `binaer-lesen.ts`), ≤ 10 MB,
≤ 10 je Vorgang. Rohmails ≤ 25 MB.

## 6. Stufen und Übergänge

Die Stufen sind eine feste Liste im Code (`VORGANG_STUFEN`), Worker und Frontend gemeinsam.
Der Worker erlaubt nur den nächsten Schritt und prüft die Bedingung selbst.

| Stufe                        | Wie erreicht                           | Bedingung (Worker)                                                                 |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| 0 Schadensmeldung ausgefüllt | automatisch beim Speichern der Meldung | Pflichtangaben vollständig                                                         |
| 1 Angebote eingeholt         | `POST …/stufe`                         | mindestens ein Angebot                                                             |
| 2 Eingereicht                | `POST …/einreichen`                    | zwei Pflichtunterschriften und mindestens ein Angebot, Mail erfolgreich verschickt |
| 3 Genehmigt                  | `POST …/stufe`                         | Rolle laut E3                                                                      |
| 4 Geplant                    | `POST …/stufe`                         | optional Datum                                                                     |
| 5 Erledigt                   | `POST …/stufe`                         |                                                                                    |

Ein Schritt zurück ist erlaubt, ab „Eingereicht“ nur mit Eintrag im Protokoll. Entfernt man
nach Stufe 2 das letzte Angebot, bleibt die Stufe bestehen, der Vorgang zeigt aber den
Widerspruch (Entscheidung 1 gilt für das Einreichen, nicht rückwirkend).

**Sperre:** Mit der ersten Unterschrift setzt der Worker `gesperrt`. Änderungen am Inhalt
sind dann 409 `VORGANG_MELDUNG_GESPERRT`. „Unterschriften entfernen“ hebt die Sperre auf und
protokolliert es.

## 7. Postfach „angebote@“

**Empfehlung: Cloudflare Email Routing mit Email Worker** (E1).

- Für: der Eingang ist kein HTTP-Pfad. Damit entsteht **kein** weiterer Eintrag in
  `OEFFENTLICHE_MUSTER` und kein zusätzlicher Access-Bypass. Ein Resend-Webhook wäre ein
  unangemeldeter Schreibpfad, der die fünf Muster auf sechs erhöht, die Access-Bypass-
  Anwendung erweitert und eine eigene Signaturprüfung braucht.
  Kein gemeinsames Kontingent mit dem Mailversand (Resend zählt Empfang und Versand
  zusammen, im Free-Plan 100 Mails am Tag).
- Wider: Der Email-Worker-Handler läuft mit dem CPU-Limit des Workers-Plans. Die Doku warnt
  für das Free-Paket vor Allokationsfehlern bei großen oder aufwendigen Mails.
- **Gegenmaßnahme:** Der Handler macht fast nichts. Er prüft die Größe, schreibt den
  Rohstrom (`message.raw`) unverändert in R2 und legt eine Zeile mit Absender, Betreff,
  Größe in `postfach_mails` an. Geparst wird **nicht im Worker**, sondern im Browser:
  `GET /api/postfach/angebote/<UUID>/datei` liefert die `.eml`, `postal-mime` (dynamisch
  importiert) zeigt Absender, Betreff, Text und Anhänge. PDF-Anhänge lassen sich über eine
  `blob:`-URL ansehen. „Zuordnen“ lädt die gewählten Anhänge als Angebote hoch.
- Resend Inbound bleibt die Alternative, falls der Email Worker auf dem Free-Tarif die Mails
  nicht stabil annimmt (Phase 0). Dann braucht es: Webhook-Pfad, Signaturprüfung, Eintrag in
  `OEFFENTLICHE_MUSTER`, Anpassung des Tests, der Access-Bypass-Anwendung und
  `docs/einrichtung.md`, plus das Abrufen der Anhänge über die Resend-API. Die Preisseite
  nennt 3 Inboxes und 1 Webhook im Free-Plan. Ob eine einzige Adresse reicht, ist belegt,
  ob die Inbox-Grenze für Webhook-Empfang gilt, nicht (vor Entscheidung prüfen).

**Oberfläche:** Seite `Postfach` (`/vorgaenge/postfach`), erreichbar über eine Aufgabe und
einen Menüpunkt. Links die Liste (Absender, Betreff, Datum, Anzahl Anhänge, Status), rechts
die Vorschau. Aktionen: „Dem Vorgang zuordnen“ (Auswahl Fahrzeug, dann offener Vorgang
„Fahrzeug/Material defekt“, Anhänge einzeln ankreuzen), „Verwerfen“. Spam und Newsletter
lassen sich verwerfen. Aus dem Vorgang heraus öffnet „Aus Postfach übernehmen“ dieselbe
Auswahl, vorgefiltert auf den Vorgang.

**Schutz:** Die Adresse ist erratbar. Mails sind deshalb nie eine Quelle für Kennzahlen
oder Stufen, sondern nur eine Liste zum Ansehen. Ein Angebot entsteht erst durch die
Zuordnung einer angemeldeten Person (`hochgeladen_von`). Vorschau-Inhalte nie als HTML
rendern: Text aus der Mail als Klartext, Anhänge nur als Download oder PDF-Ansicht.

## 8. Dateien (R2)

Neuer Bucket `stationwizard-vorgaenge`, Binding `VORGAENGE_DATEIEN` in `wrangler.toml`.
Ein aktiver Binding-Block ohne vorhandenen Bucket bricht den Deploy ab (gleiches Problem wie
bei den Secrets-Store-Bindings): Bucket zuerst anlegen, Block danach aktivieren, in
`docs/einrichtung.md` beschreiben. Der Zugriff im Worker läuft über einen schmalen
Adapter (`ObjektSpeicher` mit `lege`, `lies`, `loesche`), damit ein Wechsel auf ein anderes
Objektlager auf einen Adapter begrenzt bleibt. Schlüssel: `vorgaenge/<vorgangId>/<angebotId>`
und `postfach/<mailId>.eml`. Der Worker liefert Dateien gestreamt, ohne sie zu lesen.

## 9. PDF und Mail

**PDF-Befüllung (im Browser, `pdf-lib`, Muster `ehrungsantrag-pdf.ts`).** Die Vorlage wird
wie die Führerschein- und Ehrungsantrag-Vorlage im Verwaltungsbereich hinterlegt
(`datei-vorlage.ts`, Migration in `BENUTZER_DB`, Route
`/verwaltung/schadensmeldung-vorlage`). Befunde zur vorliegenden Anlage 5 (mit `pypdf`
geprüft): ein Blatt, A4, **ein AcroForm mit 16 Feldern**, davon 3 mehrzeilige Felder ohne
Scrollen (`Darstellung`, `Stellungnahme eines Verantwortlichen`, `Verfahrensweise`), je drei
Textfelder `Name`/`Datum` (mit Suffix `_2`, `_3`), zwei Kontrollkästchen (`Check Box11`,
`Check Box12`) und **keine Signaturfelder**. Daraus folgt:

- Feldnamen sind an die Revision gebunden, wie bei `ANTRAG_KAESTCHEN`. Fehlen Felder, lehnt
  die Verwaltungsseite den Upload ab, der Druck bricht ab statt halb zu füllen.
- Welches Kästchen Schaden und welches Verlust ist, steht nicht im Feldnamen und muss am
  echten Formular gelesen werden (Phase 0).
- Die Unterschrift wird als Grafik (`drawSvgPath` oder PNG) rechts neben dem jeweiligen
  Datum-Feld gezeichnet. Die Position folgt dem Feldrechteck aus der Vorlage, nicht
  festen Koordinaten.
- Felder bleiben ausfüllbar, nichts wird abgeflacht, außer die Unterschriften (Bild).
- **Beiblatt:** Passt der Sachverhalt nicht ins Feld (Schätzung 550 Zeichen, am echten PDF
  mit der Feldschriftgröße prüfen), schreibt das PDF im Feld „siehe Beiblatt“ und hängt eine
  zweite Seite mit dem vollen Text an (`pdf-lib`, Standardschrift). Die 4.000-Zeichen-Grenze
  begrenzt das Beiblatt auf eine Seite.
- Der Browser erzeugt das PDF aus dem **gespeicherten** Stand und den Momentaufnahmen der
  Unterschriften, nicht aus ungesicherten Änderungen.

**Mail.** `MailNachricht` bekommt ein optionales `anhaenge: { dateiname, typ, inhaltBase64 }[]`.
Nur der Resend-Adapter unterstützt es zunächst; der `email-routing`-Adapter lehnt Anhänge mit
`MAIL_VERSANDWEG_ANHANG_NICHT_UNTERSTUETZT` ab, bis geprüft ist, ob das `send_email`-Binding
sie kann. Neue Systemkonfigurationsschlüssel (`EINSTELLUNGEN`):
`schadensmeldung_empfaenger`, `schadensmeldung_betreff`; der Versandweg wird
wiederverwendet (`material_versandweg` ist fachfremd, daher ein eigener Schlüssel
`vorgang_versandweg`). Rollenschranke je Schlüssel laut E3. Neuer Reiter „Vorgänge“ in der
Systemkonfiguration.

**Einreichen** (`POST /api/vorgaenge/<UUID>/einreichen`): Körper mit dem vom Browser
erzeugten PDF als Base64 und der Auswahl, ob Angebote mitgehen (Standard: nein, siehe E8).
Der Worker prüft Unterschriften, Angebote und Größe (Gesamtkörper ≤ 12 MB), schreibt das
PDF unveränderlich nach R2 (`vorgaenge/<id>/meldung-<hash>.pdf` als Nachweis, was gesendet
wurde), versendet und setzt erst **nach** erfolgreichem Versand die Stufe. Schlägt der Versand
fehl, bleibt die Stufe, die feste Fehlerursache geht an die Oberfläche
(`VERSANDFEHLER_ANTWORTEN`). Bei Timeout oder unklarem Ergebnis kein automatischer
Wiederholungsversuch (CLAUDE.md: unklare Speicherergebnisse), die Oberfläche zeigt „Versand
unklar“ und fragt nach.

## 10. API

Alle Pfade stehen hinter Access und kommen in die Tabelle in `CLAUDE.md`. Mutationen:
Neuanlage mit `If-None-Match: *`, sonst `If-Match`.

| Pfad                                                  | Methode            | Vertrag                                                                                                                    |
| ----------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `/api/benutzer/unterschrift`                          | GET / PUT / DELETE | Eigene Unterschrift, nie die einer anderen Person                                                                          |
| `/api/vorgaenge`                                      | GET                | Alle Vorgänge mit Kennzahlen (Stufe, Fahrzeug, offene Unterschriften), ein Aufruf                                          |
| `/api/fahrzeuge/<UUID>/vorgaenge`                     | GET / POST         | Vorgänge eines Fahrzeugs; Neuanlage legt Meldung mit an                                                                    |
| `/api/vorgaenge/<UUID>`                               | GET                | Vorgang samt Meldung, Unterschriften, Angebotsmetadaten und Protokoll                                                      |
| `/api/vorgaenge/<UUID>/meldung`                       | PUT                | Inhalt, nur mit `If-Match`, gesperrt nach erster Unterschrift                                                              |
| `/api/vorgaenge/<UUID>/meldung/unterschriften/<slot>` | PUT / DELETE       | PUT `{ "aktion": "unterschreiben" }` oder `{ "aktion": "anfordern", "an": "<E-Mail>" }`; DELETE entfernt oder zieht zurück |
| `/api/vorgaenge/<UUID>/stufe`                         | POST               | `{ "nach": <Stufe> }`, nur der erlaubte Schritt                                                                            |
| `/api/vorgaenge/<UUID>/einreichen`                    | POST               | PDF und Mail, siehe 9                                                                                                      |
| `/api/vorgaenge/<UUID>/angebote/<UUID>`               | PUT / GET / DELETE | Datei als Rohinhalt, Metadaten in Kopfzeilen; Id vom Client, damit der Upload idempotent ist                               |
| `/api/vorgaenge/aufgaben`                             | GET                | Offene Unterschriftsanfragen an die aufrufende Person und Zahl ungeordneter Postfach-Mails                                 |
| `/api/postfach/angebote`                              | GET                | Mails mit Status, serverseitig mit Aufräumen nach Frist                                                                    |
| `/api/postfach/angebote/<UUID>/datei`                 | GET                | Rohe `.eml`                                                                                                                |
| `/api/postfach/angebote/<UUID>`                       | PATCH / DELETE     | Status auf `zugeordnet` (nur zusammen mit Upload) bzw. `verworfen`                                                         |

Fehlercodes mit eigenem festen Code je Ursache, Präfix `VORGANG_`/`POSTFACH_`. JSON-Körper
über `leseJsonKoerper()`, Pfade über `UUID_MUSTER`. Anfragen mit Rohinhalt lesen über
`binaer-lesen.ts`. Fehlt ein Binding (`VORGAENGE_DATEIEN`), antworten die Endpunkte mit 503
und festem Code.

## 11. Frontend

- **Fahrzeugakte:** Kind-Routen `fahrzeuge/:id/(uebersicht|wartung|kilometer|formulare|vorgaenge|verlauf)`.
  Komponenten: `FahrzeugKopf` (Titel, Statuschips, Reiter, Menü mit QR-Codes), eine
  darstellende `StammdatenForm` (heute doppelt vorhanden), Statuschips über `StatusChip`
  aus `kern/` statt der lokalen Chip-Variante. Bearbeiten der Stammdaten in einem Dialog
  (`DialogDienst`), `VerlassenSchutz` bleibt.
- **Übersicht:** Liste nach offenen Vorgängen und Dringlichkeit sortiert, rechts nur eine
  Vorschau mit „Akte öffnen“. Der Aufruf über `/api/vorgaenge` liefert die Zahlen in einem
  Aufruf, kein Abruf je Fahrzeug.
- **Formular-Seite** `vorgaenge/pages/schadensmeldung/`: ein Zustand im
  `SchadensmeldungStoreService` (Entwurf, Basislinie, ein Schreibvorgang je „Speichern“,
  412 bewahrt den Entwurf), darstellende Komponenten `FeldMitZaehler`, `UnterschriftZeile`,
  `UnterschriftFeld`. Alle Grenzen aus Abschnitt 5 als `maxlength`, Zähler, Beiblatt-Hinweis.
- **Unterschrift im Benutzerkonto:** `UnterschriftEditor` (Zeichnen per `canvas` und
  Pointer-Events, Schriftvorschau), Dialog über den Benutzerbereich. Google Fonts wird
  **nicht** geladen (Datenschutz und Offlinefähigkeit): die drei Schriften liegen als
  lokale Webfonts im Build.
- **Aufgaben:** neue `VorgangAufgabenquelle` über `provideAufgabenquelle()`, ein Aufruf an
  `/api/vorgaenge/aufgaben`. Der Vertrag in `kern/aufgaben/` bleibt unverändert. Die
  Seite `aufgabe` (Prüfen und Unterschreiben) liegt unter `vorgaenge/pages/`.
- **Postfach-Seite:** `PostfachListe`, `MailVorschau`, `ZuordnungsAuswahl`; Mail-Parsing in
  `postfach/mail-lesen.ts` mit Test (Testmails im Test erzeugt, keine realen Daten).
- **Vorgangsseite:** `VorgangStufen` (Stepper), `AngeboteListe`, Aktionen je Stufe.
  Meldungen ausschließlich über `MeldungsDienst`.

## 12. Aufgaben und Rechte

- Unterschriftsanfragen sind abgeleitet (Zeilen in `meldung_unterschriften` mit
  `status = 'angefragt'`), keine eigene Aufgabentabelle. Eine Anfrage zurückzuziehen oder die
  Unterschrift zu entfernen löscht sie damit von selbst.
- Wer anfordern darf: jede Anmeldung. Gewählt wird aus `GET /api/benutzerverwaltung`
  (Personen, die sich schon angemeldet haben). Hat die Person keine hinterlegte
  Unterschrift, bekommt sie beim ersten Unterschreiben einen Dialog.
- Die Postfach-Aufgabe sieht, wer die Rolle für Vorgänge laut E3 hat (ohne Rolle eine leere
  Liste, wie bei den Einreichungen).
- Weiterhin ehrlich benennen: Die Rollenschranke ist nur so stark wie die Rollenvergabe.

## 13. Kontingent im Free-Tier

Erwartete Last: wenige Vorgänge pro Monat, je Vorgang etwa 15 bis 25 D1-Schreibvorgänge
(Meldung speichern sammelt Eingaben, ein Schreibvorgang je „Speichern“, nie je Taste) und
unter 15 Worker-Anfragen. Mails: wenige am Tag. Das liegt weit unter den Tageslimits.
Zu beachten: jede Asset-Anfrage zählt wegen `run_worker_first`, die neuen Seiten bringen
Bundles. Lazy Loading und `immutable`-Cache erhalten, `postal-mime` und `pdf-lib` nur
dynamisch importieren. Konkrete Zahlen der Tarife (Anfragen/Tag, D1-Zeilen, R2-Operationen,
CPU-Zeit) vor der Umsetzung gegen die aktuelle Cloudflare-Preisseite prüfen.

## 14. Plan, falls die Kapazität nicht reicht

Auslöser sind messbar: Fehlercodes 1015/1102 oder ein Verbrauch über etwa 60 Prozent eines
Tageslimits an drei Tagen in Folge (Workers-Analytics, D1-Metriken, R2-Metriken). Reihenfolge:

1. **Messen**, wo der Verbrauch entsteht (Assets, API, Mail, PDF), bevor etwas geändert wird.
2. **Last senken:** Dateien aus R2 mit Cache-Headern, Listen über `abruf-puffer.ts`, größere
   Bundles teilen, Aufräumen der Postfach-Mails nur bei Aufruf.
3. **Kostenpflichtigen Workers-Tarif** prüfen: er hebt Anfragen- und CPU-Limits deutlich, ohne
   Architekturwechsel. Das ist der günstigste Schritt.
4. **Nur dann ein Backend:** Die Schnittstellen sind dafür vorbereitet. Datenzugriff
   steckt in Adaptern (`ObjektSpeicher`, `MailVersand`, die D1-Zugriffe je Modul sind
   SQLite-nah), die API ist ein fester Vertrag (Tabelle in `CLAUDE.md`), der Client kennt nur
   `/api/*` derselben Origin. Ein Modul nach dem anderen kann hinter dieselben Pfade ziehen,
   Vorgänge zuerst, weil sie die meisten Schreibvorgänge und Dateien haben. Datenübernahme per
   Export aus D1/R2 mit Prüfsumme je Tabelle, Umschalten je Modul, Rückfall auf den Worker
   bis zur Abnahme (Altrepositorys erst nach erfolgreicher Abnahme stilllegen).

## 15. Arbeitspakete

Jedes AP ist ein eigener Branch und PR mit Build, Tests und `format:check`. Migrationen müssen
vor dem Worker-Deployment eingespielt sein.

| AP  | Inhalt                                                                                                                                                                                                                                              | Abnahme                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| V0  | **Spikes:** Email Worker mit Testmail und 5-MB-PDF (CPU, Allokation, Speicher in R2), `pdf-lib` mit der echten Anlage 5 (Feldnamen, Kästchen, Beiblattgrenze, Unterschriftsposition), Resend-Anhang, Größe Base64 im Worker, Resend-Inbound-Grenzen | Kurzbericht im Arbeitsstand mit tatsächlichen Messwerten, Entscheidung E1 und E8                                      |
| V1  | Fahrzeugakte mit Reitern, `FahrzeugKopf`, `StammdatenForm`, Übersicht als Vorschau, Chips auf `StatusChip`; keine neue Fachlogik                                                                                                                    | Desktop und Mobil im Browser geprüft, `app.routes.spec.ts` ergänzt, alte Master-Detail-Formulare entfernt             |
| V2  | Unterschrift im Benutzerkonto (Migration, Worker, Editor, Benutzerbereich)                                                                                                                                                                          | Test der Grenzen, Zeichnen und Schrift im Browser, Fremdzugriff 404                                                   |
| V3  | Vorgang und Schadensmeldung (Migration `0027`, Worker, Store, Formular, Stufen, Protokoll, Sperre)                                                                                                                                                  | Worker-Tests je Stufenbedingung und Konflikte (412/409), Fake-DB-Spezifikation                                        |
| V4  | Unterschriftsanfragen, Unterschreiben, `VorgangAufgabenquelle`, Aufgabenseite                                                                                                                                                                       | Test: Anfrage, Zurückziehen, Entfernen, Pflicht und optional, Reihenfolge egal                                        |
| V5  | PDF-Vorlage im Verwaltungsbereich, Befüllen im Browser, Beiblatt, Unterschriftsbilder, Drucken                                                                                                                                                      | Roundtrip-Test mit einem im Test erzeugten AcroForm, das die Feldnamen nachbildet (nie das echte Formular einchecken) |
| V6  | Mailversand mit Anhang, Systemkonfiguration, Einreichen per Mail, unveränderliche PDF-Kopie in R2                                                                                                                                                   | Test der festen Fehlercodes, kein Wiederholen bei Timeout                                                             |
| V7  | R2-Binding, Email-Worker-Handler, `postfach_mails`, Postfach-Seite mit Vorschau und Zuordnung, Angebote hochladen                                                                                                                                   | Test: Handler schreibt Rohstrom, doppelte `message_id`, Größe, Aufräumen; Browser-Test der Vorschau                   |
| V8  | Dokumentation: `CLAUDE.md` (API-Tabelle, Modulabschnitt), `docs/einrichtung.md` (Bucket, Email Routing, MX), `docs/arbeitsstand.md`                                                                                                                 | Nur tatsächlich ausgeführte Prüfungen eingetragen                                                                     |

Abhängigkeiten: V1 und V2 sind unabhängig. V3 braucht V1 nicht zwingend, ist aber mit
der Akte einfacher einzubauen. V4 braucht V2 und V3, V5 braucht V3 (und V2 für die
Unterschriftsbilder), V6 braucht V5, V7 braucht V3.

## 16. Risiken

| Risiko                                                    | Gegenmaßnahme                                                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Email Worker scheitert auf dem Free-Tarif an großen Mails | V0 misst, Handler schreibt nur den Rohstrom, Resend Inbound als Rückfall                                                          |
| Beiblatt-Schätzung (550 Zeichen) stimmt nicht             | V0 prüft am echten Feld, Grenze als Konstante                                                                                     |
| Unterschrift gilt formal nicht als ausreichend (E5)       | Drucken mit Handunterschrift bleibt möglich                                                                                       |
| Mail an erratbare Adresse bringt Spam oder Schadsoftware  | Nur Ansicht, nie Ausführung; Anhänge nur PDF/Bild; Größen- und Anzahlgrenzen; Verwerfen                                           |
| Rollenvergabe offen für jede Anmeldung                    | Bekannte Lücke, nicht hier lösen, aber Server prüft die Rollen, die es gibt                                                       |
| Mail an falsche oder falsch konfigurierte Empfänger       | Empfänger nur aus der Konfiguration, im Dialog sichtbar und abwählbar; Platzhalteradressen sperren den Versand, bis sie echt sind |
| Personenbezogene Daten in Mails, Angeboten und Meldungen  | Löschfrist (E6), keine realen Daten in Fixtures, Screenshots, Logs                                                                |
