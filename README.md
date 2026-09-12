# stationwizard

Gemeinsame Ausbildungs- und Personaleinsatzplanung für eine Katastrophenschutz-Einheit.
Eine Angular-App bündelt den Jahres-Ausbildungsplan und die Einsatzplanung für
Sanitätsdienste. Ein Cloudflare Worker liefert die App und ihre APIs unter derselben Origin
aus; Cloudflare Access mit Google übernimmt die Anmeldung.

Die App ist eingerichtet und läuft produktiv. Betriebskonfiguration (Secrets, Access,
API-Fehlercodes) steht im [Worker-README](worker/README.md); der Prüfstand der Arbeitspakete
in [Arbeitsstand](docs/arbeitsstand.md). Für eine erneute Einrichtung oder den Wechsel von
Zugangsdaten siehe [Einrichtung](docs/einrichtung.md).

## Fachbereiche

| Bereich            | Funktionen                                                                                                                 | Aktuelle Route      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Startseite         | Einstieg in alle Fachbereiche, gemeinsamer Benutzer- und Verbindungsstatus                                                 | `/#/`               |
| Ausbildungsplanung | Jahresplan im Wochenraster, Ideen, Auswertung, KatS-A-Plan, Feiertage, konfigurierbarer Diensttag und HiOrg-Terminabgleich | `/#/ausbildung`     |
| Einsatzplanung     | Planungsliste, EFS-Veranstaltungsimport und gespeicherte Einsatzpläne                                                      | `/#/einsatz`        |
| Einsatzplan-Editor | Helferpool, Posten/Positionen, Qualifikationsabgleich, Zuordnung und Exporte                                               | `/#/einsatz/editor` |
| Fahrzeuge          | Liste, Stammdaten, Wartungstermine, Kilometerverlauf mit Jahresbilanz, QR-Codes und Druckbogen; Fuhrpark-Dashboard folgt   | `/#/fahrzeuge`      |

Hash-Routing bleibt vorerst bewusst erhalten. Der Worker ist bereits mit
`not_found_handling = "single-page-application"` vorbereitet, aber der reale
workerd-/SPA-Test wurde beim Laufzeitstart von der Ausführungsumgebung blockiert.
`npm run test:spa` und die Browserprüfung der Direkteinstiege müssen erfolgreich sein,
bevor `withHashLocation()` entfernt wird. Eine vorhandene Konfigurationsoption allein
belegt keinen funktionierenden SPA-Fallback.

## Architektur

Angular 21, standalone, zoneless, Signals, OnPush und striktes TypeScript bilden die
gemeinsame Grundlage. Alle Fachbereiche werden über Lazy-Routen geladen. Material/CDK,
das Material-Theme, lokale Schriften und Design-Tokens werden gemeinsam verwendet.
Komponentenstyles sind LESS; die zentrale Material-Theme-Konfiguration liegt in SCSS.
Hinweis- und Bestätigungsdialoge nutzen den gemeinsamen `DialogDienst`. Der
`VerlassenSchutz` warnt vor dem Verlust ungesicherter Änderungen. Taktische Zeitangaben
und Kalenderhilfen liegen im Kern; Sommer-/Winterzeit wird dabei berücksichtigt.

| Pfad                  | Verantwortung                                                                      |
| --------------------- | ---------------------------------------------------------------------------------- |
| `src/app/ausbildung/` | Excel-Schema, Planoperationen, Jahresraster und Ausbildungsoberfläche              |
| `src/app/einsatz/`    | Einsatzmodelle, Qualifikationsmatching, EFS-Mapping, PEP-/PDF-Export und Editor    |
| `src/app/fahrzeuge/`  | Fahrzeugstammdaten, Wartungstermine, Kilometerstände; D1 als Persistenz            |
| `src/app/kern/`       | Startseite, `WorkerClient`, gemeinsame Dateispeicherverträge und Kalenderutilities |
| `src/app/app.*`       | Gemeinsame Shell, Navigation und Anwendungsrouten                                  |
| `src/styles.less`     | Gemeinsame CSS-Variablen, Typografie und Oberflächenregeln                         |
| `src/theme.scss`      | Ein Material-Theme für alle Fachbereiche                                           |
| `worker/src/`         | Access-Prüfung, feste API-Routen, Nextcloud- und EFS-Proxys                        |
| `worker/tests/`       | Worker-Tests und isolierter Test der Static Assets mit workerd                     |
| `docs/`               | Einrichtung, Verifizierungsstand und bekannte Grenzen                              |

Nextcloud- und HiOrg-Aufrufe gehen ausschließlich an API-Pfade derselben Origin; der Worker
kontaktiert diese Systeme serverseitig. Öffentliche Feiertagsdaten werden weiterhin direkt
von `feiertage-api.de` geladen, ohne Nextcloud-/HiOrg-Zugangsdaten. Bei fehlgeschlagenem
Feiertagsabruf bleibt die lokale Berechnungsrückfallebene erhalten. Fachlogik bleibt bei
ihrem jeweiligen Planer; der gemeinsame Kern enthält nur tatsächlich gemeinsame Aufgaben.

### Anmeldung und Zugangsdaten

Nach Einrichtung schützt Cloudflare Access den gesamten Worker mit **All traffic**, einschließlich
`workers.dev`, Vorschauen und später der bestätigten Custom Domain. Die Access-Richtlinie
begrenzt erlaubte Google-Konten auf die vereinbarten Adressen beziehungsweise eine
ausdrücklich vereinbarte Organisationsdomain.

Der Worker verifiziert zusätzlich `Cf-Access-Jwt-Assertion` gegen die öffentlichen
Access-Schlüssel, den konfigurierten Aussteller und die Audience. Abgelaufene oder ungültige
Tokens werden abgewiesen. `run_worker_first = true` führt diese Prüfung vor **allen** Assets
und APIs aus. Bei fehlender Konfiguration bleibt der Worker geschlossen; es gibt keinen
produktiven Authentifizierungs-Bypass.

`ACCESS_TEAM_DOMAIN` und `ACCESS_AUD` sind Worker-Laufzeitvariablen. Nextcloud- und
HiOrg-Zugangsdaten kommen aus Secrets-Store-Bindings oder klassischen Worker-Secrets.
`leseZugangsdatum()` unterstützt beide Formen. Der Store
`36762a3b5aa547bea7f547b1d66c30ee` ist in `worker/wrangler.toml` referenziert; Werte stehen
nicht im Repository. Google Client ID und Client Secret gehören ausschließlich in den
Cloudflare-Google-Identitätsanbieter.

Die bisherigen API-Key- und Zugriffsschlüssel-Eingaben entfallen. Die Shell zeigt die vom
Worker bestätigte E-Mail-Adresse und bietet `/cdn-cgi/access/logout` an. Der gemeinsame
Client zeigt Verbindungs- und Sitzungsfehler an; er enthält keine Upstream-Zugangsdaten.

### API-Verträge

Alle folgenden Endpunkte benötigen eine verifizierte Access-Anmeldung:

| Endpunkt                           | Methode    | Inhalt                                                                     |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `/api/status`                      | GET        | `{ "status": "erreichbar" }`; prüft den Worker, nicht die Upstream-Systeme |
| `/api/benutzer`                    | GET        | `{ "email": "…" }` aus dem verifizierten Anwendungstoken                   |
| `/api/efs/checkapikey`             | POST       | JSON `{}`; prüft den serverseitig konfigurierten EFS-Zugang                |
| `/api/efs/getveranstaltungen`      | POST       | JSON `{}`; Veranstaltungen aus HiOrg                                       |
| `/api/efs/getveranstaltung`        | POST       | JSON `{ "id": "…" }`; Details einer Veranstaltung                          |
| `/api/nextcloud/arbeitsmappe`      | GET / PUT  | Die konfigurierte Excel-Dateifreigabe                                      |
| `/api/nextcloud/planungen`         | GET        | `{ "dateien": [{ "id": "…", "etag": "…" }] }` mit UUIDs und Dateiversionen |
| `/api/nextcloud/planungen/<UUID>`  | GET / PUT  | Genau eine `.pep.json` im gesonderten Ordner                               |
| `/api/hiorg/kalender`              | GET        | `{ "status": "OK", "eintraege": [...] }`; HiOrg-Kalenderfeed, nur lesend   |
| `/api/fahrzeuge`                   | GET / POST | Fahrzeugliste; Neuanlage nur mit `If-None-Match: *`                        |
| `/api/fahrzeuge/<UUID>`            | GET / PUT  | Einzelnes Fahrzeug mit `ETag`; Update nur mit passendem `If-Match`         |
| `/api/fahrzeuge/<UUID>/ablesungen` | GET / POST | Kilometerablesungen, unveränderlich                                        |
| `/f/<UUID>`, `/f/<UUID>/km`        | GET        | QR-Kurzlink, leitet auf die aktuelle Hash-Route weiter                     |

EFS-Aufrufe setzt der Worker in `application/x-www-form-urlencoded` mit `apikey`,
`version=2` und einer der drei bekannten Aktionen um. Die Ziel-URL stammt aus
`HIORGSERVER_BASE_URL`. Es gibt keine frei wählbaren Proxy-Ziele, keine unbekannten
EFS-Aktionen und keine Nextcloud-Löschroute. Unbekannte `/api/*`-Pfade liefern eine
JSON-Fehlerantwort und fallen nicht auf die SPA zurück.

Die Einsatzliste prüft die EFS-Verbindung beim Öffnen automatisch. Verknüpfte Planungen
bieten Synchronisierung beziehungsweise erneutes Laden an. Ist EFS nicht erreichbar,
bleibt lokale JSON-Planung möglich. Das bestehende medizinische Mapping wird auch auf
`bes_ausbild` angewendet, sodass `Notarzt / Notärztin` wie in der Fachspezifikation als `NA`
erkannt wird; die Rangfolge der Qualifikationen wurde dabei nicht verändert.

Fehler enthalten feste Codes, auch im Header `X-Stationwizard-Diagnose`. Rohantworten mit
Zugangsdaten werden nicht als Diagnose durchgereicht. Weitere Details:
[Worker-Dokumentation](worker/README.md).

## Dateiformate und Speichern

**Ausbildung:** Excel bleibt das führende Format. Die Arbeitsmappe enthält **Jahresplan**,
**Offene Ideen** und **KatS-A-Plan**; es wird kein alternatives Ausbildungs-JSON eingeführt.
`@e965/xlsx` wird dynamisch geladen. `WorkbookStorage` baut auf dem gemeinsamen
`DateiStorage`-Vertrag auf. Quellen sind eine lokale Datei oder die konfigurierte
Nextcloud-Dateifreigabe über den Worker.

**HiOrg-Termine im Jahresplan:** Der HiOrg-Kalenderfeed wird über den Worker gelesen und
im Wochenraster **zusätzlich und deutlich als Fremdquelle gekennzeichnet** angezeigt; ein
Umschalter im Menü blendet die Ebene aus. Steht an einem Tag mit Ausbildungsthema ein
HiOrg-Termin, dessen Bezeichnung nach Entitäten-Dekodierung, Whitespace-Normalisierung und
Groß-/Kleinschreibung nicht exakt übereinstimmt, erscheint eine deutliche Warnung mit zwei
Wegen: den HiOrg-Namen in den Plan übernehmen (rückgängig über Strg+Z) oder den Termin im
HiOrg-Server öffnen und den Titel dort ändern. HiOrg-Termine ohne Ausbildungsthema im Plan
lassen sich als Termin übernehmen. Die Feed-Daten werden weder in die Excel-Mappe
geschrieben noch im Browser gespeichert; es gibt bewusst **kein** dauerhaftes
„geklärt"-Kennzeichen, weil das eine zusätzliche Spalte im Jahresplan-Blatt bräuchte.

**Einsatz:** Eine `.pep.json` enthält weiterhin eine einzelne Planung mit `version`, `meta`
und `planung`. Versionsabweichungen werden angezeigt. Lokaler Import/Download bleibt
möglich; **In Nextcloud speichern** legt im gesonderten freigegebenen Ordner
`<UUID>.pep.json` ab. Die Liste enthält zunächst nur UUID und ETag. Eine Planung wird
bewusst einzeln geladen; Namen sind nach Laden oder Speichern bekannt. PDF-Export nutzt
weiterhin `pdfmake` und die bestehenden taktischen Zeichen. Die PDF-Bibliothek wird erst
beim Export geladen; erzeugte PDF-Bytes werden durch eigene Exporttests geprüft.

Ein Listen-ETag kann fehlen (`null`). Ohne verlässlich vergleichbaren starken ETag darf
eine bereits geladene Datei nicht überschrieben werden; die App fordert dann erneutes
Laden beziehungsweise eine lokale Sicherung. Vor einem Seitenneuladen lokale Änderungen
speichern oder exportieren. Nach dem Neuladen die gewünschte Planung erneut aus Nextcloud
oder einer JSON-Datei öffnen; das bloße Öffnen der Editor-Route stellt sie nicht wieder her.

Nextcloud-Schreibzugriffe verwenden ETags: `If-Match` für geladene Dateien beziehungsweise
`If-None-Match: *` für ausdrücklich neue Dateien. Bei HTTP 412 bleiben lokale Änderungen
erhalten. Zuerst eine lokale Kopie herunterladen, dann den aktuellen Stand laden und die
Änderungen zusammenführen. Nach einem unklaren Speicherergebnis nicht ungeschützt erneut
schreiben. Einsatzpläne werden nicht automatisch in Nextcloud gespeichert.

Für den Einsatzplanordner wird zusätzlich `NEXTCLOUD_PEP_SHARE_TOKEN` benötigt; für
passwortgeschützte Freigaben das jeweilige optionale Freigabepasswort. Der Ordner muss
Lesen, Bearbeiten und Hochladen erlauben. [Freigaben einrichten](docs/einrichtung.md)

## Entwicklung und Prüfungen

Node.js **24** gemäß `.node-version` und npm **11 oder neuer** verwenden. Alle Kommandos
werden aus der Repository-Wurzel ausgeführt:

```bash
npx npm@11 ci
npm start
```

`npm start` startet Angular zur Oberflächenentwicklung. Die lokalen Dateifunktionen lassen
sich unabhängig von den produktiven Upstream-Verbindungen entwickeln. Nextcloud und HiOrg
benötigen den eingerichteten Worker; der Angular-Devserver ersetzt diesen nicht.

| Kommando                 | Zweck                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `npm run build`          | Angular-Produktionsbuild und Worker-TypeScript-Prüfung                                    |
| `npm test`               | Angular-Tests über `@angular/build:unit-test` und Worker-Tests mit Vitest                 |
| `npm run test:watch`     | Angular-Tests im Watch-Modus                                                              |
| `npm run format:check`   | Prettier prüfen                                                                           |
| `npm run format`         | Prettier anwenden                                                                         |
| `npm run worker:check`   | Worker-TypeScript ohne Ausgabe prüfen                                                     |
| `npm run worker:test`    | Worker-Vitest-Tests ausführen                                                             |
| `npm run test:spa`       | Reales Worker-Bundle, lokale Test-JWKS und Static Assets mit workerd prüfen; vorher bauen |
| `npm run deploy:dry-run` | Wrangler-Bundle, Assets und Bindings ohne Deployment prüfen; vorher bauen                 |
| `npm run worker:dev`     | Worker lokal starten; vollständige JWT-Prüfung bleibt aktiv                               |
| `npm run deploy`         | Worker und bereits gebaute Static Assets deployen                                         |

Vor einem AP-PR müssen `npm run build`, `npm test` und `npm run format:check` erfolgreich
sein. Tests verwenden erfundene Daten und lokal erzeugte Excel-Inhalte. Die übernommenen
Fachtests für Matching, Excel-Rundlauf, Planoperationen, Raster, Datum und Feiertage bleiben
erhalten. Eine erfolgreiche Unit-Test-Suite ersetzt weder Desktop-/Mobiltests im Browser
noch die Prüfung echter Nextcloud-/HiOrg-Verbindungen.

### Deployment über Workers Builds

Cloudflare verbindet `SimonSchulte/stationwizard` mit Produktionsbranch `main` und der
Repository-Wurzel als Build-Verzeichnis. Die vorbereiteten Kommandos sind:

| Einstellung            | Wert                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| Build-Variablen        | `NODE_VERSION=24`, `SKIP_DEPENDENCY_INSTALL=true`                    |
| Build                  | `npx npm@11 ci && npm run format:check && npm test && npm run build` |
| Produktion deployen    | `npm run deploy`                                                     |
| Nichtproduktionsbranch | `npx wrangler versions upload --config worker/wrangler.toml`         |

Nichtproduktionsbranches erzeugen eigene Vorschauversionen und ändern die Produktion nicht.
Details zu Secrets, Access-Richtlinie und Domainanbindung stehen im
[Worker-README](worker/README.md) und in [Einrichtung](docs/einrichtung.md).

## Mobil und bekannte fachliche Abweichungen

Die Ausbildungsplanung behält `mobilAnsicht`, die Umschaltung zwischen Plan- und
Listenansicht sowie die untere Navigation bis einschließlich 780 Pixel bei. Das breite
Wochenraster kann horizontal gescrollt werden. Für den Einsatzplaner sind responsive
Anpassungen vorbereitet; für umfangreiche Zuordnungen wird vorerst Desktopbedienung
empfohlen.

Die gelesenen Quellprojekte weichen an zwei Stellen von der Auftragsbeschreibung ab:

- `MEDIZINISCH_ORDER` enthält tatsächlich neun Werte:
  `EH, SSD, SanH, RH, RS, RA, NotSan, A, NA`. Die beschriebene Zwölferliste einschließlich
  `SAN`, `FR` und `RDH` ist dort nicht implementiert. Die bestehende Reihenfolge bleibt bis
  zur fachlichen Klärung erhalten; ihr Rang beeinflusst das Matching.
- Der ursprüngliche Einsatzplan-Editor enthält Helferpool und Postenbereich, aber keinen
  separaten dritten Inspektor. Dieser Quellstand wurde übernommen.

Die Liste mit 27 echten Fahrzeugstammdatensätzen wurde nicht übernommen. Fahrzeuge können
weiter frei erfasst werden. Es gehören keine realen Personal-, Einsatz- oder Planungsdaten
in dieses Repository.

## Herkunft

| Quellrepository                                                                                 | Übernommener Quellstand                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [SimonSchulte/ausbildungs-planer](https://github.com/SimonSchulte/ausbildungs-planer)           | `9a1110c4fd7d9ada8575b198d24fe6d90f3a1e85` |
| [SimonSchulte/personal-einsatz-planer](https://github.com/SimonSchulte/personal-einsatz-planer) | `b6eb36d09ca1994d284cc1084ce8e1be0c5fc67e` |

Die Git-Historien wurden bewusst nicht importiert. Die ursprüngliche PEP-Fachspezifikation
bleibt im [Quellstand von spec.md](https://github.com/SimonSchulte/personal-einsatz-planer/blob/b6eb36d09ca1994d284cc1084ce8e1be0c5fc67e/spec.md)
nachlesbar. Beide Altrepositorys erst nach erfolgreicher Produktionsabnahme archivieren;
dies wurde noch nicht durchgeführt. Neue Änderungen folgen den
[Repository-Konventionen](CLAUDE.md).
