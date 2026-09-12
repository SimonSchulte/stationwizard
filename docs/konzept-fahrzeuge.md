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
- **Kilometerstände sind unveränderlich.** Eine Ablesung wird nie überschrieben; ein
  Fehler wird durch eine Korrekturablesung mit Verweis ersetzt. Nur so bleibt die
  Jahreslaufleistung nachvollziehbar und eine nachträgliche Beschönigung der Pflichtkilometer
  erkennbar.
- **`imBestandSeit` / `imBestandBis`** sind nötig, weil das Mindest-Soll monatsweise
  definiert ist. Ohne diese Angaben wäre die Jahresrechnung für unterjährig zugelaufene
  Fahrzeuge falsch.

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

Berechnung je Fahrzeug und Kalenderjahr:

```
anrechenbareMonate = Anzahl Monate des Jahres, in denen das Fahrzeug im Bestand ist
sollKm            = satz * anrechenbareMonate
istKm             = aktuellerStand - standZumJahresbeginn
restKm            = max(0, sollKm - istKm)
```

Festlegungen, die zur Abstimmung stehen:

- Ein angefangener Monat zählt als **voller** Monat. Alternative wäre tagesgenaue
  Anteiligkeit. Vorschlag: voller Monat, weil die Vorgabe selbst monatsweise formuliert ist.
- **`standZumJahresbeginn`** ist die letzte Ablesung mit `abgelesenAm <= 31.12. des
Vorjahres`. Existiert keine, wird die erste Ablesung des laufenden Jahres verwendet und
  das Ergebnis in der Oberfläche ausdrücklich als **unvollständig** gekennzeichnet — nicht
  stillschweigend mit 0 gerechnet und nicht interpoliert. Für das erste Nutzungsjahr des
  Moduls ist das der Normalfall und muss ehrlich sichtbar bleiben.
- Bei `eigentuemer === 'organisation'` gibt es kein Soll. Das Dashboard zeigt dort die
  Jahreslaufleistung ohne Ampel, nicht „0 km offen" — das wäre eine falsche Erfolgsmeldung.
- Eine Hochrechnung („bei aktuellem Schnitt am Jahresende: x km") ist als Zusatz
  vorgesehen, klar als Prognose beschriftet.

## 4. QR-Codes

Zwei Codes je Fahrzeug:

| Zweck                   | Ziel           |
| ----------------------- | -------------- |
| Fahrzeugübersicht       | `/f/<UUID>`    |
| Kilometerstanderfassung | `/f/<UUID>/km` |

### Identität: kein Token im Code

Die Erfassung soll „im Namen des registrierten Benutzers" erfolgen. Das geschieht
**ausschließlich** über die bestehende Cloudflare-Access-Sitzung des Scannenden. Der
QR-Code enthält keine Kennung, kein Token und keinen Benutzerbezug — er ist ein an der
Windschutzscheibe klebender, fotografierbarer Aufkleber und damit kein Geheimnis.

Ablauf: Scan → Access prüft die Anmeldung (bei fehlender Sitzung Google-Anmeldung) →
App öffnet das Erfassungsformular → der Worker schreibt `erfasstVon` aus der
verifizierten JWT-Identität, **niemals** aus dem Anfragekörper. Ein im Körper
mitgesendetes Benutzerfeld wird verworfen.

Damit entsteht keine neue Authentifizierungsfläche und kein Sonderweg am Zugangsschutz
vorbei. Der Preis: wer keinen Account hat, kann nichts erfassen. Das ist gewollt.

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

| Seite                         | Inhalt                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| Dashboard `/fahrzeuge`        | Nächste Wartungen über alle Fahrzeuge, Restkilometer je Fahrzeug, Fahrzeuge ohne aktuelle Ablesung       |
| Liste `/fahrzeuge/liste`      | Alle Fahrzeuge, Filter nach Eigentümer, Suche über Funkrufname und Kennzeichen                           |
| Detail `/fahrzeuge/:id`       | Stammdaten, Wartungstermine, Ablesungsverlauf, beide QR-Codes, Druckbogen                                |
| Erfassung `/fahrzeuge/:id/km` | Bewusst minimal: Zahlenfeld, Datum (Vorgabe heute), Speichern. Ziel des QR-Codes, mobil zuerst entworfen |

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

Eine Ablesung verknüpft eine Person mit einem Zeitpunkt und einem Fahrzeug und ist damit
personenbezogen. Vorgesehen:

- Keine realen Fahrzeug-, Personal- oder Zugangsdaten in Repository, Fixtures, Tests,
  Screenshots oder Fehlertexten. Testdaten werden im Test erfunden.
- Keine Persistenz fachlicher Daten in `localStorage`.
- Anzeige von `erfasstVon` nur in der Fahrzeugdetailansicht, nicht im Dashboard.
- Eine Aufbewahrungsfrist für Ablesungen ist **festzulegen** (Vorschlag: laufendes plus
  zwei abgeschlossene Kalenderjahre). Dies ist eine Entscheidung der Einheit, keine
  technische.

## 7. Umsetzungsplan

Jedes Arbeitspaket ist ein eigener AP-Branch mit eigenständig prüfbarem Pull Request und
grünem Build, Test und Formatprüfung.

### AP-F1 — Domäne und Abstraktion (ohne Backendentscheidung)

- `fahrzeuge/models/fahrzeug.model.ts`, `fahrzeuge/storage/fahrzeug-storage.ts`
- Fachlogik in `fahrzeuge/services/`: Fälligkeitsberechnung der Wartungstermine,
  Soll-/Ist-/Restkilometer, Jahresstartstand samt Kennzeichnung „unvollständig",
  Plausibilitätsprüfung von Ablesungen
- Prüfroutinen für unbekannte externe Daten (analog `pep-datei.ts`, ohne `any` und
  ungeprüfte Casts)
- In-Memory-Adapter für Tests
- Tests: Monatsanteile über Jahresgrenzen, Schaltjahr, unterjähriger Zu- und Abgang,
  Organisation ohne Soll, fehlende Vorjahresablesung, Tachorückschritt, Korrekturkette
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
- Wartungstermine anlegen, bearbeiten, als erledigt markieren; HU hervorgehoben
- `VerlassenSchutz`, gemeinsame Dialoge, gemeinsame Leer- und Ladezustände
- Route in `app.routes.ts`, Einstieg auf der Startseite

### AP-F4 — Kilometererfassung und QR

- Erfassungsseite, mobil zuerst; Verlauf in der Detailansicht; Korrekturweg
- QR-Erzeugung als SVG, dynamischer Import
- Druckbogen über `pdfmake`, Farben aus der zentralen Farbquelle
- Browserprüfung des Scanwegs auf einem echten Telefon inklusive Access-Anmeldung

### AP-F5 — Dashboard

- Nächste Wartungen über alle Fahrzeuge, nach Fälligkeit sortiert, Ampel über Vorlauf
- Restkilometer je Fahrzeug, Organisation ohne Ampel, unvollständige Datenlage sichtbar
- Fahrzeuge ohne Ablesung in den letzten n Tagen (n festzulegen, Vorschlag 60)
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

## 8. Zu entscheiden

1. **Backend:** Cloudflare D1 (Empfehlung) oder Supabase.
2. Angefangener Monat zählt voll — oder tagesgenaue Anteiligkeit?
3. Wird die Fahrgestellnummer überhaupt erfasst?
4. Aufbewahrungsfrist für Kilometerablesungen.
5. Vorlauf der Wartungswarnung (Vorschlag 30 Tage) und Schwelle „lange keine Ablesung"
   (Vorschlag 60 Tage).
6. Dürfen alle angemeldeten Benutzer Stammdaten ändern, oder nur Ablesungen erfassen?
   Access liefert derzeit nur die Identität, keine Rollen. Eine Rollenunterscheidung wäre
   zusätzlicher Aufwand und ist bislang nicht beauftragt.
