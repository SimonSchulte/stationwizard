# Konzept: Modul „Fahrzeuge"

Dieses Dokument beschreibt das geplante dritte Fachmodul neben Ausbildungs- und
Einsatzplanung. Es ist ein Entwurf zur Abstimmung; nichts davon ist implementiert.
Offene Entscheidungen sind als solche gekennzeichnet und nicht stillschweigend
vorweggenommen.

## 1. Ziel und Abgrenzung

Das Modul verwaltet die Fahrzeugstammdaten der Einheit, deren Wartungstermine und die
laufende Kilometerstanderfassung. Es liefert ein Dashboard mit den nächsten Wartungen und
der im Kalenderjahr noch zu erbringenden Mindestlaufleistung.

Nicht Gegenstand dieses Moduls: Einsatzdisposition (bleibt in `einsatz/`),
Fahrtenbuch mit Einzelfahrten, Tankabrechnung, Schadensmanagement. Das Modul erfasst
Kilometer**stände**, keine Fahrten. Ein Fahrtenbuch wäre personenbezogen deutlich
eingriffsintensiver und ist ausdrücklich nicht beauftragt.

### Verhältnis zum Bestand

`einsatz/models/planung.model.ts` kennt bereits `Fahrzeug` und `FahrzeugRef`
(`seriennummer`, `funkruf`, `hiorgId`). `einsatz/data/fahrzeuge.ts` ist bewusst eine leere
Liste, weil keine realen Stammdaten im Repository liegen. Das neue Modul wird die
fachliche Quelle dieser Liste. Der Einsatzplaner bindet sie später über einen schmalen
Lesezugriff ein; die Einsatzmodelle werden **nicht** umgebaut und `FahrzeugRef` bleibt wie
es ist (PEP-Dateien im Umlauf enthalten dieses Format).

Die EFS-Zuordnung in `efs-api.service.ts` gleicht Einsatzmittel über `funkruf` und
`seriennummer` ab. Sobald echte Stammdaten vorliegen, verbessert sich dieser Abgleich
ohne Codeänderung.

## 2. Domänenmodell

Ort: `src/app/fahrzeuge/models/fahrzeug.model.ts`.

```ts
export type Eigentuemer = 'land-nrw' | 'bund' | 'organisation';

export interface Fahrzeugstamm {
  id: string; // UUID, technisch, unveränderlich, QR-Ziel
  bezeichnung: string; // z. B. "MTW 1", frei
  funkrufname: string;
  kennzeichen: string;
  fahrgestellnummer: string; // FIN, 17 Zeichen, optional erfassbar
  eigentuemer: Eigentuemer;
  imBestandSeit: string; // ISO-Kalendertag, für anteiliges Soll
  imBestandBis: string | null; // Ausserdienststellung, sonst null
  bemerkung: string;
  wartungstermine: Wartungstermin[];
  geaendertAm: string; // ISO-Zeitstempel
  geaendertVon: string; // geprüfte Access-E-Mail
}

export interface Wartungstermin {
  id: string;
  art: 'hu' | 'frei'; // HU ist fachlich hervorgehoben, technisch gleich
  bezeichnung: string; // bei 'hu' fest "Hauptuntersuchung"
  faelligAm: string; // ISO-Kalendertag
  erinnerungTage: number; // Vorlauf für Dashboard-Warnung, Vorgabe 30
  erledigtAm: string | null;
}

export interface Kilometerstand {
  id: string;
  fahrzeugId: string;
  abgelesenAm: string; // ISO-Kalendertag, vom Erfasser wählbar
  stand: number; // ganze Kilometer
  erfasstAm: string; // ISO-Zeitstempel, serverseitig
  erfasstVon: string; // geprüfte Access-E-Mail, serverseitig
  quelle: 'qr' | 'formular' | 'korrektur';
  korrigiert: string | null; // id der korrigierten Ablesung
  bemerkung: string;
}
```

Begründungen zu Entscheidungen, die nicht selbsterklärend sind:

- **HU als Wartungstermin, nicht als eigenes Feld.** Der Auftrag nennt „nächste HU" und
  „mehrere beliebige weitere Wartungstermine". Ein eigenes Feld neben einer generischen
  Liste erzwingt zwei Codepfade für Fälligkeit, Warnung und Dashboard. Die HU bleibt
  fachlich sichtbar (eigene Art, feste Bezeichnung, in Liste und Dashboard hervorgehoben),
  liegt technisch aber im selben Container.
- **Kilometerstände werden nie überschrieben.** Ein Fehler wird durch eine
  Korrekturablesung mit Verweis ersetzt, nie durch ein Update der bestehenden Zeile. Nur
  so bleibt die Jahreslaufleistung nachvollziehbar und eine nachträgliche Beschönigung der
  Pflichtkilometer erkennbar. **Löschen ist auf ausdrücklichen fachlichen Wunsch möglich**
  (Entscheidung vom 12.09.2026) und soll perspektivisch einer Admin-Rolle vorbehalten
  bleiben; da das Modul noch keine Rollen kennt (siehe „Rechte vorerst alle, Rollen
  später"), steht die Funktion bis dahin jeder geprüften Identität offen. Eine bereits
  korrigierte Ablesung bleibt gesperrt, solange ihre Korrektur noch existiert – sonst
  zeigte die Korrektur ins Leere.
- **Der Vorlauf der Wartungswarnung steht am einzelnen Termin**, nicht global. Eine HU
  braucht anderen Vorlauf als ein Gerätecheck.
- **Keine Bestandszeiträume in der ersten Fassung.** Zu- und Abgänge werden vorerst nicht
  abgebildet (Entscheidung vom 12.09.2026). Das Soll gilt damit als volles Jahressoll.
  Fachlich gewollt ist bei Bedarf die monatsanteilige Rechnung; dafür wären später zwei
  Felder `imBestandSeit` und `imBestandBis` zu ergänzen. Die Sollberechnung wird deshalb
  von Anfang an als eigene Funktion mit Jahr und Fahrzeug als Eingabe geführt, damit
  dieser Schritt eine lokale Änderung bleibt.

### Nicht abschließend geklärt

- Die **FIN** ist im HiOrg-Server vorhanden, hier aber ohne erkennbaren fachlichen Zweck
  (kein Abgleich, keine Anzeige im Einsatz). Sie wird als optionales Feld geführt und
  in der Oberfläche nicht prominent gezeigt. Prüfung: genau 17 Zeichen, ohne I/O/Q.
  Ob sie überhaupt erfasst werden soll, ist eine Entscheidung der Einheit.
- Der HiOrg-Server führt in seinen Einsatzmitteln eine ID (`hiorgId`). Ob und wie
  Stammdaten aus HiOrg übernommen werden können, ist offen: die drei freigegebenen
  EFS-Aktionen liefern Einsatzmittel nur im Kontext einer Veranstaltung, keinen
  Fahrzeugstamm. Eine neue EFS-Aktion braucht laut Projektkonventionen zuerst einen
  Nachweis durch die echte API und deren Dokumentation. Bis dahin: manuelle Pflege,
  optional übernommene `hiorgId` aus einem Einsatz.

## 3. Mindestlaufleistung

| Eigentümer   | Satz           |
| ------------ | -------------- |
| Land NRW     | 150 km / Monat |
| Bund         | 50 km / Monat  |
| Organisation | keine Vorgabe  |

Das Bezugsfenster ist starr das Kalenderjahr vom 1. Januar bis 31. Dezember. Zu- und
Abgänge bleiben in der ersten Fassung unberücksichtigt, jedes Fahrzeug trägt also ein
volles Jahressoll:

```
sollKm = satz * 12
istKm  = aktuellerStand - standZumJahresbeginn
restKm = max(0, sollKm - istKm)
```

Das ergibt 1.800 km für Land-NRW-Fahrzeuge und 600 km für Bundesfahrzeuge. Sobald
Bestandszeiträume gepflegt werden, tritt an `12` die Zahl der Monate im Bestand; die
Berechnung liegt dafür hinter einer eigenen Funktion.

Weitere Festlegungen:

- **`standZumJahresbeginn`** ist die letzte Ablesung mit `abgelesenAm <= 31.12. des
Vorjahres`. Existiert keine, wird die erste Ablesung des laufenden Jahres verwendet und
  das Ergebnis in der Oberfläche ausdrücklich als **unvollständig** gekennzeichnet — nicht
  stillschweigend mit 0 gerechnet und nicht interpoliert. Im ersten Nutzungsjahr des Moduls
  ist das der Normalfall und muss ehrlich sichtbar bleiben.
- Bei `eigentuemer === 'organisation'` gibt es kein Soll. Das Dashboard zeigt dort die
  Jahreslaufleistung ohne Ampel, nicht „0 km offen" — das wäre eine falsche Erfolgsmeldung.
- Eine Hochrechnung („bei aktuellem Schnitt am Jahresende: x km") ist als Zusatz
  vorgesehen, klar als Prognose beschriftet.

## 4. QR-Codes

Drei Codes je Fahrzeug:

| Zweck                           | Ziel           | Anmeldung | Wirkung                             |
| ------------------------------- | -------------- | --------- | ----------------------------------- |
| Fahrzeugübersicht               | `/f/<UUID>`    | nötig     | Fahrzeugdetailseite                 |
| Kilometerstanderfassung, intern | `/f/<UUID>/km` | nötig     | Ablesung **sofort gültig**          |
| Kilometermeldung, öffentlich    | `/e/<TOKEN>`   | keine     | Einreichung, **erst nach Freigabe** |

### Identität: kein Token in den internen Codes

**Diese Festlegung galt bis zum 16.09.2026 für alle QR-Codes. Sie gilt unverändert für die
beiden internen Codes `/f/<UUID>` und `/f/<UUID>/km`; für den neuen öffentlichen Code wurde
sie bewusst umgekehrt (siehe Abschnitt 10 und die Begründung am Ende dieses
Unterabschnitts).**

Die interne Erfassung soll „im Namen des registrierten Benutzers" erfolgen. Das geschieht
**ausschließlich** über die bestehende Cloudflare-Access-Sitzung des Scannenden. Diese
QR-Codes enthalten keine Kennung, kein Token und keinen Benutzerbezug — sie sind an der
Windschutzscheibe klebende, fotografierbare Aufkleber und damit kein Geheimnis.

Ablauf: Scan → Access prüft die Anmeldung (bei fehlender Sitzung Google-Anmeldung) →
App öffnet das Erfassungsformular → der Worker schreibt `erfasstVon` aus der
verifizierten JWT-Identität, **niemals** aus dem Anfragekörper. Ein im Körper
mitgesendetes Benutzerfeld wird verworfen.

Damit entsteht für diese beiden Wege keine neue Authentifizierungsfläche und kein Sonderweg
am Zugangsschutz vorbei.

**Warum das für den öffentlichen Code nicht reichte (Entscheidung vom 16.09.2026).** Der
ursprünglich benannte Preis lautete: „wer keinen Account hat, kann nichts erfassen. Das ist
gewollt." Genau dieser Preis hat sich als die eigentliche Einstiegshürde für die
Helferschaft erwiesen. Wer ohne Sitzung melden soll, braucht ein anderes Zugangsmerkmal —
ohne Token bliebe nur eine ungeschützte, allein über die UUID adressierbare Schreibfläche.
Deshalb trägt der öffentliche Code ein unerratbares Zufallstoken, und deshalb wird seine
Eingabe erst durch die Freigabe einer geprüften Identität wirksam. Die internen Codes
bleiben unverändert; beide Erfassungswege stehen nebeneinander.

### Stabile Kurzpfade statt Hash-Routen

Gedruckte Aufkleber überleben Routenänderungen nicht. Die App nutzt derzeit bewusst
Hash-Routing (`/#/...`), und die Umstellung auf saubere Pfade steht laut Arbeitsstand noch
aus. Ein QR-Code mit `/#/fahrzeuge/<UUID>/km` wäre nach dieser Umstellung wertlos.

Deshalb beantwortet der Worker die festen Kurzpfade `/f/<UUID>` und `/f/<UUID>/km` mit
einer Weiterleitung auf die jeweils aktuelle App-Route. Ändert sich das Routing, ändert
sich eine Zeile im Worker — die Aufkleber bleiben gültig. Die UUID wird streng gegen das
bekannte Muster geprüft, alles andere ergibt 404.

### Erzeugung

QR-Erzeugung im Browser als SVG, Bibliothek dynamisch importiert (wie `@e965/xlsx`).
Kandidat: `qrcode` (MIT). Zusätzlich ein Druckbogen über das vorhandene `pdfmake`:
Aufkleber mit Funkrufname, Kennzeichen und beiden Codes.

## 5. Oberfläche

Route `/#/fahrzeuge` als dritter Fachbereich, lazy geladen, Einstieg von der Startseite.

| Seite                         | Inhalt                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard `/fahrzeuge`        | Nächste Wartungen, Restkilometer je Fahrzeug, Fahrzeuge ohne Ablesung seit 30 Tagen                                                                                |
| Liste `/fahrzeuge/liste`      | Alle Fahrzeuge, Filter nach Eigentümer, Suche über Funkrufname und Kennzeichen                                                                                     |
| Detail `/fahrzeuge/:id`       | Stammdaten, Wartungstermine, Ablesungsverlauf, beide QR-Codes, Druckbogen, Änderungsprotokoll — als aufklappbare `mat-expansion-panel`s, Stammdaten vorab geöffnet |
| Erfassung `/fahrzeuge/:id/km` | Bewusst minimal: Zahlenfeld, Datum (Vorgabe heute), Speichern. Ziel des QR-Codes, mobil zuerst entworfen                                                           |

Die Erfassungsseite ist der einzige Teil, der regelmäßig am Fahrzeug auf dem Telefon
benutzt wird, und wird entsprechend gestaltet: großes numerisches Eingabefeld, letzter
bekannter Stand als Kontext, Plausibilitätswarnung bei Rückschritt oder unplausiblem
Sprung (Warnung, keine Blockade — Tachotausch kommt vor, dann mit Bemerkung).

Verwaltung, Dashboard und Liste folgen der bestehenden Desktop-Ausrichtung, bleiben aber
auf kleinen Displays bedienbar. Farben, Abstände und Statusfarben ausschließlich über die
zentralen Tokens aus `src/styles.less`; für Wartungsampel und Laufleistungsampel werden
die vorhandenen Statusfarben genutzt, fehlende Tokens zentral ergänzt.

Hinweis- und Bestätigungsdialoge über `kern/dialog/dialog-dienst.ts`, ungesicherte
Stammdatenänderungen über `VerlassenSchutz`.

## 6. Persistenz

### Abstraktion

Die Fachschicht spricht nur gegen ein Interface in
`src/app/fahrzeuge/storage/fahrzeug-storage.ts`:

```ts
export interface FahrzeugStorage {
  readonly bezeichnung: string;
  ladeFahrzeuge(): Promise<Fahrzeugstamm[]>;
  ladeFahrzeug(id: string): Promise<Fahrzeugstamm | null>;
  speichereFahrzeug(fahrzeug: Fahrzeugstamm, version: string | null): Promise<string>;
  ladeAblesungen(fahrzeugId: string, vonJahr?: number): Promise<Kilometerstand[]>;
  ergaenzeAblesung(eingabe: AblesungEingabe): Promise<Kilometerstand>;
}
```

`ergaenzeAblesung` nimmt bewusst **keine** Benutzerangabe entgegen; `erfasstVon` und
`erfasstAm` setzt der Server. `version` trägt das Konfliktkennzeichen des jeweiligen
Backends (ETag oder Zeilenversion) und hält die bestehende Konfliktlinie ein: kein
unbedingtes Überschreiben, 412 bedeutet Konflikt und wird dem Benutzer als solcher gezeigt.

Damit ist die Backendentscheidung eine Frage genau eines Adapters. Alle Fachtests laufen
gegen einen In-Memory-Adapter und sind von der Entscheidung unabhängig.

### Empfehlung: Cloudflare D1

**Empfehlung: Cloudflare D1**, aus vier Gründen.

1. **Identität.** Die App hat bereits genau eine geprüfte Identitätsquelle: das
   Access-JWT, serverseitig im Worker verifiziert. Supabase bringt eine zweite
   Authentifizierungsebene mit. Entweder wird sie an Access angeflanscht (eigener
   JWT-Austausch, zusätzliche Vertrauensbeziehung), oder der Worker spricht mit einem
   Service-Schlüssel gegen Supabase — dann ist Supabase Row Level Security wirkungslos,
   und übrig bleibt eine Datenbank hinter demselben Worker, nur bei einem weiteren
   Anbieter. Beides ist teurer als D1 und bringt hier keinen Gegenwert.
2. **Vorhandene Linie.** Die Projektregeln verlangen, dass alle geschützten Aufrufe über
   `kern/worker-client.ts` und relative `/api/*`-Pfade derselben Origin laufen und dass
   Zugangsdaten vollständig im Worker bleiben. D1 fügt sich als Binding ein, ohne eine
   einzige dieser Regeln zu berühren. Ein Supabase-Zugriff aus dem Browser würde sie
   verletzen; ein Supabase-Zugriff aus dem Worker braucht ein weiteres Secret.
3. **Datenumfang.** Größenordnung: einige Dutzend Fahrzeuge, wenige Tausend Ablesungen
   pro Jahr. Das liegt weit unterhalb jeder D1-Grenze. Postgres löst hier kein Problem,
   das existiert.
4. **Betrieb.** Ein Konto, ein Deployment, ein Trockenlauf, eine Abrechnung. Migrationen
   laufen über Wrangler und liegen im Repository.

**Wofür Supabase spräche:** echtes Postgres mit Constraints und Views, ausgereiftere
Migrations- und Backupwerkzeuge, Realtime, und ein späterer Bedarf an Zugriff von außerhalb
dieses Workers. Wenn absehbar weitere Anwendungen auf dieselben Daten zugreifen sollen oder
das Datenmodell deutlich über Fahrzeuge hinauswachsen soll, kehrt sich die Empfehlung um.
Für den beschriebenen Umfang tut sie das nicht.

**Nicht empfohlen: dateibasiert.** Technisch ließe sich das Modul wie PEP als versionierte
JSON-Datei in Nextcloud ablegen. Bei Kilometerablesungen, die mehrere Personen gleichzeitig
am Fahrzeug eintragen, erzeugt das systematisch 412-Konflikte bei einer Tätigkeit, die aus
Sicht der Benutzer trivial ist. Anhängende Einzelsätze gehören in eine Datenbank.

Die Abstraktion aus diesem Abschnitt hält die Entscheidung trotzdem offen: sie kann bis
zum Beginn von AP-F2 fallen, ohne AP-F1 zu blockieren.

### Vorgesehene API-Oberfläche

Die Projektkonventionen führen eine abschließende Tabelle erlaubter API-Pfade. Sie wird
ergänzt um:

| Pfad                               | Methode    | Vertrag                                 |
| ---------------------------------- | ---------- | --------------------------------------- |
| `/api/fahrzeuge`                   | GET / POST | Liste; neues Fahrzeug anlegen           |
| `/api/fahrzeuge/<UUID>`            | GET / PUT  | Einzelnes Fahrzeug, mit Versionsprüfung |
| `/api/fahrzeuge/<UUID>/ablesungen` | GET / POST | Ablesungen lesen, eine anhängen         |
| `/f/<UUID>` und `/f/<UUID>/km`     | GET        | Weiterleitung für gedruckte QR-Codes    |

Regeln wie bisher: feste Pfade, strenge UUID-Prüfung, `X-Requested-With`, Ursprungsprüfung
bei Schreibzugriffen, Größen- und Zeitlimits, Fehler über `fehlerAntwort()` mit festen
Codes. Kein generischer Abfrageendpunkt und keine frei wählbaren Filter aus dem Client.

### Datenschutz

Das Modul erfasst Zählerstände, keine Fahrten. Wer eine Ablesung einträgt, hat den Stand
übermittelt, nicht zwingend das Fahrzeug geführt; ein Bewegungs- oder Nutzungsprofil
entsteht daraus nicht. Entsprechend wurde entschieden (12.09.2026): **Ablesungen werden
unbegrenzt aufbewahrt, `erfasstVon` bleibt erhalten.** Ein Löschlauf ist nicht Teil des
Moduls.

Einordnung zur Vollständigkeit, ohne Handlungsbedarf: die gespeicherte E-Mail-Adresse ist
für sich genommen personenbezogen, weil sie eine Person identifizierbar macht — unabhängig
davon, dass kein Fahrtenbuch geführt wird. Die Verarbeitung ist geringfügig und
zweckgebunden. Sollte später doch eine Frist gewünscht sein, genügt ein Leeren des Feldes
`erfasstVon`; die Kilometerrechnung hängt nicht daran.

Weiterhin gilt:

- Keine realen Fahrzeug-, Personal- oder Zugangsdaten in Repository, Fixtures, Tests,
  Screenshots oder Fehlertexten. Testdaten werden im Test erfunden.
- Keine Persistenz fachlicher Daten in `localStorage`.
- Anzeige von `erfasstVon` nur in der Fahrzeugdetailansicht, nicht im Dashboard.

## 7. Umsetzungsplan

Jedes Arbeitspaket ist ein eigener AP-Branch mit eigenständig prüfbarem Pull Request und
grünem Build, Test und Formatprüfung.

### AP-F1 — Domäne und Abstraktion (ohne Backendentscheidung)

- `fahrzeuge/models/fahrzeug.model.ts`, `fahrzeuge/storage/fahrzeug-storage.ts`
- Fachlogik in `fahrzeuge/services/`: Fälligkeitsberechnung der Wartungstermine,
  Soll-/Ist-/Restkilometer als eigene Funktion (Fahrzeug und Jahr als Eingabe),
  Jahresstartstand samt Kennzeichnung „unvollständig", Plausibilitätsprüfung von Ablesungen
- Prüfroutinen für unbekannte externe Daten (analog `pep-datei.ts`, ohne `any` und
  ungeprüfte Casts)
- In-Memory-Adapter für Tests
- Tests: Jahresgrenze und Zeitzone beim Jahresstartstand, Organisation ohne Soll, fehlende
  Vorjahresablesung samt Kennzeichnung „unvollständig", Tachorückschritt, Korrekturkette,
  Wartungsfälligkeit am Stichtag und bei je Termin abweichendem Vorlauf
- Keine Oberfläche, kein Worker. Blockiert nichts und blockiert nicht auf die
  Backendentscheidung.

### AP-F2 — Speicheradapter und Worker-Routen

Beginnt erst nach der Entscheidung aus Abschnitt 6.

- Schema und Migration (bei D1: `worker/migrations/`, im Repository versioniert)
- `worker/src/fahrzeuge.ts` mit den vier Pfaden, `erfasstVon` serverseitig aus dem
  geprüften JWT, Versionsprüfung beim Schreiben
- Kurzpfad-Weiterleitung `/f/<UUID>`
- Adapter `fahrzeuge/storage/api-fahrzeug-storage.ts` über `WorkerClient`
- Worker-Tests: Pfadschließung, Methoden, unbekannte UUID, Benutzerfeld im Körper wird
  verworfen, Konfliktfall, Grenzwerte
- `npm run worker:check`, `worker:test`, `deploy:dry-run`

### AP-F3 — Fahrzeugverwaltung

- Liste und Detail, Stammdatenformular mit Prüfungen (Kennzeichen, FIN, Datumsfelder)
- Wartungstermine anlegen, bearbeiten, als erledigt markieren, Vorlauf je Termin setzen;
  HU hervorgehoben
- `VerlassenSchutz`, gemeinsame Dialoge, gemeinsame Leer- und Ladezustände
- Route in `app.routes.ts`, Einstieg auf der Startseite

### AP-F4 — Kilometererfassung und QR

- Erfassungsseite, mobil zuerst; Verlauf in der Detailansicht; Korrekturweg
- QR-Erzeugung als SVG, dynamischer Import
- Druckbogen über `pdfmake`, Farben aus der zentralen Farbquelle
- Browserprüfung des Scanwegs auf einem echten Telefon inklusive Access-Anmeldung

### AP-F5 — Dashboard

- Nächste Wartungen über alle Fahrzeuge, nach Fälligkeit sortiert; Ampel über den je
  Termin eingestellten Vorlauf
- Restkilometer je Fahrzeug, Organisation ohne Ampel, unvollständige Datenlage sichtbar
- Fahrzeuge ohne Ablesung in den letzten 30 Tagen
- Prognose als solche beschriftet

### AP-F6 — Integration und Abnahme

- Einsatzplaner bezieht die Fahrzeugliste aus dem neuen Modul statt aus der leeren
  Konstante; `FahrzeugRef` und das PEP-Format bleiben unverändert
- README, `CLAUDE.md` (dritter Fachbereich, erweiterte API-Tabelle) und `arbeitsstand.md`
  fortschreiben, einschließlich der tatsächlich ausgeführten Prüfungen und der offenen
  Grenzen
- Sichtprüfung Desktop und Mobil; ein blockierter Browserlauf gilt nicht als bestanden

### Reihenfolge

AP-F1 kann sofort beginnen. AP-F2 wartet auf die Backendentscheidung. AP-F3 bis AP-F5
bauen aufeinander auf, lassen sich aber gegen den In-Memory-Adapter vorziehen, falls die
Entscheidung länger dauert.

## 8. Getroffene Entscheidungen

Abgestimmt am 12.09.2026.

| Frage                   | Entscheidung                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Backend                 | Cloudflare D1, weil verfügbar. Domäne und Persistenz strikt getrennt, Wechsel bleibt ein Adaptertausch               |
| Bezugsfenster Soll      | Starr 1.1.–31.12., volles Jahressoll je Fahrzeug; Zu- und Abgänge vorerst nicht abgebildet                           |
| Anteiligkeit später     | Wenn nötig, monatsanteilig nach Monaten im Bestand — dafür eine eigene Funktion vorgesehen                           |
| Rechte                  | Vorerst dürfen alle Angemeldeten alles; der Schreibpfad bekommt eine Stelle für spätere Rollen                       |
| Freigabe von Meldungen  | **Nachtrag 16.09.2026:** `zugfuehrung` oder `gruppenfuehrung-<gruppe>` der Fahrzeuggruppe, serverseitig durchgesetzt |
| Fahrgestellnummer       | Optionales Feld, Prüfung auf 17 Zeichen ohne I/O/Q, in der Oberfläche nicht prominent                                |
| Aufbewahrung Ablesungen | Unbegrenzt, `erfasstVon` bleibt erhalten; kein Löschlauf                                                             |
| Wartungsvorlauf         | Je Termin einstellbar, Vorgabe 30 Tage                                                                               |
| Schwelle Ablese-Lücke   | 30 Tage ohne Eintrag                                                                                                 |

### Was das für die Trennung bedeutet

Die Vorgabe „Wechsel des Persistenzlayers muss möglich bleiben" wird als harte Regel für
alle Arbeitspakete geführt:

- `fahrzeuge/models/` und `fahrzeuge/services/` kennen ausschließlich die eigenen
  Domänentypen. Kein D1-, SQL- oder `Response`-Typ, kein ETag, kein Datenbankfeldname
  erreicht die Fachschicht.
- Sämtliche Fachtests laufen gegen den In-Memory-Adapter und bleiben beim Backendwechsel
  unverändert.
- Die Übersetzung zwischen Datenbankzeilen und Domänenobjekten liegt an genau einer Stelle
  im Adapter, einschließlich der Prüfung unbekannter externer Daten.
- `version` in `FahrzeugStorage` ist eine undurchsichtige Zeichenkette. Ob dahinter ein
  ETag, eine Zeilenversion oder ein Zeitstempel steckt, sieht die Fachschicht nicht.

Damit ist ein späterer Wechsel auf Supabase oder ein anderes Ziel auf AP-F2 begrenzt.

### Änderungsprotokoll (Nachtrag)

Fachlicher Wunsch (Entscheidung vom 12.09.2026): jede Änderung an einem Fahrzeug soll
nachvollziehbar sein — wer hat wann was geändert. Umsetzung:

- Eigene Tabelle `fahrzeug_aenderungen` (`worker/migrations/0002_fahrzeug_aenderungen.sql`)
  neben `fahrzeuge` und `ablesungen`, ausschließlich serverseitig befüllt. Kein Endpunkt,
  über den ein Client selbst einen Eintrag schreiben könnte — ein Eintrag entsteht immer
  als Nebeneffekt einer anderen Schreiboperation.
- Auslösende Ereignisse: Fahrzeug anlegen, Stammdaten/Wartungstermine speichern (nur bei
  tatsächlicher Änderung — ein Speichern ohne Unterschied erzeugt keinen Eintrag),
  Kilometerstand erfassen, Kilometerstand löschen.
- `beschreibung` wird serverseitig aus dem tatsächlichen Unterschied zwischen altem und
  neuem Stand erzeugt (`worker/src/fahrzeuge.ts`, `diffFahrzeug`), nicht aus einer
  Freitexteingabe des Clients — sonst könnte eine ungenaue oder unehrliche Beschreibung
  eingetragen werden. Mehrere Feldänderungen in einem Speichervorgang landen als mehrere,
  mit `\n` getrennte Zeilen in einem einzelnen Protokolleintrag.
- Nur lesend über `GET /api/fahrzeuge/<UUID>/aenderungen` abrufbar, neueste zuerst.
  `FahrzeugStorage.ladeAenderungen()` im gemeinsamen Vertrag; `InMemoryFahrzeugStorage`
  bildet dieselbe Regel für Fachtests vereinfacht nach.
- In der Oberfläche als eigener, aufklappbarer Abschnitt „Änderungsprotokoll" am Ende der
  Fahrzeugdetailseite (siehe Abschnitt 5 „Oberfläche": alle Abschnitte der Detailseite sind
  seit diesem Nachtrag `mat-expansion-panel`s statt starrer Abschnitte).

### Verwaltungsbereich und Stammdatenimport (Nachtrag)

Fachlicher Anlass (Entscheidung vom 13.09.2026): ein Fuhrpark lässt sich nicht sinnvoll
Fahrzeug für Fahrzeug über das Formular anlegen, und es fehlte bisher ein Ort für
Aufgaben, die ganze Stammdatenbestände betreffen. Umsetzung:

- Neuer Hauptbereich **Verwaltung** (`/verwaltung`, `src/app/verwaltung/`) als vierter
  Navigationspunkt. Er enthält nur den Einstieg; die Fachlogik bleibt beim jeweiligen
  Fachmodul. Erste und bislang einzige Aufgabe ist der Fahrzeugimport.
- **Kein Rollenmodell.** Der Bereich steht jeder geprüften Anmeldung offen, genau wie das
  Löschen von Ablesungen (Abschnitt 8, „Rechte vorerst alle, Rollen später"). Er ist damit
  der natürliche Andockpunkt für eine spätere Admin-Rolle, ist aber heute ausdrücklich
  kein Zugriffsschutz und wird auch in der Oberfläche so benannt.
- Die Importseite liegt fachlich im Fahrzeugmodul
  (`src/app/fahrzeuge/pages/fahrzeug-import/`), die Route hängt im Verwaltungsbereich.
  Das Lesen und Bewerten der Datei ist eine reine Funktion
  (`src/app/fahrzeuge/services/fahrzeug-import.ts`), der Ablauf ein Signalstore
  (`fahrzeug-import-store.service.ts`); der CSV-Leser selbst ist allgemein und liegt unter
  `src/app/kern/text/csv.ts`.

**Dateivertrag.** Kopfzeile erforderlich, Trenner wird erkannt (Semikolon, Komma,
Tabulator), Byte-Order-Mark und Anführungszeichen nach RFC 4180 werden verstanden.

| Spalte                            | Pflicht | Regel                                       |
| --------------------------------- | ------- | ------------------------------------------- |
| `bezeichnung`                     | ja      | nichtleer                                   |
| `kennzeichen`                     | ja      | nichtleer, je Bestand nur einmal            |
| `funkrufname`                     | nein    | freier Text                                 |
| `fahrgestellnummer` (auch `fin`)  | nein    | leer oder gültige FIN                       |
| `eigentuemer` (auch `eigentümer`) | nein    | Schlüssel oder Label; leer → `organisation` |
| `bemerkung`                       | nein    | freier Text                                 |
| `hu_faellig` (auch `hu`)          | nein    | `JJJJ-MM-TT` oder `TT.MM.JJJJ`              |
| `hu_erinnerung_tage`              | nein    | ganze Zahl ab 0, Vorgabe 30                 |

Als Prüftermin wird **nur die Hauptuntersuchung** übernommen: ein `Wartungstermin` mit
`art: 'hu'`. Weitere Wartungstermine bleiben der Detailseite vorbehalten, weil eine
CSV-Spalte je Termin den Dateivertrag ohne fachlichen Gewinn aufblähen würde. Unbekannte
Spalten werden mit Hinweis übergangen, eine fehlende Pflichtspalte sperrt den Import
vollständig.

**Einmaligkeit je Kennzeichen.** Ein Kennzeichen darf es im ganzen Bestand nur einmal
geben — nicht nur im Import. Verglichen wird eine Vergleichsform statt des Rohwerts:
Großschreibung ohne Leerzeichen, Bindestriche und Punkte, so dass `me-xx 123`,
`ME XX123` und `ME.XX.123` dasselbe Kennzeichen sind. Gespeichert und angezeigt wird
immer die eingegebene Schreibweise.

Verbindlich ist die Datenbank: der eindeutige Index aus
`worker/migrations/0003_kennzeichen_eindeutig.sql` liegt auf genau dieser Vergleichsform.
Er ist bewusst **partiell** — ein leeres Kennzeichen bleibt erlaubt und mehrfach möglich,
weil `kennzeichen` im Datenmodell leer sein darf. Der Worker prüft vor dem Schreiben und
antwortet mit `409 / FAHRZEUG_KENNZEICHEN_VERGEBEN`; verliert er das Rennen gegen eine
gleichzeitige Anfrage, übersetzt er die Indexverletzung in dieselbe Antwort. Die Prüfung
ist also die freundliche Fehlermeldung, der Index die Zusage. Das gilt für jede Anlage und
jede Änderung, auch über `/fahrzeuge/neu` und die Detailseite.

Die Fachschicht sieht dafür einen eigenen Fehler, `KennzeichenVergebenFehler`, getrennt
vom `FahrzeugKonfliktFehler`: ein Versionskonflikt wird durch Neuladen und Zusammenführen
gelöst, ein vergebenes Kennzeichen nicht — dort muss das Kennzeichen selbst geändert
werden. `InMemoryFahrzeugStorage` und `FakeFahrzeugeDb` bilden die Regel nach, damit sie
in Fach- und Workertests tatsächlich geprüft wird.

Die Vergleichsform steht damit an drei Stellen — im Index, in `kennzeichenVergeben()`
(`worker/src/fahrzeuge.ts`, als SQL-Ausdruck) und in
`src/app/fahrzeuge/services/kennzeichen.ts` (für Anzeige und Importvorschau). Sie wird nur
gemeinsam geändert. Ein bewusster Unterschied bleibt: SQLites `upper()` arbeitet nur auf
ASCII, `toUpperCase()` auch darüber hinaus. Die Oberfläche erkennt damit höchstens mehr
Schreibvarianten als die Datenbank, nie weniger — sie warnt eher zu früh als zu spät.

Der Import prüft zusätzlich gegen die bereits gelesenen Zeilen derselben Datei und liest
den Bestand unmittelbar vor dem Schreiben erneut, damit die Vorschau nicht etwas
verspricht, was die Datenbank gleich darauf ablehnt.

**Grenzen, bewusst so entschieden.** Der Import ist nicht transaktional (siehe unten). Der
eindeutige Index muss auf einen bestehenden Bestand erst angewendet werden und scheitert,
solange dort Doubletten liegen; die Prüfabfrage steht als Kommentar in der
Migrationsdatei.

**Keine neue API-Oberfläche.** Der Import legt jedes Fahrzeug einzeln über den
bestehenden Neuanlagepfad an (`POST /api/fahrzeuge` mit `If-None-Match: *`); es gibt
keinen Massenschreibpfad, keinen neuen Endpunkt und keine Migration. Jede angelegte Zeile
erzeugt damit automatisch den Protokolleintrag „Fahrzeug angelegt", und `geaendertVon`
setzt weiterhin ausschließlich der Worker aus der geprüften Anmeldung. Der Lauf ist
deshalb nicht transaktional: bricht er ab, bleiben die bereits angelegten Fahrzeuge
stehen. Der Bericht weist Zeile für Zeile aus, was tatsächlich angelegt wurde, und lässt
sich als CSV sichern.

## 9. Noch offen

- Übernahme von Stammdaten aus HiOrg: die drei freigegebenen EFS-Aktionen liefern keinen
  Fahrzeugstamm. Eine weitere Aktion braucht zuerst einen Nachweis durch die echte API und
  deren Dokumentation. Bis dahin manuelle Pflege.
- Ob die HU-Fälligkeit zusätzlich aus einem Prüfbericht übernommen werden soll.
- Format und Größe des Aufkleberbogens (Papiergröße, Anzahl je Blatt).
- Anwenden von `0003_kennzeichen_eindeutig.sql` und `0007_oeffentliche_meldung.sql` auf die
  produktive `stationwizard-fahrzeuge`-Datenbank: beide stehen im Repository, sind aber noch
  nicht ausgeführt. Vorher den Bestand mit der Abfrage aus `0003_kennzeichen_eindeutig.sql`
  auf Doubletten prüfen. `0005_systemkonfiguration.sql` betrifft die getrennte
  `stationwizard-benutzer`-Datenbank und wurde dort bereits angewendet (siehe Arbeitsstand,
  AP-S1).
- **Durchsetzung der Rollenvergabe.** Seit Abschnitt 10 prüft der Worker die Rolle bei der
  Freigabe wirklich; `PUT /api/benutzerverwaltung/<E-Mail>` steht aber weiterhin jeder
  geprüften Identität offen. Solange das so ist, kann sich jede angemeldete Person selbst
  die Rolle geben, die zum Freigeben nötig ist. Das ist die auffälligste verbleibende Lücke.
- Datumskorrektur bei der Freigabe: die öffentliche Meldung setzt `abgelesenAm` serverseitig
  auf den Berliner Kalendertag. Ob die freigebende Person den Tag korrigieren können soll,
  ist offen.
- Benachrichtigung bei neuer Meldung (Mail oder Popup). Der Bereich „Offene Aufgaben" ist
  der vorgesehene Anschlusspunkt; der Mailversand ist produktiv noch nie gelaufen.
- Ob der Import weitere Wartungstermine außer der HU aufnehmen soll.
- Der Fahrzeug-QR-Übersichtsbogen war die erste rollenbasierte Einblendregel im
  Verwaltungsbereich und hat seit Abschnitt 10 eine serverseitige Entsprechung:
  `GET /api/fahrzeuge/erfassungslinks` liefert nur die Gruppen, für die die aufrufende
  Person freigeben darf. Die Einblendung selbst (`BenutzerverwaltungStoreService.darfFreigeben`)
  bleibt eine UI-Regel. Für alle übrigen Funktionen des Verwaltungsbereichs gilt weiterhin
  „Rechte vorerst alle, Rollen später“ (Abschnitt 8).

## 10. Öffentliche Kilometermeldung und Freigabe

Nachtrag vom 16.09.2026. Dieser Abschnitt kehrt die Festlegung aus Abschnitt 4
für **einen** der drei QR-Codes um und begründet, warum.

### Anlass

Abschnitt 4 nannte den Preis der Access-gebundenen Erfassung ausdrücklich: „wer
keinen Account hat, kann nichts erfassen. Das ist gewollt." Genau dieser Preis
ist die Einstiegshürde, an der die Nutzung in der Helferschaft scheitert. Wer
den Kilometerstand am Fahrzeug melden soll, müsste vorher in die
Cloudflare-Access-Zugriffsliste aufgenommen werden und sich bei Google anmelden.

### Entscheidung

Ein dritter, **öffentlich erreichbarer** QR-Code je Fahrzeug führt auf eine
abgeschottete Meldeseite. Die dort abgegebene Meldung ist keine Ablesung,
sondern eine Einreichung; erst die Freigabe durch die Zug- oder Gruppenführung
macht daraus den echten Kilometerstand. Die beiden bisherigen Codes bleiben
unverändert.

### Token statt Access-Sitzung

Ohne Sitzung braucht der Zugang ein anderes Merkmal. Ohne Token bliebe nur eine
allein über die UUID adressierbare, ungeschützte Schreibfläche. Deshalb trägt
der öffentliche Code ein Zufallstoken (16 Bytes als Hex, Spalte
`fahrzeuge.erfassung_token`, Migration 0007) und der Pfad lautet `/e/<TOKEN>` —
**ohne** Fahrzeug-UUID, damit ein Foto des Aufklebers keine interne Kennung
hergibt.

Das Token ist ein Geheimnis: es steht in keiner Fahrzeugantwort, keinem Log,
keinem Fehlertext und keinem Protokolleintrag. Auslesbar ist es allein über
`/api/fahrzeuge/<UUID>/erfassungslink` und `/api/fahrzeuge/erfassungslinks`.
Erneuern macht alle gedruckten Aufkleber dieses Fahrzeugs sofort ungültig; eine
Übergangsfrist mit zwei gültigen Token gibt es bewusst nicht, das wäre ein
zweites Geheimnis ohne Ablaufüberwachung.

### Eigenes Build-Ziel statt einer Route der App

Die Seite ist ein zweites, sehr kleines Angular-Build-Ziel (`oeffentlich/`,
ausgeliefert unter `/oeffentlich/`, rund 34 kB Übertragung). Der Grund ist der
Zuschnitt des Access-Bypasses: die Dateinamen der Hauptanwendung tragen je Build
einen neuen Hash, ein Bypass für eine Route der App hätte deshalb „alles außer
`/api/*`" lauten müssen. So bleibt die App-Hülle vollständig geschützt und der
Bypass auf drei Pfadmuster begrenzt.

Die Seite hat keinen Router und keinen einzigen Verweis — die geforderte
Abschottung ist damit strukturell, nicht nur optisch. Unter `/oeffentlich/`
liefert der Worker nur eine feste Erlaubnisliste aus und verwirft eine
HTML-Antwort auf eine `.js`/`.css`-Anfrage, damit die SPA-Rückfallebene nie die
geschützte Hülle nach außen gibt.

### Was die Seite zeigt — und was nicht

Preisgegeben werden Bezeichnung, Funkrufname und Kennzeichen. Das Kennzeichen,
damit der Meldende sicher ist, am richtigen Fahrzeug zu stehen; es ist am
Fahrzeug ohnehin sichtbar, genau wie der Aufkleber. Das ist trotzdem eine
bewusste Offenlegung organisationsbezogener Daten gegenüber einer nicht
angemeldeten Person und gehört zum Datenschutzabschnitt dieses Dokuments.

Nicht preisgegeben: die Fahrzeug-UUID, der letzte Kilometerstand, Jahresbilanz,
Soll, Eigentümer, Gruppe, Wartungstermine, FIN, Bemerkung, jede E-Mail-Adresse,
frühere Meldungen und das Änderungsprotokoll.

Der letzte Stand fehlt aus zwei Gründen: er würde dem Meldenden erlauben, seine
Zahl „passend" zu wählen, und er legte die Fahrzeugnutzung für jeden Scanner
offen. **Die Plausibilitätsprüfung findet deshalb nicht auf der öffentlichen
Seite statt, sondern bei der Freigabe** — dort, wo eine geprüfte Person mit
vollem Kontext entscheidet.

Ein Datumsfeld gibt es ebenfalls nicht; `abgelesen_am` setzt der Worker als
Berliner Kalendertag. Das nimmt die Rückdatierung aus einer nicht angemeldeten
Quelle als Angriffsfläche vollständig heraus, und am Fahrzeug wird ohnehin
sofort gemeldet. Eine spätere Datumskorrektur durch die freigebende Person ist
nicht Teil dieses Pakets (siehe Abschnitt 9).

### Schutz ohne Access

Weder Access noch die Ursprungsprüfung aus `index.ts` laufen vor diesem Zweig;
beides erbringt `worker/src/oeffentliche-erfassung.ts` selbst. Unbekanntes
Token, formal ungültiges Token und gelöschtes Fahrzeug liefern byteweise
dieselbe Antwort — kein Orakel. Für `POST` muss `Origin` gleich der eigenen
Origin sein, strenger als die globale Prüfung, die einen fehlenden `Origin`
duldet. Körpergrenze 2 KiB, Name 2–60 Zeichen, Bemerkung 200, Stand als ganze
Zahl bis 9 999 999.

Die Mengenbremsen sind **fahrzeugbezogen, nicht IP-bezogen**: höchstens fünf
offene Meldungen je Fahrzeug und höchstens eine pro Minute. Eine IP-Speicherung
wäre eine neue personenbezogene Verarbeitung ohne fachlichen Auftrag und
widerspräche der Datenschutzlinie dieses Moduls.

### Einreichung und Freigabe

Einreichungen liegen in einer **eigenen Tabelle** `ablesung_einreichungen`, nicht
mit einem Statusfeld in `ablesungen`. Dort steht ausschließlich, was als echter
Kilometerstand gilt, und jede Kennzahl — Jahresbilanz, Ablese-Lücke,
Kilometerstandsbericht — liest diese Tabelle vollständig. Die Trennung macht
„noch nicht freigegeben fließt nirgends ein" strukturell wahr statt nur
verabredet.

Nach der Freigabe steht in `ablesungen.erfasst_von` die geprüfte E-Mail der
**freigebenden** Person. Die projektweite Zusage „`erfasstVon` ist immer eine
geprüfte Access-Identität" bleibt damit unangetastet; die freigebende Person
übernimmt die Verantwortung für den Wert — genau dafür gibt es die Freigabe.
Der selbst angegebene Name steht daneben in `gemeldet_von_name` und wird in der
Oberfläche wie im Protokolleintrag als Selbstauskunft kenntlich gemacht. Die
`quelle` `oeffentlich` entsteht ausschließlich intern bei der Freigabe und ist
über `POST /api/fahrzeuge/<UUID>/ablesungen` nicht einreichbar; sonst könnte
jede angemeldete Person eine Freigabe fingieren.

### Erste durchgesetzte Rolle

`worker/src/rollen.ts` ist die erste Rollenprüfung des Projekts, die
tatsächlich sperrt statt nur die Oberfläche zu steuern: freigeben darf
`zugfuehrung` (alle Gruppen) oder `gruppenfuehrung-<gruppe>` genau der
Fahrzeuggruppe. `gruppenfuehrung-verpflegung` trifft nie zu, weil für
Verpflegung keine Fahrzeuge vorgesehen sind. Rollen liegen in `BENUTZER_DB`,
Fahrzeuge in `FAHRZEUGE_DB` — zwei getrennte Datenbanken, also zwei Abfragen und
der Vergleich in TypeScript. Fehlende Konfiguration sperrt.

**Ehrliche Grenze:** die Prüfung ist nur so stark wie die Rollenvergabe, und
`PUT /api/benutzerverwaltung/<E-Mail>` steht weiterhin jeder geprüften Identität
offen. Wer sich selbst `zugfuehrung` setzt, darf anschließend freigeben. Das ist
kein Grund, hier nichts zu prüfen — die Prüfung verhindert Versehen und ist der
Andockpunkt —, aber es ist danach die auffälligste verbleibende Lücke.

### Offene Aufgaben als Ort der Entscheidung

Die Freigabe erfolgt im neuen, fachübergreifenden Bereich `/aufgaben`. Der
Vertrag `kern/aufgaben/aufgabenquelle.ts` kennt keinen Fachtyp; jede Quelle
liefert fertige Anzeigetexte. Die angekündigten Mail- und
Popup-Benachrichtigungen sind damit eine weitere Quelle beziehungsweise ein
Anschluss an diesen Bereich, kein Umbau. Mail ist in diesem Paket bewusst nicht
gebaut: der Versandweg ist produktiv noch nie gelaufen (siehe Arbeitsstand,
AP-S1).
