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
- `worker/src/index.ts` prüft die Anmeldung vor allen Assets und APIs, mit genau einer
  Ausnahme: den drei festen Pfadmustern der öffentlichen Kilometermeldung (`/e/<TOKEN>`,
  `/oeffentlich/<datei>`, `/api/oeffentlich/meldung/<TOKEN>`, siehe unten).
  `run_worker_first = true` in `worker/wrangler.toml` muss erhalten bleiben.
  Unbekannte `/api/*`-Pfade liefern JSON/404, niemals die Angular-Startseite.
- Access-JWTs serverseitig in `worker/src/anmeldung.ts` verifizieren: öffentliche
  Team-JWKS, erlaubter Algorithmus, Issuer, Audience, Ablauf und erforderliche Claims.
  `ACCESS_TEAM_DOMAIN` ist eine vollständige HTTPS-Teamdomain ohne abschließenden Slash;
  `ACCESS_AUD` ist die Audience genau dieser Access-Anwendung.
- Fehlende Konfiguration oder nicht prüfbare Tokens sperren den Zugriff. Niemals einen
  Development-Auth-Bypass, ein festes Testtoken oder bloßes Vertrauen in den Header in
  Produktivcode einbauen. Isolierte Test-JWKS bleiben in Testcode. Die öffentliche
  Kilometermeldung ist keins von dreien: ein dauerhafter, fachlich beauftragter Pfad mit
  einem eigenen Geheimnis je Fahrzeug, der keiner Identität glaubt und dessen Eingabe erst
  durch die Freigabe einer geprüften Identität wirksam wird.
- Access schützt mit **All traffic** Produktion, `workers.dev` und Vorschauen. Eine
  Google-Anmeldung allein ist keine Zugriffserlaubnis; die Richtlinie braucht die konkrete
  vereinbarte Zugriffsliste. Kein `Everyone` und kein **stiller** `Bypass`. Es gibt genau
  eine benannte Bypass-Anwendung, ausschließlich für die drei Pfadmuster der öffentlichen
  Kilometermeldung und ausschließlich auf der produktiven Domain – nicht auf `workers.dev`
  und nicht auf Vorschau-URLs. Sie ist in `docs/einrichtung.md` vollständig beschrieben.
  Der Worker prüft dieselben Muster unabhängig davon noch einmal selbst: eine zu weit
  gefasste Access-Regel macht die Anwendung deshalb trotzdem nicht öffentlich.
- `worker/src/zugangsdaten.ts` enthält `leseZugangsdatum()`: klassische Secret-Strings
  und Secrets-Store-Objekte mit asynchronem `get()` unterstützen. Bindingobjekte nie direkt
  als String vergleichen oder als Authorization-Wert einsetzen.
- Laufzeitvariablen und Build-Variablen sind getrennt. `keep_vars = true` betrifft Vars,
  keine Secrets, und steht in TOML vor allen Tabellen. Store-ID und Bindingnamen dürfen
  ins Repository; Secret-Werte niemals.
- Keine realen Personal-, Planungs-, Fahrzeug- oder Zugangsdaten in Repository, Fixtures,
  Screenshots, Logs oder Fehlertexte aufnehmen. Fachlich erforderliche Daten nicht in
  `localStorage` persistieren. API-Zugangsdaten bleiben vollständig im Worker.
  Genau eine aufgezählte Ausnahme von der `localStorage`-Regel: der Schlüssel
  `stationwizard.erfassung.name` auf der öffentlichen Meldeseite
  (`oeffentlich/src/app/gemerkter-name.ts`). Gespeichert wird ausschließlich eine
  Selbstauskunft des Geräteinhabers über sich selbst, keine Fachdaten – die führende
  Fassung jeder Meldung liegt in D1. Die Seite liegt außerhalb der Angular-App, jeder
  Zugriff ist gekapselt, und ein sichtbarer Knopf löscht den Namen. Die allgemeine Regel
  bleibt unverändert; weitere Ausnahmen werden hier aufgezählt oder es gibt sie nicht.
- Keine unbereinigten Upstream-Fehler oder Auth-Header durchreichen. Fehler über
  `fehlerAntwort()` mit festen Codes und `X-Stationwizard-Diagnose`; keine Secretwerte,
  Secretlängen oder vollständigen Bindinglisten veröffentlichen.
- Ursprungsschutz, feste Pfade, Größen-/Zeitlimits und Redirect-Verbot erhalten.
  `GET /api/status` belegt nur die Erreichbarkeit des Workers, nicht von EFS/Nextcloud.
- `worker/src/profilbild.ts` kapselt den einzigen Aufruf, der das Google-Profilbild aus
  der Anmeldung holt: ein serverseitiger Abruf von `/cdn-cgi/access/get-identity` auf der
  **eigenen Anwendungs-Domain** (`new URL(anfrage.url).origin`, nicht die Team-Domain) mit
  dem bereits geprüften Access-JWT als `CF_Authorization`-Cookie. Ein Test gegen die
  Team-Domain per Browser lieferte das Bild, derselbe serverseitige Aufruf mit dem
  app-gebundenen JWT gegen die Team-Domain aber nicht (siehe Betreiberlogs
  `PROFILBILD_FELD_FEHLT ... oidc_fields=kein Objekt`) – erst der Wechsel auf die eigene
  Anwendungs-Domain (derselbe Audience-Kontext, in dem das JWT ausgestellt wurde) lieferte
  es zuverlässig. Das Bild steckt dort unter `oidc_fields.picture` (per
  Cloudflare-Zero-Trust-IdP-Testfunktion und echtem Produktivabruf bestätigt, kein
  top-level `picture`). `oidc_fields` ist dabei kein von Cloudflare offiziell
  dokumentierter fester Vertrag, sondern eine von Google durchgereichte IdP-Zusatzangabe.
  Der Endpunkt bleibt deshalb strikt best-effort: nicht erreichbar, kein
  `oidc_fields.picture`-Feld oder keine gültige `https`-URL liefert immer
  `{ "profilbildUrl": null }`, nie einen Fehlerstatus – ein fehlendes Bild darf die
  Anmeldung nie blockieren oder verzögern. Das Frontend (`Benutzerkontext`) kennt nur
  `profilbildUrl`, nicht den Umweg über Access; die Initialen bleiben der Rückfall.

### Erlaubte API-Oberfläche

| Pfad                                            | Methode            | Vertrag                                                                            |
| ----------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `/api/status`                                   | GET                | Worker-Status                                                                      |
| `/api/benutzer`                                 | GET                | Verifizierte E-Mail-Adresse                                                        |
| `/api/benutzer/profilbild`                      | GET                | Best-effort Google-Profilbild-URL oder `null`, siehe unten                         |
| `/api/efs/checkapikey`                          | POST               | JSON `{}`                                                                          |
| `/api/efs/getveranstaltungen`                   | POST               | JSON `{}`                                                                          |
| `/api/efs/getveranstaltung`                     | POST               | JSON mit ausschließlich `id`                                                       |
| `/api/nextcloud/arbeitsmappe`                   | GET / PUT          | Konfigurierte Excel-Dateifreigabe                                                  |
| `/api/nextcloud/planungen`                      | GET                | Liste aus UUID und ETag                                                            |
| `/api/nextcloud/planungen/<UUID>`               | GET / PUT          | Einzelne versionierte PEP-Datei                                                    |
| `/api/hiorg/kalender`                           | GET                | HiOrg-Kalenderfeed, nur lesend                                                     |
| `/api/fahrzeuge`                                | GET / POST         | Fahrzeugliste; Neuanlage nur mit `If-None-Match: *`, Kennzeichen eindeutig         |
| `/api/fahrzeuge/<UUID>`                         | GET / PUT          | Einzelnes Fahrzeug; Update nur mit `If-Match`, Kennzeichen eindeutig               |
| `/api/fahrzeuge/<UUID>/ablesungen`              | GET / POST         | Kilometerablesungen; kein Update, nur Anhängen                                     |
| `/api/fahrzeuge/<UUID>/ablesungen/<UUID>`       | DELETE             | Einzelne Ablesung löschen; gesperrt, solange eine Korrektur darauf verweist        |
| `/api/fahrzeuge/<UUID>/aenderungen`             | GET                | Änderungsprotokoll, neueste zuerst; nur lesend, kein Client-Schreibzugriff         |
| `/api/fahrzeuge/km-bericht`                     | GET                | Kilometerstandsbericht über alle Fahrzeuge; Vorschau und Übersicht                 |
| `/api/fahrzeuge/km-bericht/senden`              | POST               | Versendet denselben Bericht an die gespeicherte Adresse; kein Empfängerfeld        |
| `/api/benutzerverwaltung`                       | GET                | Liste aller bereits geprüft angemeldeten Personen samt Rolle                       |
| `/api/benutzerverwaltung/<E-Mail>`              | PUT                | Setzt Hauptrolle und Sonderrollen vollständig; 404 ohne vorherige Anmeldung        |
| `/api/systemkonfiguration`                      | GET / PUT          | Betriebseinstellungen aus fester Schlüsselliste; niemals Zugangsdaten              |
| `/api/angebotswesen/preiskatalog`               | GET / POST         | Preiskatalog-Liste (mit Version je Zeile); Neuanlage nur mit `If-None-Match: *`    |
| `/api/angebotswesen/preiskatalog/<UUID>`        | PUT / DELETE       | Einzelner Eintrag; Update nur mit `If-Match`                                       |
| `/api/angebotswesen/angebote`                   | GET / POST         | Angebotsliste (vollständig, inkl. Schichten); Neuanlage nur mit `If-None-Match: *` |
| `/api/angebotswesen/angebote/<UUID>`            | GET / PUT / DELETE | Einzelnes Angebot; Update nur mit `If-Match`                                       |
| `/f/<UUID>`, `/f/<UUID>/km`                     | GET                | QR-Kurzlink, leitet auf die aktuelle Hash-Route weiter                             |
| `/api/fahrzeuge/erfassungslinks`                | GET                | Öffentliche Erfassungstoken, auf die eigenen Freigabegruppen begrenzt              |
| `/api/fahrzeuge/<UUID>/erfassungslink`          | GET / POST         | Token lesen; POST erneuert es und macht gedruckte Aufkleber ungültig               |
| `/e/<TOKEN>`                                    | GET                | **Ohne Anmeldung.** Öffentliche Meldeseite, siehe unten                            |
| `/oeffentlich/<datei>`                          | GET                | **Ohne Anmeldung.** Nur die drei Dateien des zweiten Build-Ziels                   |
| `/api/oeffentlich/meldung/<TOKEN>`              | GET / POST         | **Ohne Anmeldung.** Fahrzeugangaben lesen bzw. Meldung einreichen                  |
| `/api/fahrzeuge/einreichungen`                  | GET                | Offene Meldungen, serverseitig auf die eigenen Freigabegruppen gefiltert           |
| `/api/fahrzeuge/einreichungen/<UUID>/freigabe`  | POST               | Erzeugt daraus die echte Ablesung; nur Zugführung oder Gruppenführung              |
| `/api/fahrzeuge/einreichungen/<UUID>/ablehnung` | POST               | Verwirft die Meldung mit Grund; dieselbe Rollenprüfung                             |

Das Fahrzeugmodul (`src/app/fahrzeuge/`, `worker/src/fahrzeuge.ts`) hält Domäne und
Persistenz strikt getrennt und liegt hinter Cloudflare D1 (`FAHRZEUGE_DB`, Schema in
`worker/migrations/`); siehe `docs/konzept-fahrzeuge.md` für Konzept und Begründung.
`erfasstVon`/`erfasstAm` einer Ablesung setzt ausschließlich der Worker aus der geprüften
Anmeldung, nie der Anfragekörper. Löschen einer Ablesung steht mangels Rollenmodell aktuell
jeder geprüften Identität offen (siehe „Rechte vorerst alle, Rollen später",
`docs/konzept-fahrzeuge.md` Abschnitt 8); eine spätere Admin-Rolle soll dies einschränken.
Jede Anlage, Stammdaten-/Wartungsänderung sowie Kilometererfassung/-löschung erzeugt
serverseitig einen Eintrag im Änderungsprotokoll (`fahrzeug_aenderungen`); die Beschreibung
entsteht aus dem tatsächlichen Unterschied zum vorherigen Stand, nie aus einer
Client-Eingabe (siehe `docs/konzept-fahrzeuge.md`, Abschnitt „Änderungsprotokoll").

Die Benutzerverwaltung (`src/app/benutzerverwaltung/`, `worker/src/benutzer.ts`) ist keine
Nutzerverwaltung im Sinne von Anlegen/Löschen von Zugängen und kein Zugriffsschutz: wer
sich überhaupt anmelden darf, entscheidet ausschließlich die Cloudflare-Access-Zugriffsliste
außerhalb dieser App. Die eigene D1-Datenbank (`BENUTZER_DB`, Schema in
`worker/migrations/0004_benutzer.sql`) merkt nur vor, wer sich bereits mindestens einmal
geprüft angemeldet hat (bei jedem `GET /api/benutzer`), und ordnet optional eine
Hauptrolle aus `zugfuehrung`, `gruppenfuehrung-sanitaet`, `gruppenfuehrung-betreuung`,
`gruppenfuehrung-tesi`, `gruppenfuehrung-verpflegung`, `gruppenfuehrung-fuehrung`,
`helfer` zu. Unabhängig davon kombinierbare Sonderrollen (`sonderrollen`, aktuell
`verwaltungshelfer` für den Verwaltungsbereich und `sanitaetsdienste` für die
Einsatzplanung/PEP) stehen als JSON-Array, damit künftige weitere Sonderrollen ohne
Schemaänderung dazukommen können. Die Hauptrolle `zugfuehrung` schließt beide Sonderrollen
ein, unabhängig davon, ob sie zusätzlich gesetzt sind – eine künftige Berechtigungsprüfung
muss `rolle === 'zugfuehrung' || sonderrollen.includes(...)` prüfen, nicht nur
`sonderrollen.includes(...)`. Rollenvergabe ist vorerst jeder geprüften Identität möglich –
dieselbe Übergangslösung wie beim Löschen einer Ablesung (siehe „Rechte vorerst alle, Rollen
später", `docs/konzept-fahrzeuge.md` Abschnitt 8); eine spätere Admin-Rolle soll dies
einschränken. Eine tatsächliche serverseitige Durchsetzung dieser Sonderrollen auf den
Verwaltungs- und Einsatzplanungs-Endpunkten steht noch aus (siehe Arbeitsstand).

Die Systemkonfiguration (`src/app/systemkonfiguration/`, `worker/src/systemkonfiguration.ts`)
hält Betriebseinstellungen, die zur Laufzeit in der Oberfläche gesetzt werden. Die Tabelle
`systemkonfiguration` (in `BENUTZER_DB`, Schema in
`worker/migrations/0005_systemkonfiguration.sql`) ist ein Schlüssel-Wert-Speicher, der
Vertrag ist es nicht: welche Schlüssel existieren und welche Werte gelten, steht
ausschließlich in `EINSTELLUNGEN` in `systemkonfiguration.ts`; ein unbekannter Schlüssel
wird abgelehnt, nie gespeichert. Dort stehen **keine Zugangsdaten** – alles in dieser
Tabelle ist über die API lesbar. Absenderadresse (`MAIL_ABSENDER`), Anzeigename
(`MAIL_ABSENDER_NAME`, gewöhnliche Laufzeitvariable) und API-Token (`MAIL_API_TOKEN`)
bleiben am Worker. `GET` meldet je bekanntem Versandweg nur ein Ja/Nein zur Verfügbarkeit,
nie eine Bindingliste. Rollenvergabe fehlt auch hier – dieselbe Übergangslösung „Rechte
vorerst alle, Rollen später".

Das Angebotswesen (`src/app/angebotswesen/`, `worker/src/angebotswesen.ts`) hält einen
Preiskatalog und darauf aufbauende Angebote für Kostenkalkulationen von Sanitätsdiensten.
Eigene D1-Datenbank `ANGEBOTSWESEN_DB`, Schema in `worker/migrations/0008_angebotswesen.sql`,
zwei unabhängig versionierte Tabellen: `preiskatalog_eintraege` und `angebote`. Der
Preiskatalog ist – anders als die Systemkonfiguration oben – keine feste Schlüsselliste,
sondern eine frei erweiterbare Liste (Einträge anlegen/umbenennen/löschen), weil die
Preiskategorien fachlich nicht abschließend feststehen; er ist deshalb Fahrzeuge-artig
strukturiert (eigene D1-Tabelle, Version je Zeile), nicht Systemkonfiguration-artig. Jeder
Eintrag hat eine `art` (`einsatzkraft` – Stundensatz – oder `fahrzeug` – Pauschale je
Schicht/Tag) und einen `einzelpreisCent` (Integer-Cent, nie Fließkomma-Euro, um
Rundungsdrift bei vielen Positionen zu vermeiden). Ein Angebot besteht aus mehreren
Schichten (je ein Kalendertag mit `von`/`bis`; ein Dienst über Mitternacht wird als zwei
Schichten erfasst) mit je mehreren Positionen; jede Position trägt eine **eigene,
editierbare Momentaufnahme** von Bezeichnung und Preis (`herkunftEintragId` verweist nur
zur Nachverfolgung auf den Preiskatalogeintrag) – eine Anpassung bei einer Kalkulation wirkt
nie auf den Preiskatalog zurück, und ein späteres Löschen eines Katalogeintrags kann kein
gespeichertes Angebot beschädigen. Ein optionaler Pauschalpreis
(`pauschalpreisAktiv`/`pauschalpreisCent`) ersetzt ausschließlich die Gesamtsumme des
kompletten Angebots, nie einzelner Schichten; die Einzelpositionen bleiben dabei immer
berechnet und sichtbar, auch in der als Word-Tabelle kopierbaren Kostenaufstellung
(`src/app/angebotswesen/services/tabellen-zwischenablage.ts`, asynchrone Clipboard-API mit
`text/html`- und `text/plain`-Eintrag, da Angular CDKs `Clipboard.copy()` nur Klartext
unterstützt). Rollenvergabe fehlt auch hier – dieselbe Übergangslösung „Rechte vorerst alle,
Rollen später" wie ursprünglich bei Fahrzeugen/Benutzerverwaltung/Systemkonfiguration.

Der Mailversand (`worker/src/mail-versand.ts`) ist ein Vertrag mit zwei Adaptern:
`email-routing` über das `send_email`-Binding (in `wrangler.toml` bewusst auskommentiert,
weil es eine bestätigte Zieladresse in Cloudflare Email Routing voraussetzt) und `resend`
über einen **festen** HTTPS-Endpunkt. Keine konfigurierbare Ziel-URL – eine frei setzbare
Adresse wäre ein Weiterleitungspunkt für das Token. SMTP ist in Workers nicht möglich.
Upstream-Antworten werden nie weitergereicht: nur feste Codes, im Log nur Status
beziehungsweise Fehlername. Ein weiterer Anbieter ist ein weiterer Adapter, keine Änderung
an den Aufrufern.

Jede Fehlerursache hat einen **eigenen** festen Code, weil die Oberfläche vom
`WorkerClient` nur Status und `X-Stationwizard-Diagnose` zu sehen bekommt und den
Meldungstext des Workers verwirft — ohne eigenen Code wäre ein abgelaufenes Token ohne
Zugriff auf die Worker-Logs nicht von einem Netzwerkausfall zu unterscheiden:
`MAIL_VERSANDWEG_NICHT_EINGERICHTET` (503), `MAIL_VERSAND_ZEITLIMIT` (504),
`MAIL_VERSAND_NICHT_ERREICHBAR`, `MAIL_VERSAND_UMLEITUNG`,
`MAIL_VERSAND_ZUGANG_ABGELEHNT`, `MAIL_VERSAND_ABGELEHNT` und
`MAIL_VERSAND_FEHLGESCHLAGEN` (je 502, letzterer für Wege ohne HTTP-Antwort wie
`email-routing`). Die Zuordnung steht in `VERSANDFEHLER_ANTWORTEN` in `km-bericht.ts`.
Der Resend-Weg folgt demselben Muster wie EFS und Nextcloud: eigener `AbortController`
statt `AbortSignal.timeout()` (nur so ist ein Zeitlimit von einem Verbindungsfehler zu
unterscheiden) und `redirect: 'manual'` mit `istUmleitung()` statt `redirect: 'error'` —
einer Weiterleitung wird weiterhin nicht gefolgt, sie ist aber keine ununterscheidbare
Transportstörung mehr. Ein Token, das nicht aus sichtbaren ASCII-Zeichen besteht, gilt als
Konfigurationsfehler und nicht als Anbieterproblem: es ließe `fetch()` schon beim Bauen der
Anfrage scheitern.

Der Kilometerstandsbericht (`worker/src/km-bericht.ts`) ist Fahrzeugfachlichkeit und liegt
deshalb neben `fahrzeuge.ts`; die Systemkonfiguration sagt nur, wohin er geht. Er ist
zugleich die einzige Quelle der Kilometerbilanzen im Fuhrpark-Dashboard: ein Aufruf für den
gesamten Fuhrpark statt einer Ablesungshistorie je Fahrzeug. Die Übersicht rechnet nichts
nach und lädt keine Ablesungen je Fahrzeug nach; `BerichtZeile.id` trägt dafür die
Fahrzeug-UUID. Er bildet
die Kennzahlen aus `src/app/fahrzeuge/services/kilometer-soll.ts` serverseitig nach
(Jahressoll, Jahresstartstand, „unvollständig"), damit Mail und Vorschau dieselben Zahlen
zeigen. Beide Fassungen sind gemeinsam zu ändern; `worker/tests/km-bericht.spec.ts`
spiegelt die Fälle der dortigen Tests. Der Stichtag ist ein Berliner Kalendertag, nie über
UTC gerechnet. Es gibt bewusst keinen Zeitplan und keinen Cron-Trigger: der Versand wird
ausschließlich von Hand in der Systemkonfiguration ausgelöst.

Die öffentliche Kilometermeldung (`oeffentlich/`, `worker/src/oeffentliche-erfassung.ts`)
ist der einzige Weg am Zugangsschutz vorbei. Sie kehrt die frühere Entscheidung „kein Token
im Code" bewusst um (siehe `docs/konzept-fahrzeuge.md`, Abschnitt 4 und 10): der öffentliche
QR-Code trägt ein unerratbares Zufallstoken je Fahrzeug, weil es ohne Access-Sitzung das
einzige Zugangsmerkmal ist. Für `/f/<UUID>` und `/f/<UUID>/km` gilt „kein Token" unverändert
weiter. Das Token (`erfassung_token`, Migration 0007) ist ein Geheimnis: es steht nie in
einer Fahrzeugantwort, nie in einem Log, nie in einem Fehlertext und nie im
Änderungsprotokoll; auslesbar ist es allein über die Erfassungslink-Endpunkte. Erneuern
macht alle gedruckten Aufkleber dieses Fahrzeugs ungültig — es gibt bewusst keine
Übergangsfrist mit zwei gültigen Token.

Die öffentliche Seite ist ein **zweites, sehr kleines Angular-Build-Ziel** (`angular.json`,
Projekt `oeffentlich`, `outputHashing: none`, ausgeliefert unter `/oeffentlich/`). Die
App-Hülle bleibt damit vollständig hinter Access; ein Bypass für die Hauptanwendung wäre
„alles außer `/api/*`" gewesen. Der Worker liefert unter `/oeffentlich/` nur eine **feste
Erlaubnisliste** aus und verwirft eine HTML-Antwort auf eine `.js`/`.css`-Anfrage, damit die
SPA-Rückfallebene niemals die geschützte Hülle nach außen gibt; `npm run test:spa` prüft die
Liste gegen das echte Build-Ergebnis. Kein Router und kein Link führt von dort in die App.
`inlineCritical` ist abgeschaltet, damit die Seite ohne `unsafe-inline` auskommt.

Die Seite gibt nur Bezeichnung, Funkrufname und Kennzeichen preis — keine UUID, keinen
Kilometerstand, keinen Verlauf, keine E-Mail-Adresse. Der letzte Stand fehlt bewusst: er
würde die Fahrzeugnutzung offenlegen und erlauben, die eigene Zahl passend zu wählen. Ein
Datumsfeld gibt es ebenfalls nicht; `abgelesen_am` setzt der Worker als Berliner
Kalendertag (`worker/src/kalender.ts`). Unbekanntes Token, formal ungültiges Token und
gelöschtes Fahrzeug beantwortet der Worker byteweise gleich (404
`MELDUNG_UNBEKANNT`) — kein Orakel. Weder Access noch die Ursprungsprüfung aus `index.ts`
laufen hier vor, beides erbringt das Modul selbst; die Mengenbremsen sind bewusst
fahrzeugbezogen und nicht IP-bezogen, weil eine IP-Speicherung eine neue personenbezogene
Verarbeitung ohne fachlichen Auftrag wäre.

Eine Meldung wird nie von selbst ein Kilometerstand. Sie liegt in
`ablesung_einreichungen` und wird erst durch eine Freigabe zur Ablesung. Deshalb liegt sie
in einer eigenen Tabelle und nicht mit einem Statusfeld in `ablesungen`: dort steht
ausschließlich, was als echter Stand gilt, und jede Kennzahl liest diese Tabelle
vollständig. Nach der Freigabe steht in `erfasst_von` die geprüfte E-Mail der
**freigebenden** Person — die Zusage „`erfasstVon` ist immer eine geprüfte Identität" bleibt
unangetastet —, der selbst angegebene Name daneben in `gemeldet_von_name`. Die `quelle`
`oeffentlich` entsteht ausschließlich intern bei der Freigabe und ist über
`POST /api/fahrzeuge/<UUID>/ablesungen` **nicht** einreichbar; sonst könnte jede angemeldete
Person eine Freigabe fingieren.

`worker/src/rollen.ts` ist die erste tatsächlich serverseitig durchgesetzte Rollenprüfung
des Projekts: freigeben darf `zugfuehrung` (alle Gruppen) oder `gruppenfuehrung-<gruppe>`
genau der Fahrzeuggruppe; `gruppenfuehrung-verpflegung` nie, weil dafür keine Fahrzeuge
vorgesehen sind. Rollen liegen in `BENUTZER_DB`, Fahrzeuge in `FAHRZEUGE_DB` — zwei
getrennte Datenbanken, also zwei Abfragen und der Vergleich in TypeScript. Fehlende
Konfiguration sperrt. Diese Prüfung ist allerdings nur so stark wie die Rollenvergabe, und
`PUT /api/benutzerverwaltung/<E-Mail>` steht weiterhin jeder geprüften Identität offen: wer
sich selbst `zugfuehrung` setzt, darf anschließend freigeben. Das ist die auffälligste
verbleibende Lücke und der nächste fällige Schritt, kein Grund, die Prüfung zu unterlassen.
Für alles andere — Rollenvergabe, Systemkonfiguration, Löschen einer Ablesung,
Verwaltungsbereich — gilt weiterhin „Rechte vorerst alle, Rollen später".

Der Verwaltungsbereich (`src/app/verwaltung/`, Route `/verwaltung`) hält nur den Einstieg in
administrative Aufgaben; die Fachlogik bleibt beim jeweiligen Fachmodul. Er kennt kein
Rollenmodell und ist kein Zugriffsschutz — das nicht anders dokumentieren. Der
CSV-Stammdatenimport (`src/app/fahrzeuge/services/fahrzeug-import.ts`, Seite unter
`src/app/fahrzeuge/pages/fahrzeug-import/`, CSV-Leser in `src/app/kern/text/csv.ts`) legt
Fahrzeuge ausschließlich über den bestehenden `POST /api/fahrzeuge` mit `If-None-Match: *`
an; keinen Massenschreibpfad und keinen Importendpunkt ergänzen. Pflichtspalten sind
`bezeichnung` und `kennzeichen`, als Prüftermin wird nur die HU übernommen.

Jedes Kennzeichen darf es nur einmal geben. Verbindlich ist der partielle eindeutige Index
aus `worker/migrations/0003_kennzeichen_eindeutig.sql` auf einer Vergleichsform
(Großschreibung ohne Leerzeichen, Bindestriche, Punkte); ein leeres Kennzeichen bleibt
mehrfach erlaubt. Der Worker prüft vorab und antwortet mit
`409 / FAHRZEUG_KENNZEICHEN_VERGEBEN`, übersetzt aber auch eine Indexverletzung aus einem
Rennen in dieselbe Antwort — die Vorabprüfung nicht als alleinigen Schutz behandeln. Die
Vergleichsform steht an drei Stellen und wird nur gemeinsam geändert: Migration,
`kennzeichenVergeben()` in `worker/src/fahrzeuge.ts` und
`src/app/fahrzeuge/services/kennzeichen.ts`. `InMemoryFahrzeugStorage` und
`FakeFahrzeugeDb` bilden die Regel nach; das so erhalten. Die Fachschicht sieht
`KennzeichenVergebenFehler`, nicht `FahrzeugKonfliktFehler` — erneutes Laden hilft hier
nicht (siehe `docs/konzept-fahrzeuge.md`, Abschnitt „Verwaltungsbereich und
Stammdatenimport").

EFS verwendet ausschließlich die drei bekannten Aktionen. Der Worker ergänzt serverseitig
`apikey`, `version=2` und `action` als Formulardaten. Ziel aus
`HIORGSERVER_BASE_URL`, Token aus `HIORGSERVER_EFS_API_TOKEN`. Neue Aktionen benötigen
zuerst einen Nachweis durch die echte API und deren offizielle Dokumentation. Die
Nextcloud-Routen sind kein generischer WebDAV-Proxy; keine frei wählbaren Pfade oder
Löschmethoden ergänzen.

Beim HiOrg-Kalenderfeed ist die vollständige URL aus `HIORGSERVER_CALENDER_FEED` selbst
das Zugangsdatum: die Anmeldedaten stehen als Query-Parameter darin. Sie bleibt vollständig
im Worker, wird in Fehlern und Logs redigiert und darf weder als Anfrageparameter wählbar
noch aus dem Client heraus setzbar sein. `pruefeFeedZugang()` nimmt beide Formen an: die
vollständige Freigabe-URL (führend, an HTTPS und `hiorg-server.de` gebunden; der Worker
ersetzt darin nur `monate`) und ersatzweise den reinen `lab`-Tokenwert, aus dem der Worker
die Adresse aus `FEED_URL_BASIS`/`FESTE_FEED_PARAMETER` selbst baut. Diese feste
Parameterliste ist nur aus einer einzelnen Freigabe abgeleitet und nicht durch die
HiOrg-Dokumentation belegt – sie nicht als nachgewiesenen Vertrag behandeln und die
vollständige URL nicht erneut als Konfigurationsweg entfernen. Der Feed ist reine Anzeige-
und Abgleichquelle; er wird nicht in die Excel-Mappe geschrieben und nicht im Browser
persistiert. Die Schreibweise „CALENDER" ist bewusst übernommen und wird nicht korrigiert.

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

## Sparsamkeit im Free-Tier

Der Betrieb läuft auf dem kostenlosen Cloudflare-Tarif: jede Worker-Anfrage – wegen
`run_worker_first = true` auch jede Asset-Anfrage – und jede D1-Schreibung zählt gegen ein
Tageskontingent. Neue Oberflächen deshalb nicht mit einem Abruf je Listeneintrag bauen,
sondern mit einem Aufruf über den ganzen Bestand; wo es einen solchen Endpunkt schon gibt,
diesen verwenden statt einen zweiten Weg zu erfinden. Wiederholte lesende Abrufe über
`kern/abruf-puffer.ts` bündeln und nach jedem eigenen Schreibzugriff verwerfen; versionierte
Einzelabrufe (ETag für ein späteres `If-Match`) bleiben ungepuffert. Inhalte, die selten
angesehen werden, erst beim Öffnen laden. Wiederholte Schreibvorgänge ohne fachliche
Änderung vermeiden, statt sie blind auszuführen. `worker/src/index.ts` setzt für Dateien mit
Inhalts-Hash `Cache-Control: private, max-age=31536000, immutable`; `index.html` und die
SPA-Ersatzantwort auf unbekannte Pfade bleiben ungepuffert – das so erhalten, sonst bliebe
ein Deployment unbemerkt. Keine dieser Maßnahmen darf das Access-Gate, die Prüfung fremder
Daten oder die Konfliktbehandlung mit `If-Match`/`If-None-Match` abschwächen.

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
