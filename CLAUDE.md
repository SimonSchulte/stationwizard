# Konventionen für stationwizard

Dieses Repository führt Ausbildungsplanung und Personaleinsatzplanung in einer Angular-App
zusammen. Vor Änderungen [README](README.md), [Arbeitsstand](docs/arbeitsstand.md) und bei
Infrastrukturänderungen [Einrichtung](docs/einrichtung.md) sowie
[Worker-README](worker/README.md) lesen. Der Arbeitsstand benennt tatsächlich ausgeführte
Prüfungen und offene Abnahmegrenzen.

## Architektur und Sprache

- Neue Domänenbegriffe, Methoden, Felder und Hilfsfunktionen deutsch benennen:
  `termin`, `laden`, `zuBacklog`, `einsatzkraft`. Angular-/Browser-APIs und externe
  Schnittstellenfelder behalten ihre Namen. Bestehende englische PEP-Namen nicht ohne
  fachlichen Anlass pauschal umbenennen.
- Angular 21: standalone, `ChangeDetectionStrategy.OnPush`, zoneless. Sichtbaren Zustand
  mit `signal()` und `computed()` führen. Keine neuen `NgModule`, kein `zone.js`.
- Komponentennamen ohne `Component`-Suffix. Templates und LESS getrennt in `<name>.html`
  und `<name>.less`; keine großen Inline-Templates oder Inline-Styles.
- Strict TypeScript und `strictTemplates` erhalten, einschließlich
  `noPropertyAccessFromIndexSignature`. Unbekannte externe Daten prüfen, bevor sie in
  Domänenmodelle gelangen; Prüfungen nicht durch `any` oder ungeprüfte Casts umgehen.
- Ausbildungsfachlogik bleibt unter `src/app/ausbildung/`, Einsatzfachlogik unter
  `src/app/einsatz/`. Gemeinsame Aufgaben gehören unter `src/app/kern/`; keine künstliche
  Vereinheitlichung inkompatibler Fachmodelle.
- Gemeinsame Verträge stehen in `kern/storage/datei-storage.ts`: `DateiStorage`,
  `DateiInhalt`, `StorageFaehigkeiten`, `StorageArt`, `StorageFehler` und
  `dateiHerunterladen()`. Fachliche Adapter darauf aufbauen.
- Datums-/Kalenderhilfen unter `kern/kalender/` bevorzugen. Lokale Kalendertage nicht
  unbemerkt durch UTC-Konvertierung verschieben. Wochenraster und Feiertagsrückfallebene
  erhalten.

## Darstellung

- Ein Material-Theme in `src/theme.scss`. Gemeinsame Design-Tokens liegen in
  `src/styles.less`, unter anderem `--kat-*`, `--space-*`, `--surface-*` und Statusfarben.
- Farben und Abstände in Komponenten ausschließlich über zentrale CSS-Variablen
  verwenden. Fehlende Tokens zentral ergänzen; keine verstreuten Farb-/Abstandsliterale,
  Inline-Fallbackfarben oder zweiten Theme-Paletten einführen.
- PDF-Bibliotheken benötigen konkrete Werte statt CSS-Variablennamen. Diese Werte aus der
  dafür vorgesehenen zentralen Farbquelle beziehungsweise aus aufgelösten gemeinsamen
  Tokens beziehen, nicht eine zweite unabhängige Palette im Export pflegen.
- Gemeinsame Hinweis-/Bestätigungsdialoge über `kern/dialog/dialog-dienst.ts` und
  `DialogDienst` verwenden; `VerlassenSchutz` für ungesicherte Änderungen erhalten.
  Gemeinsame Leerzustands- und Ladegestaltung verwenden. Fachliche Labels bleiben
  deutsch. Umsetzungshinweise gehören in die Dokumentation, sofern sie keine
  Nutzerentscheidung unterstützen.
- Ausbildungs-`mobilAnsicht` und die untere Navigation bei kleinen Displays erhalten.
  Breites Wochenraster kontrolliert horizontal scrollen lassen. PEP bleibt bei
  komplexen Zuordnungen auf Desktopbedienung ausgerichtet; mobile Grenzen ehrlich benennen.
- UI-Änderungen real im Browser auf Desktop und Mobil prüfen. Ein blockierter Browserlauf
  ist keine bestandene Sichtprüfung.

## Dateiformate und Fachverträge

- Excel bleibt das führende Ausbildungsformat. Blätter **Jahresplan**, **Offene Ideen**
  und **KatS-A-Plan** sowie bestehende Excel-Zuordnungen erhalten. Kein paralleles
  Ausbildungs-JSON einführen. `@e965/xlsx` dynamisch importieren.
- PEP bleibt eine einzelne versionierte Datei mit `version`, `meta`, `planung`.
  `einsatz/services/pep-datei.ts` für Lesen/Serialisieren nutzen. Versionswarnungen
  erhalten; keine stillen, verlustreichen Konvertierungen.
- Nextcloud-Einsatzpläne liegen als `<UUID>.pep.json` im gesonderten freigegebenen Ordner.
  Die Listen-API liefert UUID/ETag; Inhalte nur bei bewusster Einzelladung abrufen.
- `TAKTISCH_ORDER` und `MEDIZINISCH_ORDER` in `einsatz/models/planung.model.ts` definieren
  die bestehenden Rangfolgen. Aktuell medizinisch:
  `EH, SSD, SanH, RH, RS, RA, NotSan, A, NA`. Die Auftragsliste mit zwölf Werten stimmt
  nicht mit dem Quellcode überein. Ohne fachliche Klärung weder Werte ergänzen noch die
  Reihenfolge verändern. `match.service.spec.ts` muss das Verhalten weiterhin absichern.
- Vorhandenes EFS-Mapping für `med_qual`, `fuehr_qual`, `bes_ausbild` und `fw_qual`
  übernehmen. Keine neu erfundene Qualifikationshierarchie und keine vermeintliche
  Vervollständigung ohne fachlichen Nachweis.
- Der übernommene Editor hat Helferpool und Postenbereich. Ein separater Inspektor war im
  Quellstand nicht vorhanden; ihn nicht als bereits übernommene Funktion dokumentieren.

## Worker und Zugangsschutz

- Alle geschützten Nextcloud-/EFS-/Benutzer-API-Aufrufe über `kern/worker-client.ts` und den
  `WorkerClient` führen. Der bestehende öffentliche Feiertagsabruf bleibt separat und
  erhält keine Upstream-Zugangsdaten; seine lokale Berechnungsrückfallebene bewahren.
  `Verbindungszustand` unterscheidet `ungeprueft`, `erreichbar`, `nicht-erreichbar` und
  `sitzung-abgelaufen`. Keine früheren Standalone-/API-Key-Modi wieder einführen.
- Nur relative `/api/*`-Pfade derselben Origin. `credentials: 'same-origin'`,
  `redirect: 'error'` und `X-Requested-With: XMLHttpRequest` erhalten. Der Client darf
  keine Upstream-URL, kein `apikey` und keine Nextcloud-Freigabedaten benötigen.
- `worker/src/index.ts` prüft die Anmeldung vor allen Assets und APIs.
  `run_worker_first = true` in `worker/wrangler.toml` muss erhalten bleiben.
  Unbekannte `/api/*`-Pfade liefern JSON/404, niemals die Angular-Startseite.
- Access-JWTs serverseitig in `worker/src/anmeldung.ts` verifizieren: öffentliche
  Team-JWKS, erlaubter Algorithmus, Issuer, Audience, Ablauf und erforderliche Claims.
  `ACCESS_TEAM_DOMAIN` ist eine vollständige HTTPS-Teamdomain ohne abschließenden Slash;
  `ACCESS_AUD` ist die Audience genau dieser Access-Anwendung.
- Fehlende Konfiguration oder nicht prüfbare Tokens sperren den Zugriff. Niemals einen
  Development-Auth-Bypass, ein festes Testtoken oder bloßes Vertrauen in den Header in
  Produktivcode einbauen. Isolierte Test-JWKS bleiben in Testcode.
- Access schützt mit **All traffic** Produktion, `workers.dev` und Vorschauen. Eine
  Google-Anmeldung allein ist keine Zugriffserlaubnis; die Richtlinie braucht die konkrete
  vereinbarte Zugriffsliste. Kein `Everyone` und kein stiller `Bypass`.
- `worker/src/zugangsdaten.ts` enthält `leseZugangsdatum()`: klassische Secret-Strings
  und Secrets-Store-Objekte mit asynchronem `get()` unterstützen. Bindingobjekte nie direkt
  als String vergleichen oder als Authorization-Wert einsetzen.
- Laufzeitvariablen und Build-Variablen sind getrennt. `keep_vars = true` betrifft Vars,
  keine Secrets, und steht in TOML vor allen Tabellen. Store-ID und Bindingnamen dürfen
  ins Repository; Secret-Werte niemals.
- Keine realen Personal-, Planungs-, Fahrzeug- oder Zugangsdaten in Repository, Fixtures,
  Screenshots, Logs oder Fehlertexte aufnehmen. Fachlich erforderliche Daten nicht in
  `localStorage` persistieren. API-Zugangsdaten bleiben vollständig im Worker.
- Keine unbereinigten Upstream-Fehler oder Auth-Header durchreichen. Fehler über
  `fehlerAntwort()` mit festen Codes und `X-Stationwizard-Diagnose`; keine Secretwerte,
  Secretlängen oder vollständigen Bindinglisten veröffentlichen.
- Ursprungsschutz, feste Pfade, Größen-/Zeitlimits und Redirect-Verbot erhalten.
  `GET /api/status` belegt nur die Erreichbarkeit des Workers, nicht von EFS/Nextcloud.

### Erlaubte API-Oberfläche

| Pfad                              | Methode   | Vertrag                           |
| --------------------------------- | --------- | --------------------------------- |
| `/api/status`                     | GET       | Worker-Status                     |
| `/api/benutzer`                   | GET       | Verifizierte E-Mail-Adresse       |
| `/api/efs/checkapikey`            | POST      | JSON `{}`                         |
| `/api/efs/getveranstaltungen`     | POST      | JSON `{}`                         |
| `/api/efs/getveranstaltung`       | POST      | JSON mit ausschließlich `id`      |
| `/api/nextcloud/arbeitsmappe`     | GET / PUT | Konfigurierte Excel-Dateifreigabe |
| `/api/nextcloud/planungen`        | GET       | Liste aus UUID und ETag           |
| `/api/nextcloud/planungen/<UUID>` | GET / PUT | Einzelne versionierte PEP-Datei   |

EFS verwendet ausschließlich die drei bekannten Aktionen. Der Worker ergänzt serverseitig
`apikey`, `version=2` und `action` als Formulardaten. Ziel aus
`HIORGSERVER_BASE_URL`, Token aus `HIORGSERVER_EFS_API_TOKEN`. Neue Aktionen benötigen
zuerst einen Nachweis durch die echte API und deren offizielle Dokumentation. Die
Nextcloud-Routen sind kein generischer WebDAV-Proxy; keine frei wählbaren Pfade oder
Löschmethoden ergänzen.

### Konflikte und unklare Speicherergebnisse

- Geladene Dateien mit starkem ETag und `If-Match` speichern. Neue Dateien ausschließlich
  mit `If-None-Match: *` anlegen. Keine unbedingten PUTs, kein `If-Match: *` als Ersatz
  für eine konkrete Dateiversion und keine Kombination beider Bedingungen.
- HTTP 412 bedeutet Konflikt: lokalen Stand erhalten, Kopie herunterladen lassen,
  aktuellen gespeicherten Stand bewusst laden und Änderungen zusammenführen.
- Timeout oder unklarer Upstream-Erfolg darf keinen automatischen ungeschützten
  Schreibwiederholungsversuch auslösen. Den Stand zuerst klären; lokale Änderungen nicht
  als gespeichert markieren oder verwerfen.
- Lokale Datei-/JSON-Exporte als Rettungsweg erhalten. Ordnerfreigabe und
  Arbeitsmappenfreigabe getrennt konfigurieren; keine PEP-Dateien in die Excel-Freigabe
  schreiben.

## Tests und Arbeitsweise

Node 24 und npm mindestens 11 verwenden. Abhängigkeiten über das gemeinsame Lockfile
installieren; keine getrennten Angular-/Material-Versionen und keine Karma-/Jasmine-Reste
wieder einführen. Prettier: `printWidth: 100`, `singleQuote: true`, Angular-Parser für HTML.

```bash
npx npm@11 ci
npm run build
npm test
npm run format:check
```

Angular-Tests laufen über `@angular/build:unit-test` mit Vitest, Worker-Tests über
`worker/vitest.config.ts`. Übernommene Abdeckung erhalten, insbesondere Matching,
Excel-Rundlauf, Planoperationen, Wochenraster, Datum und Feiertage. Neue Tests sichern
beobachtbares Verhalten und konkrete Risiken ab; keine Implementierung nur nacherzählen.
Testdaten im Test erzeugen, Excel-Struktur mit erfundenem Inhalt nachbilden.

Für Worker-/Routingänderungen zusätzlich gezielt prüfen:

```bash
npm run worker:check
npm run worker:test
npm run test:spa
npm run deploy:dry-run
```

`test:spa` benötigt den vorherigen Produktionsbuild. Es startet das echte Worker-Bundle
mit Static Assets und einer isolierten Test-JWKS in workerd. Die bisherige Umgebung hat
den Laufzeitstart mit `network approval was cancelled before a decision was returned`
abgebrochen. Dies dokumentieren; weder das Gate abschwächen noch Hash-Routing entfernen,
solange dieser Test und die Browserprüfung der Direkteinstiege nicht erfolgreich sind.

Arbeitspakete in nachvollziehbaren AP-Branches und eigenständig prüfbaren Pull Requests
umsetzen. Jeder PR braucht erfolgreichen Build, Tests und Formatprüfung. Ein beschreibbarer
Fork genügt für Pull Requests an das Original; Schreibrechte am Original sind dafür nicht
nötig. Ohne erfolgreichen Upload und bestätigte PR-Erstellung lokale Commits als lokale
Commits bezeichnen; keine Veröffentlichung behaupten. Tests mit echten Nextcloud-/HiOrg-Daten
und produktiven Google-Sitzungen nur als geprüft melden, wenn sie tatsächlich ausgeführt wurden.

Infrastrukturänderungen erst mit bestätigtem Hostnamen, DNS-/Mail-Bestand und vereinbarter
Google-Zugriffsliste ausführen. Altrepositorys und alten Worker erst nach erfolgreicher
Abnahme stilllegen. DNS-/Mail-Daten oder fremde Services nicht für eine vermeintlich
einfachere Einrichtung überschreiben.
