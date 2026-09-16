# Arbeitsstand

## AP1 – Gerüst und Übernahme

- Angular 21.2.22, Material/CDK 21.2.14, Build/CLI 21.2.23; standalone, zoneless, strict.
- Beide Fachbereiche mit Lazy-Routen, gemeinsamer Shell, lokal ausgelieferten Schriften.
- Alle 58 Fachtests erhalten; zwei PEP-App-Tests auf tatsächliche gemeinsame Shell angepasst
  (der alte Titeltest erwartete eine nicht mehr vorhandene Angular-Willkommensseite).
- Ergebnis: Produktionsbuild erfolgreich, Vitest 9 Dateien / 60 Tests bestanden.
- Reale Fahrzeugstammdaten nicht übernommen; freie Eingabe bleibt möglich.
- Quelle enthält nur 9 medizinische Enumwerte, entgegen 12 Werten im Auftrag.
  Der Quellstand bleibt erhalten; eine Änderung der fachlichen Rangfolge benötigt Klärung.
- Browserprüfung versucht: Cloud-Browser blockiert beide lokalen Vorschauadressen
  mit ERR_BLOCKED_BY_CLIENT. Desktop/Mobil deshalb noch NICHT verifiziert.
- Beim ursprünglichen AP1-Abschluss bestand noch kein beschreibbarer Fork; deshalb
  zunächst nur lokaler Commit. Den aktuellen GitHub-Übergabestand beschreibt der letzte
  Abschnitt dieses Dokuments. Ein Deployment wurde noch nicht vorgenommen.

## Abnahmegrenzen

Produktion, Google-Zugriffsliste, DNS/Hostname sowie Nextcloud-/EFS-Verbindungen sind
eingerichtet; die App läuft. Weiterhin offen bleiben `npm run test:spa` und die daran
gekoppelte Umstellung von Hash-Routing auf saubere Pfade (siehe AP7). Keine
Altrepositories archivieren, bevor sie nicht mehr benötigt werden.

## AP2 – Worker und Static Assets

- Static Assets aus Angular-Build, Worker vor allen Assets (`run_worker_first = true`).
- Access-JWT-Grundlage aus Sicherheitsgründen schon vor den Proxy-Paketen implementiert.
- GET `/api/benutzer`, GET `/api/status`, unbekannte APIs liefern JSON/404.
- Gemeinsamer WorkerClient: gleiche Origin, keine API-Schlüssel, Sitzungs-/Netzwerkfehler.
- Geprüft: 64 Angular-Tests, 51 Worker-Tests, TypeScript und Wrangler dry-run.
- Der tatsächliche SPA/workerd-Test wurde von der Umgebung beim Laufzeitstart mit
  „network approval was cancelled before a decision was returned“ abgebrochen,
  auch ohne Telemetrie/externe CF-Erkennung. Kein positiver Laufzeitnachweis.
  Hash-Routing bleibt daher bis erfolgreichem `npm run test:spa` erhalten.
- Workers Builds/Access sind vorbereitet und dokumentiert, nicht im Konto eingerichtet.

## AP3 – NextCloud für beide Dateiformate

- `/api/nextcloud/arbeitsmappe`: bestehende Excel-Dateifreigabe, GET/PUT.
- `/api/nextcloud/planungen`: separate Ordnerfreigabe, UUID-Dateien im bisherigen
  `.pep.json`-Format; Liste, bewusstes Laden und Speichern, keine Löschroute.
- If-Match / If-None-Match verhindern unbemerkte Überschreibkonflikte.
- Direkte NextCloud-Konfiguration und Zugriffsschlüssel-Eingabe im Browser entfernt.
- Größen- und Zeitlimits, geschlossene Pfade, bereinigte Upstream-Fehler,
  keine Weitergabe von Auth-/Freigabedaten.
- Verwaiste Einsatzleiterreferenz beim Ersetzen einer Helferliste behoben.
- Geprüft: 84 Angular-Tests, 122 Worker-Tests, Gesamtbuild/TypeScript und Prettier grün.
- Zusätzlicher Deployment-Trockenlauf in diesem Paket durch Umgebungsfreigabe
  abgebrochen; AP2-Trockenlauf war erfolgreich. Live-NextCloud weiterhin ungeprüft.
- Zusätzliches Runtime-Secret erforderlich: `NEXTCLOUD_PEP_SHARE_TOKEN` für
  den neuen Ordner; optional `NEXTCLOUD_PEP_SHARE_PASSWORD`.

## AP4 – EFS dauerhaft über den Worker

- Drei bekannte POST-Aktionen, Formularkodierung und Zugangsdaten ausschließlich serverseitig.
- API-Key-Dialog und optionaler App-Modus entfernt; Verbindungsstatus und Wiederholen ergänzt.
- Bestehendes Qualifikationsmapping übernommen; Notarzt aus `bes_ausbild` ebenfalls erkannt.
- Fahrzeugfunkrufe können aus dem jeweiligen Live-Einsatz übernommen werden.
- Planwechsel und Bearbeitung während asynchronem Laden/Speichern abgesichert.
- Alte Zugangsdaten-Schlüssel werden beim Start auf derselben Origin entfernt.
- Drei Angular-Integrationstests instanziieren Jahresplan, Einsatzliste und Editor.
- Geprüft: 116 Angular-Tests, 209 Worker-Tests, Gesamtbuild/TypeScript und Prettier grün.
- Echte EFS-Antworten und visuelle Browserabnahme weiterhin ungeprüft.

## AP5 – Access-Identität und Sitzung

- Shell lädt nur die vom Worker geprüfte E-Mail-Adresse aus `/api/benutzer`.
- Abmeldung über `/cdn-cgi/access/logout`, neue Anmeldung bei abgelaufener Sitzung.
- Gemeinsame Ladeanzeige und wiederholbarer Benutzerabruf; keine Browser-Tokens.
- JWT-Signatur, Team-Issuer, Audience und Ablauf werden bereits seit AP2 geprüft.
- Geprüft: 120 Angular-Tests, 209 Worker-Tests, Gesamtbuild/TypeScript und Prettier grün.
- Externe Google-/Access-Einrichtung, konkrete Zugriffsliste, Team/AUD und Domain
  sind offen. Ohne diese Konfiguration liefert der Worker bewusst 503 statt Inhalte.
- Kein eigener OIDC-Ersatz und keine ungeschützte Entwicklungs-Hintertür implementiert.

## AP6 – Konsistenz und Abschlussprüfung

- Gemeinsame Material-Dialoge und konsolidierte Design-Tokens; alle verwendeten
  CSS-Variablen sind definiert. Fachstyles enthalten keine festen Farbwerte mehr.
- Umbrechende PEP-Bedienelemente, schmale Karten, scrollbare Tabellen und Arbeitsfläche.
  Der Editor besitzt die beiden tatsächlich übernommenen Bereiche Helferpool und Posten.
- PDF-Bibliothek und Fonts erst beim Export geladen; Fontregistrierung korrigiert.
  Echte PDF-Bytes samt eingebetteten Schriften mit ausschließlich erfundenen Daten geprüft.
- Editor-Lazy-Chunk 291,28 kB statt zuvor etwa 2,17 MB; Initialbundle 383,29 kB.
- Taktische Zeit im gemeinsamen Kalenderkern, Berliner Sommerzeit und Jahreswechsel geprüft.
- Gemeinsamer Verlassensschutz berücksichtigt beide Fachbereiche und inaktive Einsatzpläne.
- Excel- und PEP-Speicherzustände beziehen sich auf den übertragenen Stand. Änderungen
  während Laden, Speichern oder Bestätigungsdialogen werden nicht still verworfen.
- Sicherheitsreview: rohe Nextcloud-URLs strenger geprüft; offene EFS-Uploadstreams
  nach 30 Sekunden abgebrochen. Regressionstests sichern beide Fehlerfälle.
- README, CLAUDE.md, Webeinrichtung, Abschlussbericht und sechs PR-Beschreibungen fertig.
- Finaler Gesamtlauf: **150 Angular-Tests in 26 Dateien**, **216 Worker-Tests in 4 Dateien**,
  Produktionsbuild, Worker-TypeScript und Prettier erfolgreich; `git diff --check` sauber.
- Verbleibende Buildwarnungen: Editor-Styles 18,15 kB über 12-kB-Warnlimit, unter der
  unveränderten 24-kB-Fehlergrenze; CommonJS bei pdfmake/Fonts und base64-js.
- Desktop/Mobil, workerd-SPA, Cloudflare-Builds, Google-Login und echte Upstream-Aufrufe
  bleiben wie oben beschrieben ungeprüft. Die Definition of Done ist damit noch offen.

## AP7 – HiOrg-Kalenderfeed im Jahresplan

- Neuer Worker-Endpunkt `GET /api/hiorg/kalender` hinter demselben Access-Gate wie alle
  übrigen APIs. Das Secret `HIORGSERVER_CALENDER_FEED` ist die vollständige Feed-URL; die
  Zugangsdaten stehen als Query-Parameter darin. Der Query-String ist deshalb hier – anders
  als beim EFS-Ziel – ausdrücklich erlaubt, das Ziel dafür fest an `hiorg-server.de`
  gebunden. Feed-URL und Parameterwerte werden in Fehlern und im Betreiberlog redigiert;
  vor dem Senden prüft der Worker die eigene Ausgabe gegen ein Spiegeln des Geheimnisses.
- Weitergereicht werden nur `sortdate`, `enddate`, `verbez`, `typ`, `id` und die geprüfte
  `url`. `ansprech` und `bemerkung` (Klarnamen, Freitext mit Zugangslinks), `verort`,
  `treff`, `kursnr`, `max_meldungen` und die `personal_*`-Felder bleiben bewusst draußen.
- `leseJsonBegrenzt`, `verwerfeInhalt`, `istObjekt` und `istKennung` liegen jetzt in
  `worker/src/json-lesen.ts` statt privat in `efs.ts`. Die unveränderten EFS-Tests belegen,
  dass die Extraktion das EFS-Verhalten nicht verändert.
- Epoch-Sekunden werden über `Intl.DateTimeFormat` mit `timeZone: 'Europe/Berlin'` auf den
  lokalen Kalendertag abgebildet, nie über UTC. Beide Umschaltnächte und ein Zeitpunkt, den
  eine reine UTC-Rechnung um einen Tag verschöbe, sind abgesichert.
- Der Abgleich ist eine reine Funktion: gleich heißt nach Entitäten-Dekodierung, NFC,
  Whitespace-Normalisierung, Trim und Casefold identisch – keine Ähnlichkeitsstufe.
  Mehrtägige Termine erscheinen an jedem Tag, jahresübergreifende werden auf das Planjahr
  beschnitten. Ein Tag ohne benanntes Thema gilt als Lücke, nicht als Namensabweichung.
- Der Feed wird **nicht** im Browser gespeichert; nur der Umschalter „HiOrg-Termine
  anzeigen" liegt wie Diensttag und Bundesland im `localStorage`. Ein Abruffehler ist nie
  blockierend. `plan-raster.ts` und das Excel-Schema blieben unverändert – es gibt bewusst
  kein persistentes „geklärt"-Kennzeichen, weil das eine neue Spalte bräuchte.
- Gesamtlauf: **221 Angular-Tests in 30 Dateien**, **273 Worker-Tests in 5 Dateien**,
  `npm run build`, `npm run worker:check` und `npm run format:check` erfolgreich.
  `npm run deploy:dry-run` listet alle sechs Secrets-Store-Bindings einschließlich
  `HIORGSERVER_CALENDER_FEED`.
- **Browserprüfung durchgeführt** (Chromium, echtes Produktionsbundle, lokaler Stub für
  `/api/hiorg/kalender` mit ausschließlich erfundenen Terminen; kein echter Feed, weil das
  Secret hier nicht vorliegt). Desktop 1440×900 und Mobil 390×844:
  HiOrg-Karten sind durch Marke, Icon und gestrichelten Rahmen klar von Planterminen zu
  unterscheiden; ein mehrtägiger Termin erscheint an allen drei Tagen; die Namensabweichung
  zeigt Warnrahmen, Warntext und die Marke „1 Namensabweichung(en)" in der Kopfzeile; das
  Kartenmenü bietet „Namen übernehmen" und „In HiOrg öffnen" mit korrektem Ziel;
  die Übernahme setzt das Thema und lässt die Warnung verschwinden, Strg+Z stellt sie
  wieder her. Der Seitenkörper scrollt in keiner Breite waagerecht, das Wochenraster
  scrollt mobil in seinem eigenen Bereich, die untere Navigation bleibt erhalten.

### Offene Abnahmegrenzen von AP7

- Ein Abruf gegen den **echten** HiOrg-Feed hat nicht stattgefunden; das Secret liegt in
  dieser Umgebung nicht vor. Ob HiOrg die Feldstruktur exakt so liefert, ist damit nur
  gegen die vorliegende Beispielantwort geprüft, nicht gegen den Livedienst.
- `npm run test:spa` schlägt weiterhin fehl, inzwischen aber mit einer **anderen** Ursache
  als bisher dokumentiert: nicht mehr der abgebrochenen Netzfreigabe, sondern
  `MiniflareCoreError [ERR_VALIDATION]` – `worker/tests/spa-routing.mjs` übergibt der
  installierten Miniflare-Fassung kein `workers`-Array. Das ist ein Bestandsfehler des
  Prüfskripts und unabhängig von AP7; das Gate wurde nicht abgeschwächt und das
  Hash-Routing bleibt bestehen.
- Die Browserprüfung lief gegen einen lokalen Stub ohne Cloudflare Access. Anmeldung,
  Google-Zugriffsliste und das Zusammenspiel mit dem echten Worker sind unverändert offen.
- Node 24 stand nicht zur Verfügung; alle Läufe erfolgten unter Node 22.22.2 mit npm 11.

## Zeiträume, Uhrzeiten, Typ und Monatsansicht im Rahmenplan

Der Anschluss des HiOrg-Kalenderfeeds hat vier Lücken im Ausbildungsplan sichtbar gemacht;
diese sind jetzt geschlossen.

- **Excel-Mappe erweitert** (die Mappe wird nicht mehr für formatierte Exporte gebraucht):
  vier neue Spalten `Datum bis`, `Von`, `Bis` und `Typ` auf den Jahresblättern; das Blatt
  „Offene Ideen" führt `Von`, `Bis` und `Typ` mit, aber weiterhin kein Datum und kein
  Enddatum. Blattnamen und alle bisherigen Spalten sind unverändert. Eine Mappe **ohne**
  die neuen Spalten liest sich unverändert ein: eintägig, ohne Uhrzeit, Typ `Dienst`.
  Ein `Datum bis` ohne oder vor dem Datum wird verworfen und dem Nutzer gemeldet.
- **Mehrere Termine pro Tag**: In jeder belegten Tageszelle gibt es einen dezenten
  „+"-Knopf; bisher ließ sich nur an leeren Tagen etwas anlegen. Innerhalb eines Tages
  sortieren die Uhrzeiten (Termine ohne Uhrzeit stehen hinten), sodass ein Rookies-Termin
  vor dem Dienstabend steht. Die Lückenmarkierung sitzt jetzt an der Tageszelle und
  erscheint einmal je Tag statt an der ersten Karte.
- **Mehrtägige Termine**: `Termin.datumBis` bildet den Zeitraum ab. Im Wochenraster steht
  der Termin an jedem seiner Tage; der Beginn trägt die vollständige Karte, die Folgetage
  flache Fortsetzungen mit „2/4". Die Segmente überbrücken Rasterlücke und Zellpolsterung
  und wirken als durchgehender Balken, der am Wochenende umbricht. Mehrtägige Termine
  stehen in jeder Tageszelle an erster Stelle, damit der Balken nicht gegen seine
  Fortsetzung versetzt liegt. Gezogen wird nur am Beginn; Verschieben und Datumstausch
  erhalten die Dauer. Ein Diensttag innerhalb eines Zeitraums gilt nicht mehr als Lücke.
- **Monatsansicht**: Der Plan startet im laufenden Monat, mit Vor-/Zurück-Pfeilen,
  Monatsmenü einschließlich „Ganzes Jahr" und einem Knopf „Zum aktuellen Monat". Eine
  Suche hebt den Monatsfilter bewusst auf, sonst blieben Treffer anderer Monate
  unsichtbar. Der heutige Tag ist im Raster markiert.
- **Typ „Dienst" / „Termin"**: als `Termin.typ` gepflegt, in der Mappe gespeichert, im
  Dialog umschaltbar und auf der Karte durch Symbol und Grundfläche unterschieden. Der
  Wertebereich ist derselbe wie das Feld `typ` des Feeds; `HiorgArt` ist jetzt ein Alias.
  Nicht zu verwechseln mit dem abgeleiteten `TerminArt` (`ausbildung`/`ereignis`), das nur
  beschreibt, ob ein Eintrag ein Ausbildungsthema trägt.
- **Uhrzeiten aus dem Feed**: Der Parser wertet die Tageszeit der bereits vorhandenen
  Zeitstempel in Europe/Berlin aus; übernommene HiOrg-Termine bringen Zeitraum, Uhrzeit
  und Typ mit. Der Worker-Vertrag und die erlaubte API-Oberfläche bleiben unverändert.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (241 Angular- und
280 Worker-Tests) und `npm run format:check` – alle grün. Zusätzlich eine reale
Browserprüfung mit Chromium gegen `ng serve` in Desktop- (1440×900) und Mobilbreite
(390×844): Start im laufenden Monat, Monatswechsel und „Zum aktuellen Monat", zwei
Termine an einem Tag in der richtigen Reihenfolge, ein viertägiger Termin als
durchgehender Balken über einen Wochenwechsel und die Typ-Unterscheidung. Zwei
Darstellungsfehler kamen dabei ans Licht und wurden behoben (versetzter Balken bei
zusätzlicher Uhrzeit, abgeschnittener Fortschrittstext). Nicht geprüft: der echte
HiOrg-Feed und ein Rundlauf gegen die produktive Nextcloud-Mappe; `npm run test:spa`
bleibt unverändert am dokumentierten Bestandsfehler hängen und wurde nicht abgeschwächt.

## HiOrg-Anbindung sichtbar und immer eingeblendet

Beim Test gegen die echte Nextcloud-Mappe zeigte sich, dass die HiOrg-Anbindung selbst
zu unauffällig war. Drei Ergänzungen und eine Vereinfachung:

- Ein Plan-Termin, dessen Thema exakt zu einem HiOrg-Eintrag passt, zeigt jetzt ein
  „link"-Symbol im Kartenkopf (mit Direktlink, wenn eine URL vorliegt).
  `hiorg-abgleich.ts` erfasst dafür jetzt auch Treffer (`HiorgTagesAbgleich.treffer`,
  `HiorgAbgleich.terminNachId`) statt sie wie bisher nur mit einem `continue` zu
  verwerfen – nur Abweichungen und Einträge ohne Gegenstück waren vorher ausgewertet.
- Der Verbindungsstatus zum Kalenderfeed steht als Chip in der Kopfleiste (verbunden,
  lädt, nicht eingerichtet, Fehler), statt nur in der Fußzeile des Overflow-Menüs
  lesbar zu sein.
- Jede HiOrg-Karte hat jetzt einen immer sichtbaren Öffnen-Knopf zum
  HiOrg-Server-Termin, nicht mehr nur bei einer Namensabweichung.
- Die HiOrg-Ebene ist nicht mehr abschaltbar: `HiorgKalenderService` kennt kein
  `anzeigen`-Signal und keine gespeicherte Ansichtsvorliebe mehr, der Feed wird beim
  Öffnen des Jahresplans immer geladen und immer angezeigt. Der Menüpunkt „HiOrg-Termine
  anzeigen" ist entfallen; „HiOrg-Termine neu laden" bleibt.

Geprüft: `npm run build`, 245 Angular- und 280 Worker-Tests, `npm run format:check` –
alle grün. Browserprüfung mit gemocktem Feed (der echte HiOrg-Feed ist hier nicht
erreichbar) in Desktop- und Mobilbreite: alle Verbindungszustände, Link-Icon, Öffnen-
Knopf, sowie dass die Ebene ohne weiteres Zutun sichtbar ist.

Rückmeldung aus dem Test gegen die echte Vorschau-Umgebung: Der Statuschip in der
Kopfleiste war zwar sofort verbunden, aber das Wochenraster selbst erscheint erst nach
dem Öffnen einer Arbeitsmappe – der „Rahmenplan öffnen"-Bildschirm zeigte bis dahin gar
keinen Kalender. Ergänzt: Der Willkommen-Bildschirm zeigt jetzt zusätzlich eine reine
Terminliste „Nächste HiOrg-Termine" (`Jahresplan.naechsteHiorgTermine`, bis zu 20 laufende
und künftige Einträge, nach Beginn sortiert, vergangene ausgeblendet) über
`app-hiorg-eintrag-karte` – bewusst ohne Wochenraster, Diensttage oder Namensabgleich, die
alle an einer geöffneten Arbeitsmappe hängen. Geprüft: build, 248 Angular- und
280 Worker-Tests, format:check sowie eine Browserprüfung mit gemocktem Feed: ein
vergangener Termin bleibt draußen, ein bereits laufender mehrtägiger Termin erscheint
zuerst, Sortierung nach Beginn stimmt.

## GitHub-Übergabe

Die sechs AP-Branches (AP1 bis AP6) wurden über Pull Requests aus dem Fork
[stexeflex/stationwizard](https://github.com/stexeflex/stationwizard) in Reihenfolge nach
`main` übernommen. Die App ist seitdem eingerichtet und läuft produktiv; Details zur
laufenden Konfiguration stehen in [Einrichtung](einrichtung.md) und im
[Worker-README](../worker/README.md).

## Arbeitsmappe und HiOrg-Vorschau vereinheitlicht

Die separate Terminliste „Nächste HiOrg-Termine" auf dem früheren Willkommen-Bildschirm
ist entfallen. Das Wochenraster wird jetzt immer angezeigt – auch ohne geöffnete
Arbeitsmappe –, sodass die HiOrg-Ebene direkt in der Kalenderform erscheint statt in
einer eigenen Liste. Passend dazu lädt `Jahresplan` die zentrale NextCloud-Arbeitsmappe
jetzt wie den HiOrg-Feed automatisch beim Öffnen der Ansicht, statt erst auf den
„Öffnen"-Knopf zu warten (`autoOeffnen()`, nur wenn weder eine Quelle offen noch lokale
Daten vorhanden sind). Ein Fehlschlag ist nie blockierend: fehlt die NextCloud-
Konfiguration (503 `NEXTCLOUD_KONFIGURATION_FEHLT`), bleibt die Ansicht wie zuvor
nutzbar, und die Plan-Kopfzeile zeigt „Keine Arbeitsmappe geöffnet" mit den bisherigen
Knöpfen „Arbeitsmappe öffnen" und „Leeren Plan beginnen" als Rettungsweg.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (248 Angular- und
280 Worker-Tests) und `npm run format:check` – alle grün. Neue Tests sichern, dass der
Autolade-Versuch nur ohne bereits offene Quelle und ohne lokale Daten läuft. Eine reale
Browserprüfung gegen eine echte NextCloud-Arbeitsmappe hat in dieser Umgebung nicht
stattgefunden.

## HiOrg-Link auf feste Detailseiten umgestellt

Der Öffnen-Link einer HiOrg-Karte und die Verknüpfungsmarke am Plantermin nutzten bisher
die vom Feed gelieferte `url` (führt teils auf `formulare.php` statt auf die Detailseite).
`hiorgServerLink()` in `hiorg-kalender.model.ts` baut jetzt aus `art` und `id` fest
`https://www.hiorg-server.de/termin.php?ov=biel&id=<id>` (Typ `termin`) beziehungsweise
`https://www.hiorg-server.de/dienstform.php?action=show_existing&ov=biel&id=<id>`
(Typ `dienst`); `ov=biel` ist bei beiden Formularen Pflichtparameter des HiOrg-Servers.
Die `id` kommt jetzt zusätzlich zum bestehenden `url`-Feld aus dem Parser. Der
Kartenkontextmenüpunkt „In HiOrg öffnen" (`app-hiorg-eintrag-karte`) und der
Verknüpfungs-Kopf sowie ein neuer Kontextmenüpunkt „Im HiOrg-Server öffnen" bei
`app-termin-karte` nutzen jetzt beide diesen festen Link statt der Feed-`url`.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (248 Angular- und
280 Worker-Tests) und `npm run format:check` – alle grün. Keine Browserprüfung in dieser
Runde.

## EFS- und Nextcloud-Diagnose

Beide Proxy-Pfade fragen mit `redirect: 'manual'` an und trennen `3xx`-Antworten
(`EFS_UMLEITUNG` / `NEXTCLOUD_UMLEITUNG`) von echten Transportfehlern
(`EFS_NICHT_ERREICHBAR` / `NEXTCLOUD_NICHT_ERREICHBAR`) und, im EFS-Fall, vom
15-Sekunden-Zeitlimit (`EFS_ZEITLIMIT`). Ziel, Inhalt und Header einer Weiterleitung werden
verworfen; der Transportfehler wird redigiert im Worker-Log protokolliert. Der vollständige
Fehlercode-Katalog steht im [Worker-README](../worker/README.md#schutzgrenzen-und-diagnose).

## HiOrg-Karte bei exaktem Treffer nicht mehr doppelt

Ein Plan-Termin mit exakt passendem HiOrg-Eintrag zeigte im Wochenraster bisher zwei
Karten übereinander: die Termin-Karte (mit Verknüpfungssymbol) und zusätzlich die
eigenständige HiOrg-Karte darunter – für denselben Tag und dasselbe Thema. Das war
gegenüber der vorherigen Festlegung „HiOrg-Ebene immer eingeblendet" (siehe oben) eine
bewusste Korrektur auf Nutzerwunsch: Bei einem Treffer reicht das Verknüpfungssymbol auf
der Termin-Karte, die zweite Karte entfällt.

`Jahresplan.istBereitsAufTerminKarte()` prüft je HiOrg-Eintrag, ob er in
`HiorgTagesAbgleich.treffer` steckt (`hiorg-abgleich.ts`, unverändert); `jahresplan.html`
überspringt die `app-hiorg-eintrag-karte` für solche Einträge. Abweichungen und Einträge
ohne Gegenstück bleiben wie bisher sichtbar – nur der exakte Treffer verschwindet als
zweite Karte.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (249 Angular- und
280 Worker-Tests) und `npm run format:check` – alle grün. Keine Browserprüfung in dieser
Runde.

## AP-F1 – Fahrzeugmodul: Domäne und Persistenzabstraktion

Erste Umsetzungsstufe von `docs/konzept-fahrzeuge.md`. Ausschließlich Fachschicht, keine
Oberfläche und kein Worker – das folgt in AP-F2 nach der dort noch offenen
Backendfestlegung.

- `src/app/fahrzeuge/models/fahrzeug.model.ts`: `Fahrzeugstamm`, `Wartungstermin`,
  `Kilometerstand`, `AblesungEingabe`. Keine Bestandszeiträume (Zu-/Abgang) in dieser
  Fassung – bewusste Entscheidung vom 12.09.2026, siehe Konzeptdokument Abschnitt 8.
- `src/app/fahrzeuge/storage/fahrzeug-storage.ts`: `FahrzeugStorage`-Interface und
  `FahrzeugKonfliktFehler`. Die Fachschicht kennt ausschließlich diese Typen, keinen
  Datenbank-, ETag- oder HTTP-Bezug; ein Backendwechsel bleibt auf einen neuen Adapter
  begrenzt.
- `src/app/fahrzeuge/services/`: `fahrzeug-pruefung.ts` (Prüfung unbekannter externer
  Daten, analog `pep-datei.ts`, kein `any`), `kilometer-soll.ts` (Jahresbilanz je
  Fahrzeug – starres Kalenderjahr, volles Jahressoll, `unvollstaendig`-Kennzeichnung ohne
  Vorjahresablesung), `wartungsstatus.ts` (Ampel je Wartungstermin mit individuellem
  Vorlauf), `ablesung-pruefung.ts` (Plausibilitätshinweis bei Rückschritt/Sprung, feste
  30-Tage-Schwelle für die Ablese-Lücke).
- `src/app/fahrzeuge/testing/`: `InMemoryFahrzeugStorage` als Referenzadapter (bildet
  Versionsprüfung und serverseitige Identität nach) sowie Testdaten-Factories. Alle
  Fachtests laufen dagegen und bleiben bei der Backendentscheidung unverändert.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (296 Angular- und
  280 Worker-Tests) und `npm run format:check` – alle grün. Keine Oberfläche, daher keine
  Browserprüfung in diesem Paket.

## AP-F2 – Fahrzeugmodul: Cloudflare D1, Worker-Routen und Client-Adapter

Backendentscheidung aus dem Konzept umgesetzt: Cloudflare D1. Domäne aus AP-F1 unverändert;
die Trennung hat sich in der Praxis bestätigt – kein D1-, SQL- oder HTTP-Typ musste in
`models/` oder `services/` einziehen.

- **D1-Datenbank real angelegt**: `stationwizard-fahrzeuge`
  (`698facb9-4c99-45de-8879-d262c2144144`), Region `weur`. Schema aus
  `worker/migrations/0001_fahrzeuge.sql` über die Cloudflare-D1-API angewendet und gegen
  `sqlite_master` verifiziert (Tabellen `fahrzeuge`, `ablesungen`, Index
  `idx_ablesungen_fahrzeug_datum`). Wartungstermine liegen als geprüftes JSON-Array in der
  Fahrzeugzeile, analog zur bestehenden PEP-Datei als ein zusammengehöriger Datensatz –
  keine eigene Kindtabelle, damit ein Update mit Versionsprüfung ein einzelnes Statement
  bleibt.
- `worker/wrangler.toml`: `[[d1_databases]]`-Block mit Binding `FAHRZEUGE_DB`, echte
  `database_id`. `deploy:dry-run` bestätigt das Binding.
- `worker/src/fahrzeuge.ts`: `GET`/`POST /api/fahrzeuge`, `GET`/`PUT
/api/fahrzeuge/<UUID>`, `GET`/`POST /api/fahrzeuge/<UUID>/ablesungen`. Optimistische
  Sperre über `If-Match`/`If-None-Match` und ein starkes ETag aus einem Versionszähler,
  analog zum bestehenden Nextcloud-Muster; `412` bei Konflikt oder unbekannter Kennung.
  `geaendertAm`/`geaendertVon` und `erfasstVon`/`erfasstAm` setzt der Worker ausschließlich
  aus der bereits geprüften Access-Identität – ein gleichnamiges Feld im Anfragekörper wird
  verworfen und in einem Test bewusst mitgeschickt, um das zu belegen. Ohne `FAHRZEUGE_DB`
  liefert die Route 503 statt eines Absturzes.
- `kurzlinkWeiterleitung()` in derselben Datei, in `worker/src/index.ts` verdrahtet:
  `/f/<UUID>` und `/f/<UUID>/km` leiten (302) auf die aktuelle Hash-Route weiter, damit
  gedruckte QR-Codes eine spätere Routenumstellung überleben (siehe Konzept, Abschnitt 4).
  Access wird für diese Pfade wie für alle anderen vorher geprüft.
- `src/app/fahrzeuge/storage/api-fahrzeug-storage.ts`: Adapter gegen `WorkerClient`, einzige
  Stelle, die zwischen Worker-JSON und Domänentypen übersetzt; Ergebnisse laufen durch die
  AP-F1-Prüffunktionen, bevor sie die Fachschicht erreichen. Ein 412 wird in
  `FahrzeugKonfliktFehler` übersetzt.
- **Interface-Lücke aus AP-F1 behoben**: `FahrzeugStorage.ladeFahrzeug()` lieferte nur den
  `Fahrzeugstamm`, nicht die Version – ein späteres `speichereFahrzeug()` hätte die zuletzt
  gelesene Version nicht kennen können. Jetzt `FahrzeugMitVersion` (`{ daten, version }`);
  In-Memory-Adapter und Tests entsprechend angepasst.
- Neuer Fake `worker/tests/fahrzeug-db-fake.ts`: bildet nur die tatsächlich genutzte
  D1-Teilmenge (`prepare().bind().run()/.first()/.all()`) fest verdrahtet nach, kein
  echter SQL-Parser, damit ein Test nie über eine falsch nachgebildete Query hinwegtäuscht.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (306 Angular- und
  310 Worker-Tests), `npm run format:check` und `npm run deploy:dry-run` – alle grün.
  `npm run worker:test`/`test:spa` mit echtem D1-Zugriff nicht Teil dieses Laufs (Worker-
  Tests laufen weiterhin gegen den Fake, nicht gegen die echte Datenbank). Keine
  Browserprüfung – es gibt noch keine Oberfläche (folgt in AP-F3).

## AP-F3 – Fahrzeugverwaltung: Liste, Detail, Stammdatenformular

Erste Oberfläche des Fahrzeugmoduls. Dritter Fachbereich unter `/#/fahrzeuge`, lazy
geladen, Einstieg über Hauptnavigation und Startseite.

- `src/app/fahrzeuge/services/fahrzeug-store.service.ts`: Signal-Zustand für Liste,
  Detailbearbeitung und Speichern. `entwurf` ist der bearbeitbare Stand, `basislinie` der
  zuletzt bekannte gespeicherte Stand – ihr Vergleich entscheidet
  `hatUngesicherteAenderungen()` und ist bei `VerlassenSchutz` registriert (nur
  `beforeunload`, wie beim bestehenden Editor auch keine In-App-Navigationssperre – kein
  neues Muster gegenüber dem Bestand). Speichern lädt nach dem Schreiben bewusst neu
  (`ladeFahrzeug` statt den PUT-Rückgabewert zu vertrauen), damit `geaendertAm`/
  `geaendertVon` immer vom Server stammen.
- `src/app/fahrzeuge/pages/fahrzeug-liste/`: Suche über Bezeichnung, Funkrufname und
  Kennzeichen, Filter nach Eigentümer, gemeinsame Leerzustands-/Fehlerklassen wie im
  bestehenden Einsatzplaner (`empty-state`, `empty-hint`, `error-hint`).
- `src/app/fahrzeuge/pages/fahrzeug-detail/`: eine Seite für Neuanlage (`/fahrzeuge/neu`)
  und Bearbeitung (`/fahrzeuge/<id>`), reagiert über `toSignal(route.paramMap)` auf einen
  Wechsel der Routen-id. Stammdatenformular mit Live-Prüfung der Fahrgestellnummer
  (`istGueltigeFin` aus AP-F1) und Anzeige des Jahressolls (`sollKmProJahr`) je
  Eigentümer. Wartungstermine inline verwaltbar (hinzufügen, Datum, Vorlauf, „Erledigt“,
  entfernen); die Ampel je Zeile nutzt `ermittleWartungsstatus` unverändert aus AP-F1. Eine
  zweite offene Hauptuntersuchung wird durch einen deaktivierten Button verhindert, ist
  aber nicht auf Fachvorschrift geprüft – reine Bedienhilfe.
- Konfliktfall (412): eigener Hinweisblock mit „Aktuellen Stand laden“, bestätigt über
  `DialogDienst`, lädt danach über `neuLadenNachKonflikt`. Der Entwurf bleibt bis zur
  Bestätigung unverändert erhalten.
- `app.html`/`kern/startseite`: dritter Navigationseintrag und Startseiten-Kachel
  „Fahrzeuge“, `app.spec.ts` entsprechend erweitert.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (324 Angular- und
  310 Worker-Tests) und `npm run format:check` – alle grün. Zusätzlich echte
  Browserprüfung: `ng serve` lokal gestartet, Liste, Neuanlage und ausgefülltes Formular
  mit Wartungsterminen per Playwright/Chromium bei 1280×900 und 390×844 (mobil)
  screenshotet und visuell geprüft – Navigation, Filter, Formular, Ampel-Farben und
  Button-Zustände (deaktivierte zweite HU, aktiviertes Speichern nach gültiger Eingabe)
  wie erwartet, responsive Umbrüche bei mobiler Breite korrekt. Kein Worker in dieser
  Prüfung angebunden, daher API-Fehleranzeige sichtbar – das ist der erwartete Zustand
  ohne Backend.

## AP-F4 – Kilometererfassung, QR-Codes und Druckbogen

- `qrcode` (MIT) als neue Abhängigkeit über `npx npm@11 install` ergänzt, Lockfile
  konsistent. `src/app/fahrzeuge/services/fahrzeug-qr.ts`: statischer Import darin,
  dynamisch von den Aufrufern geladen (analog `excel-lesen.ts`/`excel-schreiben.ts`).
  Ziel-URLs sind absolute `${origin}/f/<UUID>` bzw. `.../km` – dieselben Kurzpfade aus
  AP-F2, kein neues Routenschema.
- `PDF_FARBEN` aus `pdf-export.service.ts` exportiert statt einer zweiten Palette für den
  neuen Druckbogen; `FahrzeugDruckbogenService` (nicht als freie Funktion, sondern als
  Dienst wie `PdfExportService` – Angulars Testharness verbietet `vi.mock` auf relative
  Importe, ein injizierbarer Dienst bleibt dagegen wie gewohnt über `TestBed` ersetzbar)
  erzeugt ein A4-Blatt mit beiden QR-Codes als eingebettetem SVG (pdfmake `ContentSvg`,
  keine Rasterung nötig). Papierformat und Stückzahl je Blatt sind weiterhin offen (siehe
  Konzept, Abschnitt 9); dieser Bogen druckt einen Satz pro Fahrzeug.
- `ablesung-store.service.ts`: eigener, schlanker Store nur für Kilometerablesungen
  (Verlauf laden, eine Ablesung anhängen), getrennt von `fahrzeug-store.service.ts`, das
  ausschließlich Stammdaten und deren Bearbeitungszustand verwaltet.
- `/#/fahrzeuge/<UUID>/km`: eigene, bewusst minimale Erfassungsseite (großes Zahlenfeld,
  Datum, optionale Bemerkung, letzter bekannter Stand als Kontext). Die Quelle einer
  Ablesung (`qr` vs. `formular`) wird ehrlich unterschieden: der Worker-Kurzlink hängt
  `?quelle=qr` an die Weiterleitung an (`worker/src/fahrzeuge.ts`,
  `kurzlinkWeiterleitung`), die Seite fällt ohne diesen Parameter auf `formular` zurück.
  Ein Plausibilitätshinweis (Rückschritt/großer Sprung, aus AP-F1) warnt, blockiert das
  Speichern aber nicht.
- `fahrzeug-detail`: neue Abschnitte „Kilometerstand“ (Jahresbilanz aus
  `berechneJahresbilanz`, Verlauf, Korrekturweg – ein neuer Datensatz mit `quelle:
'korrektur'` und Verweis über `korrigiert`, nie ein Update einer bestehenden Ablesung)
  und „QR-Codes“ (Bildschirmvorschau als PNG-Data-URL, Druckbogen-Download); beide nur für
  bereits gespeicherte Fahrzeuge sichtbar.
- **Echten Fehler in `ApiFahrzeugStorage.ladeFahrzeug` bei der Browserprüfung gefunden und
  behoben**: die Methode las den Antwortkörper direkt mit `.json()`, ohne vorher den
  Content-Type zu prüfen (anders als `WorkerClient.json()`). Ohne Worker beziehungsweise
  bei einer unerwarteten HTML-Antwort erschien ein roher `Unexpected token '<' … is not
valid JSON` statt einer verständlichen Fehlermeldung. Jetzt dieselbe Prüfung wie im
  gemeinsamen Client, mit Test.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (341 Angular- und
  310 Worker-Tests), `npm run format:check` – alle grün. Echte Browserprüfung mit
  `ng serve` und Playwright/Chromium: Erfassungsseite und Detailseite eines neuen
  Fahrzeugs bei 390×844 und 1280×900 geprüft, inklusive der beschriebenen Fehlerkorrektur
  (Screenshot vorher/nachher). Die QR-/Kilometerabschnitte selbst ließen sich ohne
  angebundenen Worker nicht mit echten Daten befüllen und damit nicht im Browser
  fotografieren – ihre Erzeugung ist stattdessen durch Unit-Tests abgesichert (echte
  `qrcode`-PNG-Data-URLs, kein Mock). Das bleibt für eine spätere Runde mit echtem Backend
  offen.

## AP-F5 – Fuhrpark-Dashboard

Umsetzung der im Konzept vorgesehenen Routenaufteilung: das Dashboard ist jetzt die
Startseite des Moduls, die bisherige Liste ist auf `/fahrzeuge/liste` gewandert.
`fahrzeug-detail`s Zurück-Pfeil verweist entsprechend auf `/fahrzeuge/liste` statt auf das
Dashboard. Diese Umstellung war unkritisch, weil das Modul noch nicht produktiv läuft.

- `fahrzeuge.routes.ts`: `''` → `FahrzeugDashboard`, `'liste'` → `FahrzeugListe`
  (unverändert), `'neu'`/`':id/km'`/`':id'` wie zuvor.
- `fahrzeug-dashboard`: „Nächste Wartungen“ sammelt alle offenen (nicht erledigten)
  Wartungstermine über alle Fahrzeuge mit `ermittleWartungsstatus` (unverändert aus AP-F1)
  und sortiert nach Fälligkeit. „Kilometerbilanz“ lädt je Fahrzeug die Ablesungshistorie
  und berechnet `berechneJahresbilanz`; da es keinen zentralen Ablesungs-Endpunkt über
  alle Fahrzeuge gibt (bewusst, siehe Konzept), sind das so viele Anfragen wie Fahrzeuge –
  bei der erwarteten Fuhrparkgröße unproblematisch. `Promise.allSettled` statt
  `Promise.all`: ein einzelnes fehlgeschlagenes Fahrzeug blockiert nicht die Bilanzen der
  übrigen, meldet aber einen Sammel­hinweis.
- Fahrzeuge ohne Ablesung seit über 30 Tagen (`hatAbleseLuecke`, unverändert aus AP-F1)
  werden in der Kilometerliste gesondert markiert.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (346 Angular- und
  310 Worker-Tests), `npm run format:check` – alle grün. Browserprüfung mit `ng serve` und
  Playwright/Chromium bei 1280×900 und 390×844: Dashboard und die verschobene Liste unter
  `/fahrzeuge/liste` laden und brechen nicht um, Fehleranzeige ohne Worker wie erwartet.
  Die befüllten Wartungs-/Kilometerabschnitte selbst konnten mangels Backend nicht mit
  echten Daten fotografiert werden; ihre Berechnung ist durch Unit-Tests mit mehreren
  Fahrzeugen und einem gezielt fehlschlagenden Ablesungsabruf abgesichert.

## AP-F6 – Integration in den Einsatzplaner

Der Einsatzplaner bezieht Fahrzeuge jetzt aus dem Fahrzeugmodul statt aus der leeren
Konstante `einsatz/data/fahrzeuge.ts` (entfernt). Die Einsatzmodelle bleiben dabei
unverändert – wie im Konzept (Abschnitt 2 „Verhältnis zum Bestand“) festgelegt.

- Neuer `einsatz/services/fahrzeuge-quelle.service.ts`: schmaler, schreibgeschützter
  Übersetzer von `Fahrzeugstamm` (Fahrzeugmodul) auf das bestehende `Fahrzeug`
  (Einsatzmodell, `{ seriennummer, funkruf, hiorgId }`). Keine Vereinheitlichung der
  beiden Fachmodelle: `funkrufname` → `funkruf`, die optionale `fahrgestellnummer` → die
  bislang ungenutzte `seriennummer` (fachlich dieselbe Fahrzeugkennung), `hiorgId` bleibt
  leer, weil das Fahrzeugmodul keine HiOrg-Kennung führt – eine spätere Übernahme aus EFS
  braucht zuerst einen fachlichen Nachweis (Konzept, Abschnitt 9).
- `efs-api.service.ts` (`matchFahrzeug`) und `planning-editor.ts` (`filteredFahrzeuge`)
  lesen jetzt über diesen Dienst statt der statischen `FAHRZEUGE`-Liste.
  `sicherstellenGeladen()` löst das Laden beim ersten Zugriff aus, spätere Aufrufe sind
  ein günstiger No-op.
- **Eine echte Regression beim Umbau vermieden**: mit echten Fahrgestellnummern in der
  Liste hätte `matchFahrzeug`s bisheriger Vergleich `v.hiorgId === em.fugcode` bei einem
  leeren `fugcode` aus EFS auf eine leere `hiorgId` (jetzt immer `''`) treffen und
  fälschlich das erste Fahrzeug der Liste zurückgeben können. Beide Vergleichspfade prüfen
  jetzt zuerst, dass der EFS-Wert selbst nicht leer ist, mit Test.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (351 Angular- und
  310 Worker-Tests), `npm run format:check`, `npm run deploy:dry-run` – alle grün.
  Browserprüfung mit `ng serve`/Playwright: neue Planung angelegt, Posten erstellt, das
  Fahrzeugfeld im Editor geöffnet – keine Konsolenfehler, leere Trefferliste wie erwartet
  ohne angebundenen Worker.

## Nachtrag – Jahresanfangsstand nachtragen, Material-Eingabefelder, Detailseite

Nachbesserung an der Kilometerbilanz und den Eingabeformularen des Fahrzeugmoduls, ohne
dass diese ein eigenes AP-Kürzel bekommen hätten:

- `kilometer-soll.ts` (`ermittleJahresstartstand`): eine ersatzweise verwendete erste
  Ablesung des Jahres gilt jetzt genau dann als vollwertiger Jahresstartstand (nicht mehr
  `unvollstaendig`), wenn sie exakt auf den 1.1. datiert ist. Ohne diese Lockerung ließ
  sich der Jahresvergleich nie „vollständig" bekommen, sobald ein Fahrzeug erst im
  laufenden Jahr erfasst wurde – der Warnhinweis blieb trotz bewusst nachgetragenem
  Startwert stehen.
- `fahrzeug-detail`: neuer Button „Jahresanfang nachtragen" im Abschnitt
  „Kilometerstand" öffnet ein Formular mit auf den 1.1. des laufenden Jahres vorbelegtem,
  aber änderbarem Datum, Stand und Bemerkung; speichert über den bestehenden
  `AblesungStoreService.erfassen()` mit `quelle: 'formular'`. Bewusst nicht durch
  `pruefeAblesungPlausibilitaet` geführt, da ein rückwirkend nachgetragenes Datum sonst
  fälschlich als „Rückschritt" gegenüber der jüngsten Ablesung gewertet würde – eine
  eigene Plausibilitätsprüfung für rückwirkende Nachträge ist eine spätere, hier bewusst
  nicht mitgelöste Erweiterung.
- Alle bisher rohen `<input>`-Felder in `fahrzeug-detail` (Wartungstermin-Bezeichnung,
  -Fälligkeit, -Vorlauf; Korrektur- und das neue Nachtrag-Formular) sind jetzt echte
  Material-Formularfelder (`mat-form-field`/`matInput`). Datumsfelder verwenden
  `MatDatepicker` mit `MAT_DATE_LOCALE: 'de-DE'` (gleiches Muster wie in
  `planning-editor.ts`) statt des nativen, browserabhängig formatierten `type="date"` –
  Eingabe und Kalender zeigen jetzt durchgehend das deutsche Format (`TT.MM.JJJJ`).
- `km-erfassung` (mobile QR-Erfassung): Funkrufname und Kennzeichen erscheinen jetzt als
  `tag-chip`-Chips unter der Fahrzeugbezeichnung (gemeinsame, bereits global definierte
  Chip-Klasse aus `styles.less`, keine neue Komponente); der bisherige, aus zwei Feldern
  zusammengesetzte Fließtext ist entfallen. Der Hinweis auf die letzte Ablesung ist von
  „Letzter bekannter Stand: X km am Datum" auf „Kilometerstand: X km" gekürzt. Das native
  `type="date"`-Feld dieser Seite bleibt bewusst unverändert: es ist die mobile
  QR-Erfassung, für die der native Gerätepicker (der die Systemsprache respektiert) der
  bessere Touch-Bedienweg bleibt.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (355 Angular- und
  310 Worker-Tests, u. a. neue Fälle für `ermittleJahresstartstand` und die drei neuen
  `nachtrag*`-Methoden), `npm run format:check` – alle grün. Browserprüfung mit
  `ng serve`/Playwright bei 1280×900: neues Wartungstermin-Datumsfeld zeigt
  `TT.MM.JJJJ`-Format und ein Kalender mit deutschen Monats-/Wochentagsnamen, keine
  Konsolenfehler. Die Nachtragen-Fläche selbst (nur sichtbar für ein bereits gespeichertes
  Fahrzeug) ließ sich mangels angebundenem Worker nicht zusätzlich fotografieren; ihr
  Verhalten ist durch die neuen Komponenten-Tests abgesichert.

## Nachtrag – Kilometerablesungen löschen

Fachlicher Wunsch: einzelne Kilometerablesungen sollen sich wieder löschen lassen. Das
widerspricht der ursprünglichen Konzeptentscheidung „Kilometerstände sind unveränderlich"
(Begründung: nachträgliche Beschönigung der Pflichtkilometer soll erkennbar bleiben). Auf
Nachfrage lautete die fachliche Antwort: **nur Administratoren** sollen künftig löschen
(bzw. korrigieren) dürfen – eine Rolle, die es im Modul noch nicht gibt (bestehende
Entscheidung „Rechte vorerst alle, Rollen später"). Bis zu einer Rollenprüfung steht die
Funktion deshalb jeder geprüften Identität offen; `docs/konzept-fahrzeuge.md` (Abschnitt 8)
und die API-Tabelle in `CLAUDE.md` dokumentieren das ausdrücklich als Übergangszustand.

- Neuer Endpunkt `DELETE /api/fahrzeuge/<UUID>/ablesungen/<UUID>`
  (`worker/src/fahrzeuge.ts`, `loescheAblesung`): löscht endgültig, sperrt aber, solange
  eine andere Ablesung per `korrigiert` auf diese verweist (409 `ABLESUNG_HAT_KORREKTUR`)
  – sonst zeigte eine bestehende Korrektur ins Leere. 404, wenn die Ablesung für dieses
  Fahrzeug nicht existiert. Der Migrationskommentar in
  `worker/migrations/0001_fahrzeuge.sql` ist entsprechend angepasst (keine Schemaänderung
  nötig).
- `FahrzeugStorage.loescheAblesung()` ergänzt den gemeinsamen Vertrag; neue
  `AblesungHatKorrekturFehler`-Fehlerklasse neben der bestehenden
  `FahrzeugKonfliktFehler`. `ApiFahrzeugStorage` übersetzt HTTP 409 entsprechend,
  `InMemoryFahrzeugStorage` bildet dieselbe Regel lokal für Tests nach.
  `AblesungStoreService.loeschen(fahrzeugId, ablesungId)` entfernt die Ablesung optimistisch
  erst nach erfolgreicher Serverantwort aus der lokalen Liste.
- `fahrzeug-detail`: neuer Löschen-Button je Ablesungszeile, mit Bestätigungsdialog über
  `DialogDienst` („endgültig, nicht wiederherstellbar"). Ein clientseitiges `hatKorrektur()`
  deaktiviert den Button bereits vorab für korrigierte Ablesungen (mit Tooltip) – der Server
  bleibt die verbindliche Prüfung, das ist nur eine vorweggenommene Fehlermeldung.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (364 Angular- und
  314 Worker-Tests, u. a. neue Fälle für den DELETE-Endpunkt, beide Storage-Adapter, den
  Store und die Komponente), `npm run format:check`, `npm run deploy:dry-run` – alle grün.
  Browserprüfung mit `ng serve`/Playwright bei 1280×900 auf `/fahrzeuge/neu` und
  `/fahrzeuge/liste`: keine Konsolenfehler. Der Löschen-Button selbst (nur sichtbar für ein
  bereits gespeichertes Fahrzeug mit Ablesungen) ließ sich mangels angebundenem Worker nicht
  zusätzlich fotografieren; sein Verhalten ist durch die neuen Tests auf allen Schichten
  (Worker, beide Storage-Adapter, Store, Komponente) abgesichert.

## Nachtrag – Fuhrpark-Seite als Dashboard mit Tabs, Kilometerbilanz als Fortschrittsbalken

Fachlicher Wunsch: `/fahrzeuge` stärker als Dashboard aufbauen, mit zusätzlichen Tabs
„Liste Fahrzeuge" und „Liste Wartungen", und die Kilometerbilanz visuell als
Fortschrittsbalken mit Restwert statt als reinem Fließtext.

- `fahrzeug-dashboard` bekommt einen `mat-tab-group` mit drei Tabs: **Übersicht** (bisheriger
  Dashboardinhalt, jetzt als Kartenraster: „Nächste Wartungen" zeigt nur noch die fünf
  dringendsten Termine mit einem „Alle anzeigen"-Link in den Wartungen-Tab; „Kilometerbilanz"
  zeigt je Fahrzeug eine kleine Karte mit Fortschrittsbalken), **Liste Fahrzeuge** (die
  bestehende `FahrzeugListe` eingebettet) und **Liste Wartungen** (neue, vollständige Liste
  aller Wartungstermine über alle Fahrzeuge, mit Umschalter für bereits erledigte Termine).
- `FahrzeugListe` bekommt ein `eingebettet`-Eingabesignal: blendet die eigene Kopfleiste aus
  und lädt die Liste nicht erneut (das Dashboard hat `store.fahrzeuge()` bereits gefüllt) –
  die eigenständige Route `/fahrzeuge/liste` bleibt unverändert bestehen (z. B. als
  Rücksprungziel von der Detailseite), verhält sich dort wie zuvor.
- Neue Komponente `fahrzeuge/components/kilometer-bilanz`: stellt eine
  `KilometerJahresbilanz` als `mat-progress-bar` (gefahren/Soll) mit Restwert dar, grün
  hervorgehoben bei erreichtem Jahresziel. Von Dashboard (je Fahrzeug in der
  Kilometerbilanz-Karte) und `fahrzeug-detail` (Kilometerstand-Abschnitt) gemeinsam genutzt,
  damit beide Stellen dieselbe Darstellung zeigen statt zweier gepflegter Textvarianten.
- Neue Komponente `fahrzeuge/components/wartungen-liste`: vollständige, filterbare
  Wartungsliste über alle Fahrzeuge (Standard: nur offene Termine), als eigener Dashboard-Tab.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (373 Angular- und
  314 Worker-Tests, u. a. neue Spezifikationen für beide neuen Komponenten und die
  Dashboard-Tab-Logik), `npm run format:check`, `npm run deploy:dry-run` – alle grün.
  Browserprüfung mit `ng serve`/Playwright bei 1280×900 und 390×844: `/api/fahrzeuge` und
  `/api/fahrzeuge/*/ablesungen` über Playwrights Netzwerk-Mocking mit Testdaten beantwortet
  (kein echter Worker nötig), alle drei Tabs, der Fortschrittsbalken in beiden Zuständen
  (Rest offen/rot, Jahresziel erreicht/grün) und der Erledigt-Umschalter der Wartungsliste
  visuell geprüft; mobile Tableiste nutzt Material-eigene Scroll-Pfeile, Karten brechen
  einspaltig um. Keine Konsolenfehler.

### Nachtrag – Ablese-Lücke als Datum statt Textfloskel

„seit über 30 Tagen keine Ablesung" ersetzt durch einen Chip mit dem tatsächlichen Datum der
letzten Ablesung („Letzte Ablesung 01.06.2026"), ohne Ablesung „Keine Ablesung" – konkreter
als die vage Zeitangabe und ohne zusätzliche Rechnung in der Vorlage.
`BilanzMitFahrzeug` führt dafür `letzteAblesungAm` mit; Test ergänzt.

## Nachtrag – Expansion Panels und Änderungsprotokoll auf der Fahrzeugdetailseite

Zwei fachliche Wünsche: die Abschnitte der Fahrzeugdetailseite sollen aufklappbar sein statt
starr untereinanderzustehen, und am Ende soll ein neuer Abschnitt „Änderungsprotokoll" jede
Änderung am Fahrzeug samt Persistenz zeigen.

- `fahrzeug-detail`: alle Abschnitte (Stammdaten, Wartungstermine, Kilometerstand, QR-Codes)
  sind jetzt `mat-expansion-panel`s in einem `mat-accordion` mit `multi` (mehrere gleichzeitig
  offen). Stammdaten ist vorbelegt geöffnet, die übrigen starten eingeklappt. Aktionsleisten
  (z. B. „Weiterer Termin", „Kilometerstand erfassen"), die vorher neben der Überschrift
  standen, sind an den Anfang des jeweiligen Panelinhalts gewandert – ein Klick darauf soll
  nicht zugleich das Panel zu- oder aufklappen.
- Neuer Abschnitt **Änderungsprotokoll** am Ende, nur für bereits gespeicherte Fahrzeuge:
  zeigt jeden protokollierten Eintrag mit Zeitpunkt, wer und einer (bei mehreren Feldern
  mehrzeiligen) Beschreibung.
- **Protokollierung inklusive Persistenz**, vollständig serverseitig:
  - Neue Tabelle `fahrzeug_aenderungen` (`worker/migrations/0002_fahrzeug_aenderungen.sql`),
    direkt auf der echten D1-Datenbank angelegt. Ausschließlich lesend über
    `GET /api/fahrzeuge/<UUID>/aenderungen` erreichbar; kein Endpunkt, über den ein Client
    selbst einen Eintrag schreiben könnte.
  - `worker/src/fahrzeuge.ts`: `protokolliereAenderung()` schreibt einen Eintrag als
    Nebeneffekt von Fahrzeuganlage, Stammdaten-/Wartungsänderung (`diffFahrzeug` /
    `diffWartungstermine` vergleichen alten und neuen Stand feldweise; kein Eintrag ohne
    echte Änderung), Kilometererfassung und Kilometerlöschung. `beschreibung` entsteht immer
    aus dem tatsächlichen Unterschied, nie aus einer Clienteingabe.
  - `FahrzeugStorage.ladeAenderungen()` im gemeinsamen Vertrag ergänzt; `ApiFahrzeugStorage`
    liest darüber, `InMemoryFahrzeugStorage` bildet eine vereinfachte Version derselben Regel
    für Fachtests nach. Neuer `AenderungsprotokollStoreService` (analog
    `AblesungStoreService`) lädt die Liste in `fahrzeug-detail`.
  - `docs/konzept-fahrzeuge.md` (neuer Unterabschnitt „Änderungsprotokoll (Nachtrag)"),
    `CLAUDE.md` und `worker/README.md` entsprechend ergänzt.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (382 Angular- und
  321 Worker-Tests, u. a. neue Fälle für den diffbasierten Protokolleintrag bei Anlage,
  Stammdaten-, Wartungs-, Ablesungsänderungen in Worker- und In-Memory-Adapter),
  `npm run format:check`, `npm run deploy:dry-run` – alle grün. Browserprüfung mit
  `ng serve`/Playwright bei 1280×1100 und 390×844 gegen gemocktes `/api/fahrzeuge/<id>`,
  `/ablesungen` und `/aenderungen`: Stammdaten startet geöffnet, übrige Panels lassen sich
  unabhängig auf-/zuklappen, das Änderungsprotokoll zeigt eine mehrzeilige Beschreibung
  korrekt als Liste, mobile Ansicht bricht sauber um. Keine Konsolenfehler.

## HiOrg-Kalender: beide Zeitrichtungen statt fester Konfiguration

Die HiOrg-API kann pro Abruf nur in eine Richtung schauen: `monate` in der konfigurierten
Feed-URL zählt ab heute entweder vorwärts (positiv) oder zurück (negativ), nie beides. Bei
fest im Secret konfigurierter Richtung blieb deshalb eine Zeitrichtung im Jahresplan immer
unerreichbar – je nachdem, ob `HIORGSERVER_CALENDER_FEED` mit positivem oder negativem
`monate` eingerichtet ist.

- `verarbeiteHiorgKalender()` (`worker/src/hiorg-kalender.ts`) erlaubt jetzt genau einen
  optionalen Anfrageparameter `monat=JJJJ-MM` – der im Jahresplan gerade angeschaute Monat.
  Der Worker berechnet daraus den Abstand zum heutigen Monat (`Intl.DateTimeFormat` mit
  `timeZone: 'Europe/Berlin'`, nie eine reine UTC-Rechnung) und setzt `monate` mit dem
  passenden Vorzeichen und ausreichend Vorlauf (`Abstand + 1` vorwärts, `Abstand - 1`
  zurück). Ein fehlendes `monat` gilt wie der laufende Monat (`monate=1`). Ein falsches
  Format oder ein zusätzlicher Parameter liefert `400 / HIORG_KALENDER_ANFRAGE_UNGUELTIG`.
- **Zweite, tiefergehende Korrektur in derselben Runde:** `HIORGSERVER_CALENDER_FEED` war
  bisher die vollständige Feed-URL; das Secret enthält jetzt nur noch den `lab`-Tokenwert.
  Host (`www.hiorg-server.de`), Pfad (`/termine.php`) und die übrigen Anfrageparameter
  (`ov=biel`, `termin=1`, `dienst=1`, `auchint=1`, `zr_dienst=1`, `json=1`) sind als
  `FEED_URL_BASIS`/`FESTE_FEED_PARAMETER` fest im Worker hinterlegt und werden serverseitig
  ergänzt – dasselbe Muster wie `apikey`/`version`/`action` beim EFS-Ziel. `ov=biel` stand
  als Pflichtparameter der Ereignis-Detaillinks (`hiorg-kalender.model.ts`) ohnehin schon
  unverschlüsselt im Repository. Wer das Secret zuvor auf die vollständige URL gesetzt
  hatte, muss es auf den reinen `lab`-Wert umstellen, sonst antwortet der Worker mit
  `503 / HIORG_KALENDER_KONFIGURATION_FEHLT`.
- `HiorgKalenderService.lade()` (`src/app/ausbildung/services/hiorg-kalender.service.ts`)
  nimmt jetzt ein Optionsobjekt `{ monat?, erzwingen? }` statt eines einzelnen
  `erzwingen`-Flags entgegen und lädt bei einem Monatswechsel automatisch neu, auch ohne
  `erzwingen`.
- `Jahresplan` (`src/app/ausbildung/pages/jahresplan/jahresplan.ts`) übergibt bei jedem
  Wechsel von Jahr oder angeschautem Monat den Monat als `JJJJ-MM`; bei „Ganzes Jahr" gilt
  dieselbe Auswahl wie beim bestehenden automatischen Zurücksetzen des Monats: laufender
  Monat im laufenden Jahr, sonst Januar.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm run worker:test` (288
Worker-Tests) und `npm run format:check` – alle grün. Kein Abruf gegen den echten
HiOrg-Feed (Secret liegt in dieser Umgebung nicht vor) und keine Browserprüfung in dieser
Runde.

## Verwaltungsbereich mit CSV-Stammdatenimport für Fahrzeuge

Fachlicher Anlass: das Fahrzeugmodul zwang bis hierher dazu, jedes Fahrzeug einzeln über
`/fahrzeuge/neu` anzulegen — eine Übernahme aus HiOrg ist mangels nachgewiesener
EFS-Aktion weiterhin blockiert (Konzept Abschnitt 9). Zugleich fehlte ein Ort für
Aufgaben, die ganze Stammdatenbestände betreffen.

- **Neuer Bereich Verwaltung** (`/verwaltung`, `src/app/verwaltung/`) als vierter
  Navigationspunkt in `app.html` und als vierte Kachel auf der Startseite. Er enthält nur
  den Einstieg; erste Aufgabe ist der Fahrzeugimport. Der Bereich hat **kein
  Rollenmodell** und ist kein Zugriffsschutz — jede geprüfte Anmeldung sieht ihn, was auf
  der Seite selbst so benannt wird. Er ist der Andockpunkt für eine spätere Admin-Rolle.
- **CSV-Leser** `src/app/kern/text/csv.ts` (`leseCsv`, `schreibeCsv`): reine Funktionen
  ohne Bibliothek, mit Byte-Order-Mark, Trennererkennung (`;`, `,`, Tabulator),
  RFC-4180-Anführungszeichen, eingebetteten Umbrüchen und CRLF.
- **Importfachlogik** `src/app/fahrzeuge/services/fahrzeug-import.ts`: Spaltenvertrag mit
  Pflichtspalten `bezeichnung` und `kennzeichen`, allem Weiteren optional, `eigentuemer`
  mit Vorgabe „Organisation", HU-Fälligkeit in `JJJJ-MM-TT` oder `TT.MM.JJJJ`. Geprüft
  wird über die bestehenden Guards aus `fahrzeug-pruefung.ts`, nicht über eine zweite
  Prüfschicht. Nur die HU wird als Prüftermin übernommen.
- **Einmaligkeit je Kennzeichen**: tolerant normalisierter Vergleich (Großschreibung ohne
  Leerzeichen, Bindestriche, Punkte) gegen den Bestand und gegen die bereits gelesenen
  Zeilen derselben Datei. Vor dem Schreiben liest
  `fahrzeug-import-store.service.ts` den Bestand erneut und bewertet die Vorschau neu.
  Ein abgeschlossener Lauf sperrt den Startknopf, bis eine Datei neu gewählt wird.
- **Keine neue API-Oberfläche, keine Migration**: der Import ruft je Zeile
  `speichereFahrzeug(fahrzeug, null)` und damit `POST /api/fahrzeuge` mit
  `If-None-Match: *`. `worker/` bleibt unangetastet; jede angelegte Zeile erzeugt
  serverseitig den Protokolleintrag „Fahrzeug angelegt".
- **Oberfläche** `src/app/fahrzeuge/pages/fahrzeug-import/`: Mustervorlage herunterladen,
  Datei wählen, Vorschau mit Befund je Zeile, Bestätigungsdialog über `DialogDienst`,
  Fortschrittsbalken, Bericht mit CSV-Download.

**Bewusst offen geblieben:** Der Import ist nicht transaktional — ein Abbruch mittendrin
lässt die bereits angelegten Fahrzeuge stehen.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (427 Angular-Tests,
329 Worker-Tests) und `npm run format:check` — alle grün. `npm run worker:test`,
`npm run test:spa` und `npm run deploy:dry-run` in dieser Runde nicht nötig beziehungsweise
nicht ausgeführt, weil weder `worker/` noch die Migrationen berührt wurden; `test:spa`
bleibt wie zuvor dokumentiert blockiert.

Browserprüfung mit `ng serve`/Playwright bei 1440×1000 und 400×850 gegen gemocktes
`GET`/`POST /api/fahrzeuge`: Mustervorlage lädt mit Byte-Order-Mark und Semikolon
herunter; eine Testdatei mit vier Zeilen (vollständig, nur Pflichtfelder, ungültige FIN,
Schreibvariante eines bereits gelesenen Kennzeichens) wird als „2 werden angelegt,
1 doppelt in der Datei, 1 fehlerhaft" bewertet; der Import legt genau zwei Fahrzeuge an;
derselbe zweite Lauf weist alle vier Zeilen ab und legt nichts hinzu, der Startknopf
bleibt gesperrt. Mobile Ansicht bricht sauber um, keine Konsolenfehler. Kein Lauf gegen
den echten Worker mit D1 und keine realen Fahrzeugdaten.

### Nachtrag in derselben Runde: Kennzeichen wird in der Datenbank eindeutig

Die Einmaligkeit sollte auf Wunsch nicht nur im Import gelten, sondern für jedes
Kennzeichen im Bestand. Sie ist damit keine Regel der Oberfläche mehr, sondern eine Zusage
der Datenbank.

- Neue Migration `worker/migrations/0003_kennzeichen_eindeutig.sql`: eindeutiger Index auf
  der Vergleichsform `upper(replace(replace(replace(kennzeichen,' ',''),'-',''),'.',''))`.
  Bewusst **partiell** (`WHERE ... <> ''`), damit ein leeres Kennzeichen weiterhin erlaubt
  und mehrfach möglich bleibt — das Datenmodell lässt es zu.
- `worker/src/fahrzeuge.ts` prüft in `kennzeichenVergeben()` vor Anlage **und** Änderung
  und antwortet mit `409 / FAHRZEUG_KENNZEICHEN_VERGEBEN`. Verliert die Prüfung das Rennen
  gegen eine gleichzeitige Anfrage, wird die Indexverletzung aus `INSERT`/`UPDATE` in
  dieselbe Antwort übersetzt statt in das bisherige pauschale `412` beziehungsweise einen
  generischen `502`. Der Versionskonflikt bleibt unverändert bei `412`.
- Die Fachschicht bekommt einen eigenen `KennzeichenVergebenFehler` neben dem
  `FahrzeugKonfliktFehler`: Neuladen hilft hier nicht, das Kennzeichen selbst muss geändert
  werden. `FahrzeugStoreService` setzt deshalb bewusst **kein** `speicherKonflikt`, sodass
  die Detailseite eine schlichte Fehlermeldung zeigt statt des Banners „neu laden und
  zusammenführen".
- Die Vergleichsform liegt jetzt in `src/app/fahrzeuge/services/kennzeichen.ts` (aus der
  Importlogik herausgelöst) und existiert bewusst dreifach: Index, SQL-Ausdruck im Worker,
  TypeScript für Anzeige und Vorschau. Der Unterschied zwischen SQLites ASCII-`upper()`
  und `toUpperCase()` ist notiert: die Oberfläche warnt eher zu früh als zu spät.
- `InMemoryFahrzeugStorage` und `FakeFahrzeugeDb` bilden den Index nach; im Fake sind
  Indexzugriff (`indexTreffer`) und Vorabprüfung (`vorabTreffer`) getrennt, damit ein Test
  das Rennen zwischen beiden nachstellen kann.

Geprüft: `npm run build`, `npm test` (434 Angular-Tests, 336 Worker-Tests),
`npm run format:check`, `npm run worker:check`, `npm run worker:test` und
`npm run deploy:dry-run` — alle grün. `npm run test:spa` scheitert weiterhin am bekannten
Bestandsfehler (`MiniflareCoreError [ERR_VALIDATION]`, `workers: undefined` in
`worker/tests/spa-routing.mjs`); das ist unverändert und nicht durch diese Änderung
verursacht.

Browserprüfung mit `ng serve`/Playwright bei 1440×1000 gegen ein `/api/fahrzeuge`, das wie
der geänderte Worker antwortet: Die Importvorschau hält bei leerer Bestandsliste beide
Zeilen für frei, der Server weist eine davon mit 409 ab, und der Bericht nennt den Grund
„Zu diesem Kennzeichen ist bereits ein Fahrzeug angelegt." Dieselbe Abweisung erscheint
bei manueller Anlage über `/fahrzeuge/neu` mit der Schreibvariante `xy te 123` als
Fehlerhinweis über dem Formular, ohne Konfliktbanner. Keine Anwendungsfehler in der
Konsole (die beiden Meldungen dort sind die 409-Antworten selbst).

**Offen und ausdrücklich nicht erledigt:** Die Migration ist **nicht** auf die produktive
D1-Datenbank angewendet. Das muss vor dem Ausrollen geschehen und scheitert, solange dort
Doubletten liegen — die Prüfabfrage steht als Kommentar in der Migrationsdatei, der Befehl
in `worker/README.md`. Solange die Migration fehlt, greift nur die Vorabprüfung des
Workers; ein Rennen zwischen zwei gleichzeitigen Anfragen bliebe dann ungeschützt.

## Benutzerverwaltung: Anmeldungen einsehen und Rollen zuweisen

Fachlicher Anlass: Cloudflare Access entscheidet bereits, wer sich anmelden darf, aber die
App selbst kannte weder eine Liste der bekannten Personen noch irgendeine Rollenzuordnung.
Ziel war zunächst nur Einsehen und Rollenvergabe, kein Anlegen von Zugängen — das bleibt
Sache der Access-Zugriffsliste außerhalb dieser App.

- **Neue eigene D1-Datenbank `BENUTZER_DB`** (`stationwizard-benutzer`,
  `worker/migrations/0004_benutzer.sql`), getrennt von `FAHRZEUGE_DB`, damit die
  Fachdomänen getrennt bleiben. Tabelle `benutzer`: `email` als Primärschlüssel, `rolle`
  (höchstens eine Hauptrolle oder `NULL`), `sonderrollen` als JSON-Array (aktuell nur
  `verwaltungshelfer`, absichtlich als Array für künftige weitere Sonderrollen ohne
  Schemaänderung), sowie erster/letzter Zugriff und wer die Rolle zuletzt geändert hat.
- **Sechs Hauptrollen** wie vom Auftraggeber benannt: Zugführung, Gruppenführung Sanität,
  Gruppenführung Betreuung, Gruppenführung TeSi, Gruppenführung Führung, Helfer. Die
  Sonderrolle Verwaltungshelfer ist unabhängig von der Hauptrolle kombinierbar.
- **`worker/src/benutzer.ts`**: `registriereZugriff()` merkt eine Anmeldung vor (erster
  Zugriff legt die Zeile an, jeder weitere aktualisiert nur den Zeitstempel) und wird
  best-effort aus dem bestehenden `GET /api/benutzer` aufgerufen — die Shell ruft diesen
  Endpunkt ohnehin einmal je Sitzungsstart ab, ein zusätzlicher Aufruf war nicht nötig. Ein
  Fehler dabei verhindert nicht die eigentliche Antwort. Neue Endpunkte
  `GET /api/benutzerverwaltung` (Liste) und `PUT /api/benutzerverwaltung/<E-Mail>` (Rolle
  setzen, 404 ohne vorherige Anmeldung).
- **Rollenvergabe ist vorerst jeder geprüften Identität möglich** — dieselbe
  Übergangslösung wie beim Löschen einer Ablesung im Fahrzeugmodul („Rechte vorerst alle,
  Rollen später"): es gibt noch keine Rolle, die eine Berechtigung dafür prüfen könnte,
  bevor diese Tabelle überhaupt existiert. Eine spätere Admin-Rolle soll dies einschränken.
- **Oberfläche** `src/app/benutzerverwaltung/pages/benutzer-liste/`, verlinkt als neue
  Kachel unter `/verwaltung/benutzer`: Liste aller bekannten Anmeldungen mit letztem
  Zugriff, Rollenauswahl und Sonderrollen-Checkbox je Person, Änderungen speichern sofort.
  Domäne (`src/app/benutzerverwaltung/models/`) und Persistenz
  (`storage/api-benutzerverwaltung-storage.ts`) strikt getrennt, analog zum Fahrzeugmodul.

**Offen und ausdrücklich nicht erledigt:** `BENUTZER_DB` in `worker/wrangler.toml` trägt
noch eine Platzhalter-`database_id`; die echte Datenbank ist **nicht** angelegt und die
Migration **nicht** angewendet (Befehle in `worker/README.md`, Abschnitt „Benutzerverwaltung
(D1)"). Ohne diesen Schritt liefert `/api/benutzerverwaltung*` bewusst 503 statt eines
Absturzes, und `/api/benutzer` funktioniert unverändert weiter, merkt sich den Zugriff aber
nicht vor.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (463 Angular-Tests,
351 Worker-Tests), `npm run format:check`, `npm run worker:test` und
`npm run deploy:dry-run` — alle grün; `deploy:dry-run` bestätigt das neue `BENUTZER_DB`-
Binding. `npm run test:spa` in dieser Runde nicht ausgeführt, weil unverändert wie zuvor
dokumentiert blockiert. Keine Browserprüfung in dieser Runde — die neue Seite wurde nicht
in `ng serve` gegen einen echten oder gemockten Worker geöffnet.

### Nachtrag in derselben Runde: echte D1-Datenbank angelegt

Der reale Deploy-Versuch (Cloudflare Workers Builds auf dem Feature-Branch) scheiterte
erwartungsgemäß mit `D1 binding 'BENUTZER_DB' references database
'00000000-0000-0000-0000-000000000000' which was not found` — die Platzhalter-`database_id`
existiert naturgemäß nicht. `deploy:dry-run` prüft das nicht, weil er nur lokal gegen die
Konfiguration validiert, nicht gegen das tatsächliche Cloudflare-Konto.

Die Datenbank wurde daraufhin angelegt (`stationwizard-benutzer`, `database_id`
`8d57d55d-8bd2-4701-bbbe-f25a4ee34fa9`), die Migration `0004_benutzer.sql` darauf
angewendet und `worker/wrangler.toml` mit der echten `database_id` aktualisiert. Kein
Bestand vorher, also keine Doubletten- oder Datenübernahmeprobleme. `worker/README.md`
entsprechend nachgezogen: der Abschnitt „Benutzerverwaltung (D1)" beschreibt jetzt den
erledigten Stand statt eines TODOs.

Nicht erneut ausgeführt in diesem Nachtrag: `npm test`/`build` (unverändert seit der
vorherigen Prüfung in dieser Runde, da nur `wrangler.toml`- und Dokumentationstext
geändert wurden) und keine erneute Browserprüfung.

## HiOrg-Kalender: vollständige Freigabe-URL wieder als Secret zugelassen

**Befund aus dem Betrieb.** `GET /api/hiorg/kalender?monat=2026-09` beantwortet der Worker
produktiv mit `502 / HIORG_KALENDER_ANTWORT_UNGUELTIG`. Das mit
„HiOrg-Kalender: Status/Content-Type/Content-Length bei unlesbarer Antwort loggen"
ergänzte Betreiberlog benennt die Ursache genau: HiOrg antwortet mit **Status 200 und
`Content-Type: text/html; charset=UTF-8`** – also mit einer Seite statt mit dem
JSON-Feed. Der anschließend mitgeschickte browsertypische `User-Agent` hat daran nichts
geändert; der Fehler blieb bestehen.

**Ursache.** Mit „HiOrg-Kalender: beide Zeitrichtungen statt fester Konfiguration" wurde
`HIORGSERVER_CALENDER_FEED` von der vollständigen Freigabe-URL auf den reinen
`lab`-Tokenwert umgestellt; Host, Pfad und die Parameterliste (`ov`, `termin`, `dienst`,
`auchint`, `zr_dienst`, `json`) baut der Worker seither selbst. Diese Liste ist aus einer
einzelnen Freigabe abgeleitet und durch keine HiOrg-Dokumentation belegt, und der Umbau
wurde nie gegen den echten Feed geprüft (das Secret liegt in der Entwicklungsumgebung
nicht vor). Passt die selbst gebaute Adresse nicht zur Einrichtung – oder steht im Secret
weiterhin die vollständige URL, die `pruefeLabToken()` mangels Steuerzeichen anstandslos
durchwinkte und als `lab`-Wert in die Adresse setzte –, liefert HiOrg genau die
beobachtete HTML-Seite. Die für die Umstellung dokumentierte Sperre
(`503 / HIORG_KALENDER_KONFIGURATION_FEHLT` bei einem URL-Secret) trat dabei nie ein.

**Korrektur.** `pruefeFeedZugang()` (`worker/src/hiorg-kalender.ts`) ersetzt
`pruefeLabToken()` und nimmt beide Formen an, erkannt an der Gestalt des Wertes:

- **Vollständige Freigabe-URL** (führend): der Worker ruft genau diese Adresse ab und
  ersetzt darin ausschließlich `monate`. Die je Anfrage passende Zeitrichtung aus der
  vorherigen Runde bleibt damit erhalten. Die URL muss `https:` sein, auf
  `hiorg-server.de` zeigen und darf weder Zugangsdaten im Ursprung noch ein Fragment
  tragen; sonst sperrt `503 / HIORG_KALENDER_KONFIGURATION_FEHLT` wie zuvor.
- **Reiner `lab`-Tokenwert**: unverändertes Verhalten über `FEED_URL_BASIS` und
  `FESTE_FEED_PARAMETER`.

Geheim sind der Tokenwert beziehungsweise die vollständige URL samt ihrer Query-Werte ab
`MIN_GEHEIM_LAENGE` (8 Zeichen). Kurze Schaltwerte (`1`, `biel`) bleiben bewusst außen
vor: sie stehen ohnehin in den öffentlichen Ereignis-Detaillinks und würden als
„Geheimnis" jeden Termin verwerfen, dessen Bezeichnung eine `1` enthält – dieselbe Klasse
Falsch-Positiv wie bei der früheren Prüfung der gesamten Antworthülle.

Das Betreiberlog zu `HIORG_KALENDER_ANTWORT_UNGUELTIG` nennt jetzt zusätzlich die
**Gestalt** des Secrets (`vollständige Freigabe-URL` / `lab-Tokenwert`, nie den Wert) und
weist bei `text/html` ausdrücklich darauf hin, dass HiOrg eine Seite statt JSON liefert.

`CLAUDE.md`, `worker/README.md` und `docs/einrichtung.md` beschreiben wieder beide
zulässigen Secret-Formen; die feste Parameterliste ist dort ausdrücklich als nicht
nachgewiesen gekennzeichnet.

**Bewusst offen geblieben:** Ohne Zugriff auf den echten Feed lässt sich hier nicht
entscheiden, welcher der beiden möglichen Auslöser produktiv zutrifft (URL noch im Secret
oder abweichende Feed-Parameter). Beide führen auf denselben Weg: die vollständige
Freigabe-URL ins Secret eintragen. Ein Abruf gegen `www.hiorg-server.de` ist aus dieser
Umgebung netzseitig gesperrt (`connect_rejected`), ein Nachweis am echten Feed steht
deshalb weiterhin aus.

Geprüft: `npm run worker:check`, `npm run worker:test` (361 Worker-Tests, darunter neun
neue Fälle für die URL-Form: exakte Zieladresse mit ersetztem `monate`, keine Ergänzung
der festen Parameter, Sperre bei fremdem Host/fehlendem TLS/Zugangsdaten im
Ursprung/unlesbarer Adresse, gespiegelter Tokenwert, kurze Schaltwerte als Falsch-Positiv),
`npm run build`, `npm test` (478 Angular-Tests, 361 Worker-Tests),
`npm run format:check` und `npm run deploy:dry-run` – alle grün. Keine Browserprüfung: die
Änderung liegt vollständig im Worker und ändert die Client-Antwort nicht.
`npm run test:spa` bleibt wie zuvor dokumentiert blockiert.

### Nachtrag: Adresse zeichengenau übernehmen, Einfügefehler abfangen, Ziel benennen

Rückmeldung aus dem Betrieb nach dem Deploy der vorstehenden Runde: **unverändert**. Der
Abgleich gegen den ausgelieferten Worker bestätigt, dass die Korrektur live ist (das
Bundle enthält `pruefeFeedZugang()`, `benenneZugang()` und `istHtml()`); die HTML-Antwort
kommt also weiterhin. Die erneute Prüfung der eigenen Umsetzung fand drei Wege, auf denen
sie eine technisch gültige, fachlich aber falsche Adresse erzeugt – jeweils mit genau
diesem Symptom:

- **Neuserialisierung der Freigabe-URL.** `baueZielUrl()` schrieb `monate` über
  `URLSearchParams.set()`. Dieser Schreibvorgang serialisiert den **gesamten**
  Anfrage-String neu: `~` wird zu `%7E`, `/` und `=` in Werten werden kodiert, ein
  Leerzeichen wird zu `+`. Bei einer Adresse, die selbst das Zugangsdatum ist, darf nur
  geändert werden, was geändert werden muss. `setzeMonate()` ersetzt jetzt textuell genau
  das Paar `monate=…` (und hängt es nur an, wenn die Adresse es nicht führt); außerdem
  merkt sich `pruefeFeedZugang()` die unveränderte Zeichenfolge statt `url.href`.
- **HTML-maskiert eingefügter Link.** `…?ov=biel&amp;lab=…` ist eine gültige URL – mit den
  Parametern `ov` und `amp;lab`, also **ohne** `lab`. Da HiOrg Adressen escaped ausgibt
  (der Feed selbst liefert `&amp;` in den Ereignis-Links, siehe `bereinigeEreignisUrl()`),
  ist das ein naheliegender Einfügefehler. Die Entitätendekodierung ist jetzt eine
  gemeinsame Hilfe und läuft auch über die konfigurierte Adresse – nicht über einen reinen
  Tokenwert, der dadurch verfälscht würde.
- **Umschließende Leerzeichen/Zeilenumbrüche** aus der Zwischenablage sperrten den Zugang
  mit 503 statt benutzt zu werden; sie werden jetzt entfernt. Steuerzeichen **innerhalb**
  des Wertes sperren weiterhin.

Damit die nächste Fehlermeldung die Ursache selbst benennt, nennt das Betreiberlog bei
unlesbarer Antwort zusätzlich **Host, Pfad und die Namen der gesendeten Parameter** (nie
deren Werte; Namen stehen ohnehin im Quellcode). Fehlt dort ein Parameter der Freigabe –
etwa `lab` –, steht eine unvollständige Adresse im Secret; stimmt die Liste und HiOrg
antwortet trotzdem mit HTML, bleiben nur noch eine abgelaufene oder zurückgezogene Freigabe
beziehungsweise eine Abweisung des Worker-Abrufs durch HiOrg.

**Weiterhin offen und ehrlich zu benennen:** Keiner dieser drei Wege ist belegt, sondern
nur möglich – ein Abruf gegen den echten Feed ist aus dieser Umgebung netzseitig gesperrt
(`connect_rejected`), und die Logzeile aus dem Betrieb stammt noch aus der Fassung **vor**
der Korrektur. Die entscheidende Auskunft liefert die nächste Zeile zu
`HIORG_KALENDER_ANTWORT_UNGUELTIG`: sie nennt jetzt die Gestalt des Secrets und die
tatsächlich gesendeten Parameternamen.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (478 Angular-Tests,
366 Worker-Tests, darunter fünf neue Fälle: zeichengenaue Adresse mit `+ / = ~ ( ) '` im
Tokenwert, `monate` nur angehängt wenn nicht vorhanden, HTML-maskierte Adresse, Secret mit
umschließenden Leerzeichen, Ziel-/Parameternamen im Log ohne Werte), `npm run worker:test`,
`npm run format:check` und `npm run deploy:dry-run` – alle grün. Keine Browserprüfung
(reine Worker-Änderung, Client-Antwort unverändert); `npm run test:spa` bleibt wie zuvor
dokumentiert blockiert.

## Wochenraster: Tageszellen gedeckelt, HiOrg-Ebene verdichtet

**Ausgangslage:** Eine Kalenderwoche ist **eine** Gitterzeile
(`grid-auto-rows: minmax(72px, 1fr)`, `align-items: stretch`). Ihre Höhe richtete sich
nach dem vollsten Tag, und die Zahl der Karten pro Tag war nach oben offen: Plantermine
und die vollständige HiOrg-Ebene stapelten sich ungedeckelt übereinander. Ein Tag mit
zehn Diensten zog die ganze Woche auf mehrere hundert Pixel, und weil die Zellen
mitwuchsen, spannten Lücken- und Abweichungsmarkierung ihre Farbflächen über die volle
Zeilenhöhe – sechs leere Nachbartage erschienen als große farbige Blöcke.

**Deckelung je Tag.** `services/tages-inhalt.ts` stellt die Karten einer Tageszelle
zusammen und begrenzt sie auf `MAX_KARTEN_PRO_TAG` (3). Ist mehr da, bleiben zwei Karten
stehen und der Rest steckt hinter „+N weitere". Gekürzt wird nach Rang, nicht nach
Reihenfolge: mehrtägige Plantermine zuerst (ein fehlendes Segment risse den Balken mitten
in der Woche ab), dann eintägige Plantermine, dann HiOrg-Einträge mit Namensabweichung,
zuletzt die übrigen HiOrg-Einträge. Die _Anzeige_ behält die Tagesreihenfolge; nur die
Auswahl richtet sich nach dem Rang.

**Tagesdetail.** `components/tag-detail/` zeigt den ganzen Tag in voller Kartenbreite –
ohne Sammelkarte und ohne Deckelung, mit denselben Aktionen wie im Raster. Erreichbar über
„+N weitere", über die HiOrg-Sammelkarte und über ein Symbol in der Tageszeile. Der Dialog
führt nichts selbst aus, sondern gibt die gewählte Aktion als `TagDetailErgebnis` zurück;
Store, Rückgängig, Bestätigungen und Meldungen bleiben im Jahresplan.

**HiOrg-Ebene verdichtet.** Ein Schalter in der Plan-Kopfzeile stellt die Ebene auf
`einzeln`, `gesammelt` (Voreinstellung) oder `aus`. Gesammelt fasst die unauffälligen
Einträge eines Tages zu einer Karte „HiOrg · N Einträge" zusammen, die das Tagesdetail
öffnet; ab zwei Einträgen lohnt das, für einen einzelnen bleibt die normale Karte.
Einträge mit Namensabweichung werden **nie** eingesammelt – sie sind die
Handlungsaufforderung. Das entspricht der Rollenverteilung: Excel ist die führende
Ausbildungsquelle, der Kalenderfeed bleibt Anzeige- und Abgleichquelle. Die Einstellung
gilt nur für die Sitzung und wird nirgends persistiert.

**Markierungen am Inhalt statt an der Zelle.** Lücke und HiOrg-Abweichung sitzen jetzt auf
einem inneren `.tag-inhalt`, der den Inhalt umschließt, statt auf der gestreckten Zelle.
Zwei weitere Layoutfehler derselben Gegend sind mitbehoben: die Leerzustands-Klasse `.leer`
des Rasters heißt jetzt `.raster-leer`, weil die leere Ablagefläche einer Tageszelle
dieselbe Klasse trug und deren großes Polster erbte (tote Fläche über jeder HiOrg-Karte);
und diese Ablagefläche steht jetzt **unter** den Karten, weil sie ohne Feiertag oder Lücke
nur ein Hover-„+" ist und die Karten sonst von der Tageszahl wegschob. Auf schmalen
Displays zeigt die Sammelkarte nur Wolkensymbol und Zahl, sonst bliebe in einer
64px-Spalte nur ein Ellipsenrest.

Gemessen im Browser (Testdaten, September 2026 mit einem Tag zu zehn Einträgen):
Zeilenhöhe vorher vom vollsten Tag getrieben, nachher gleichmäßig 156 px bei einem
maximalen Zellinhalt von 154 px; kein waagerechter Seitenscroll auf 1600 px und 390 px.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm test`, `npm run format:check`
– alle grün, dazu zwölf neue Tests (neun für die Deckelungs- und Sammellogik in
`tages-inhalt.spec.ts`, drei für den Tagesinhalt im Jahresplan). Browserprüfung mit
Chromium über Playwright auf **Desktop (1600×1000)** und **Mobil (390×844)** tatsächlich
ausgeführt: Deckelung, Sammelkarte, Tagesdetail, Ebenenschalter und Zellhöhen wie
beschrieben, keine Konsolenfehler außer den erwarteten 503ern der abgeschalteten
API-Routen. Der HiOrg-Feed kam dabei aus der abgefangenen Route mit
`public/testdaten/hiorg-kalender-mock.json`; ein Lauf gegen echte HiOrg-/Nextcloud-Daten
hat **nicht** stattgefunden. Worker und Routing sind unverändert, deshalb kein neuer
`test:spa`-/`deploy:dry-run`-Lauf; `test:spa` bleibt wie zuvor dokumentiert blockiert.

**Dabei aufgefallen, nicht behoben:** Im Entwicklungsbuild überschreibt die fehlschlagende
echte Feed-Abfrage die über „HiOrg-Testdaten laden" geladenen Einträge wieder (Status
springt auf „HiOrg-Fehler", das Raster bleibt leer). Das besteht unabhängig von dieser
Änderung – der Ausgangsstand verhält sich identisch – und betrifft nur den Testdatenweg.

## Rückweg aus der Kilometererfassung

Die Kilometererfassung (`src/app/fahrzeuge/pages/km-erfassung/`) war die einzige
Fahrzeugseite ohne sichtbaren Rückweg: Wer sie über Fahrzeugliste oder Fahrzeugdetail
öffnete, kam nur über die Browser-Zurück-Taste wieder heraus; nach dem Speichern bot der
Erfolgszustand ausschließlich „Weitere Ablesung erfassen" an.

Sie hat jetzt dieselbe Kopfleiste wie `fahrzeug-detail` und `fahrzeug-import`
(`mat-toolbar` mit `.kopfleiste-basis()` aus `kern/kopfleiste.less`): links ein
`arrow_back`-Icon-Link mit `aria-label="Zurück zur Fahrzeugliste"` auf
`/fahrzeuge/liste`, daneben der Titel „Kilometerstand erfassen". Die Leiste steht
außerhalb der Lade-/Fehlerverzweigung, der Rückweg besteht also auch dann, wenn das
Fahrzeug gar nicht geladen werden konnte. Zusätzlich führt im Erfolgszustand ein
„Zurück zur Fahrzeugliste"-Link neben „Weitere Ablesung erfassen" dorthin – der
übliche Abschluss nach einer QR-Erfassung. Keine Route, kein Vertrag und kein
Speicherpfad wurden geändert.

Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (492 Angular- und
385 Worker-Tests) und `npm run format:check` – alle grün. Browserprüfung mit Chromium
über Playwright gegen `ng serve` tatsächlich ausgeführt, auf **Desktop (1280×900)** und
**Mobil (390×844)**: Kopfleiste und Rückpfeil erscheinen in beiden Breiten, ein Klick
darauf landet auf `#/fahrzeuge/liste`, und der Erfolgszustand zeigt beide Schaltflächen
untereinander. Die Fahrzeug- und Ablesungsantworten kamen dabei aus abgefangenen Routen
mit erfundenen Testdaten; ein Lauf gegen echte Nextcloud-/HiOrg-Daten oder eine
produktive Google-Sitzung hat **nicht** stattgefunden. Worker und Routing sind
unverändert, deshalb kein neuer `test:spa`-/`deploy:dry-run`-Lauf; `test:spa` bleibt wie
zuvor dokumentiert blockiert.

## Fahrzeug-QR-Übersichtsbogen für die Zugführung

Fachlicher Wunsch: ein druckbarer Übersichtsbogen mit dem Kilometererfassungs-QR-Code
jedes Fahrzeugs (zwei je Zeile, Funkrufname und Kennzeichen als Text daneben), erreichbar
aus dem Verwaltungsbereich und nur für die Rolle Zugführung sichtbar.

- `FahrzeugDruckbogenService.erzeugeUndSpeichereUebersicht()` (neue Methode neben dem
  bestehenden `erzeugeUndSpeichere()` für den Einzelbogen): sortiert die übergebene
  Fahrzeugliste nach Bezeichnung, erzeugt für jedes Fahrzeug nur den
  Erfassungs-QR-Code (`.../km`, nicht den Übersichts-Code – hier zählt der schnelle Weg
  zum Formular), und baut daraus eine pdfmake-Tabelle mit zwei Spalten
  (`layout: 'lightHorizontalLines'` als Zeilentrennung), ungerade Fahrzeuganzahl bekommt
  eine leere Schlusszelle. Die gemeinsame `ladePdfMake()`-Hilfsfunktion (dynamischer
  Import von `pdfmake` und `vfs_fonts`) ist aus dem Einzelbogen herausgezogen, damit
  beide Methoden sie teilen.
- **Bewusst kein Kennzeichen im QR-Inhalt selbst**, obwohl fachlich gewünscht: der
  QR-Code bleibt die reine Ziel-URL ohne zusätzliche Kennung (siehe Konzept, Abschnitt 4,
  „kein Token im Code“) – ein eingebettetes Kennzeichen hätte den gedruckten Code aus
  einem reinen Weiterleitungsaufkleber in einen Träger echter Fachdaten verwandelt, ohne
  dass die Erfassungsseite ihn bräuchte (sie kennt das Fahrzeug schon über die UUID in der
  Ziel-URL). Kennzeichen und Funkrufname stehen stattdessen als Text über jedem Code.
- **Erste UI-Sichtbarkeitsprüfung nach Rolle im Verwaltungsbereich.** Der Bereich hatte
  bisher ausdrücklich kein Rollenmodell (siehe Abschnitt „Verwaltungsbereich mit
  CSV-Stammdatenimport“ oben). Für dieses eine Feature reicht das nicht: es soll nur die
  Zugführung sehen. Dafür `BenutzerverwaltungStoreService.eigeneRolle` /
  `.istZugfuehrung` ergänzt – ein `computed()`, das die bereits geladene Benutzerliste
  (`GET /api/benutzerverwaltung`, ohnehin für jede angemeldete Person abrufbar) mit der
  eigenen, über `Benutzerkontext.email()` geprüften Access-Identität abgleicht.
  **Ausdrücklich kein Zugriffsschutz**, nur eine Einblendregel: es gibt keine
  serverseitige Durchsetzung, der Aufruf bleibt technisch für jede angemeldete Person
  möglich. Das deckt sich mit der bestehenden Aussage in CLAUDE.md „Rechte vorerst alle,
  Rollen später“ – eine echte Durchsetzung ist damit weiterhin offen.
- `VerwaltungStartseite` lädt beim Aufbau `BenutzerverwaltungStoreService.listeLaden()`
  und blendet bei `istZugfuehrung()` eine dritte Kachel ein (als `<button>` statt `<a>`,
  da sie direkt herunterlädt statt zu navigieren – `.aufgabe`-Klasse wiederverwendet,
  Browser-Default `text-align: center` für `<button>` explizit auf `left` zurückgesetzt).
  Klick lädt bei Bedarf die Fahrzeugliste (`FahrzeugStoreService.listeLaden()`) und ruft
  den neuen Druckbogendienst auf; „keine Fahrzeuge vorhanden“ und ein fehlgeschlagener
  PDF-Aufbau werden als Fehlertext in der Kachel angezeigt, kein stiller Fehlschlag.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (499 Angular- und
  385 Worker-Tests, unverändert da kein Worker-Code betroffen) und `npm run format:check`
  – alle grün. Browserprüfung mit Chromium über Playwright gegen `ng serve` tatsächlich
  ausgeführt, auf **Desktop (1280×900)** und **Mobil (390×844)**: ohne erreichbaren
  Worker bleibt `istZugfuehrung()` `false` (Liste lädt nicht), die neue Kachel blieb
  dabei korrekt ausgeblendet und die Seite fehlerfrei (keine Konsolenfehler). Um das
  eingeblendete Aussehen, die Textausrichtung und den Fehlerzustand zu prüfen, wurde
  `istZugfuehrung` lokal vorübergehend hart auf `true` gesetzt, fotografiert (Kachel
  erscheint layoutgleich zu den bestehenden, Klick zeigt „Es sind keine Fahrzeuge
  vorhanden.“ in Rot) und die Änderung danach vollständig rückgängig gemacht – nicht
  Teil des Commits. Ein Lauf mit echter Cloudflare-Access-Sitzung und echten
  Fahrzeugdaten (tatsächlich sichtbarer QR-Bogen mit realen Kennzeichen) hat **nicht**
  stattgefunden; das bleibt für eine Prüfung mit angebundenem Worker offen.

## Nachtrag – Kennzeichen-Chip in der Kilometerbilanz

Fachlicher Wunsch: In der Kilometerbilanz auf dem Fuhrpark-Dashboard soll neben der
Bezeichnung auch das Kennzeichen sichtbar sein.

- `fahrzeug-dashboard.html`: Der Kopf jeder Bilanzkarte fasst Bezeichnung und Kennzeichen in
  `.bilanz-karte-titel` zusammen; das Kennzeichen erscheint als `tag-chip tag-zusatz`, also
  in derselben Chipform wie schon auf der QR-Erfassungsseite, statt einer zweiten
  Darstellungsvariante. Ein leeres Kennzeichen (weiterhin zulässig, siehe partieller
  eindeutiger Index) blendet den Chip aus, es entsteht kein leerer Chip.
- `fahrzeug-dashboard.less`: `.bilanz-karte-titel` bricht bei schmalen Karten um
  (`flex-wrap`), damit der Chip in der 240px-Rasterspalte unter die Bezeichnung rutscht statt
  sie zu quetschen; der Kartenkopf richtet seine Teile jetzt oben aus (`flex-start`), sonst
  hing das Eigentümer-Abzeichen bei umgebrochenem Titel auf halber Höhe.
- Die Detailseite bleibt unverändert: Dort steht das Kennzeichen bereits im Stammdatenblock
  direkt über der Bilanz. Die gemeinsame Komponente `kilometer-bilanz` kennt weiterhin nur die
  `KilometerJahresbilanz` und kein Fahrzeug.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test` (492 Angular- und
  385 Worker-Tests), `npm run format:check`, `npm run deploy:dry-run` – alle grün. Keine neuen
  Tests: die Änderung ist rein darstellend, die Bilanzlogik selbst ist unverändert.
  Browserprüfung mit Chromium über Playwright auf **Desktop (1280×900)** und
  **Mobil (390×844)** tatsächlich ausgeführt, `ng serve` mit abgefangenen `/api/*`-Routen und
  erfundenen Testfahrzeugen: Chip erscheint bei gesetztem Kennzeichen, fehlt beim Fahrzeug
  ohne Kennzeichen, Umbruch und Ausrichtung wie beschrieben. Ein Lauf gegen echte
  Nextcloud-/HiOrg-Daten oder eine produktive Google-Sitzung hat **nicht** stattgefunden.
  Worker und Routing sind unverändert, deshalb kein neuer `test:spa`-Lauf; dieser bleibt wie
  zuvor dokumentiert blockiert.

## AP-S1 – Systemkonfiguration und Kilometerstandsbericht per E-Mail

Neuer Verwaltungspunkt **Systemkonfiguration** (`/verwaltung/systemkonfiguration`) und ein
Kilometerstandsbericht, der von dort aus per E-Mail verschickt wird.

- **Systemkonfiguration** ist ein Schlüssel-Wert-Speicher in `BENUTZER_DB`
  (`worker/migrations/0005_systemkonfiguration.sql`) hinter `GET/PUT /api/systemkonfiguration`.
  Der Vertrag steckt nicht in der Tabelle, sondern in der festen Liste `EINSTELLUNGEN` in
  `worker/src/systemkonfiguration.ts`: ein unbekannter Schlüssel wird abgelehnt, nie
  gespeichert. Es stehen dort **keine Zugangsdaten** – alles in der Tabelle ist über die API
  lesbar. Ein gespeicherter Wert, der heute nicht mehr gültig ist, fällt beim Lesen auf den
  Standard zurück.
- **Mailversand** (`worker/src/mail-versand.ts`) ist ein Vertrag mit zwei Adaptern, wie
  abgestimmt: `email-routing` über das `send_email`-Binding und `resend` über einen festen
  HTTPS-Endpunkt. Keine konfigurierbare Ziel-URL. SMTP ist in Workers nicht möglich.
  `GET /api/systemkonfiguration` meldet je Weg nur ein Ja/Nein zur Verfügbarkeit, damit die
  Oberfläche einen nicht eingerichteten Weg benennen kann, statt den Versand erst beim
  Absenden scheitern zu lassen – keine Bindingliste, keine Secretnamen, keine Längen.
  Upstream-Antworten werden nie weitergereicht (`MAIL_VERSANDWEG_NICHT_EINGERICHTET`,
  `MAIL_VERSAND_FEHLGESCHLAGEN`); im Betreiberlog steht nur Status beziehungsweise
  Fehlername, nie Empfänger oder Token.
- **Bericht** (`worker/src/km-bericht.ts`, `GET /api/fahrzeuge/km-bericht` als Vorschau,
  `POST …/senden` als Versand). Je Fahrzeug: letzter gültiger Stand, Ablesedatum, Abstand
  zum Stichtag und Jahresbilanz gegen die Mindestlaufleistung. Korrigierte Ablesungen
  bleiben draußen, wie im Fahrzeugdetail. Der Stichtag ist ein Berliner Kalendertag, nie
  über UTC gerechnet. Mail und Vorschau zeigen dieselben Zahlen, weil beide aus derselben
  Berechnung stammen; die Oberfläche rechnet nichts nach.
- **Bewusst kein Zeitplan**: der Versand wird nur von Hand ausgelöst. Damit gibt es auch
  keinen Cron-Trigger und keinen Pfad, der am Access-Gate vorbeiliefe.
- Der Versand verlangt einen Bestätigungsdialog mit der konkreten Adresse und bezieht sich
  ausschließlich auf den **gespeicherten** Stand – ein ungespeicherter Entwurf wirkt nicht.
  Ungespeicherte Eingaben melden sich am gemeinsamen `VerlassenSchutz`; ein erneutes Laden
  überschreibt sie nicht.
- Geprüft: `npm run build` (einschließlich `worker:check`), `npm test`
  (**536 Angular-Tests in 67 Dateien**, **421 Worker-Tests in 10 Dateien**),
  `npm run format:check` und `npm run deploy:dry-run` – alle grün.
- **Browserprüfung durchgeführt** (Chromium über Playwright gegen `ng serve`, alle
  `/api/*`-Antworten lokal abgefangen mit ausschließlich erfundenen Fahrzeugen; kein echter
  Worker und kein echter Mailversand). Desktop 1440×900 und Mobil 390×844: Speichern ist
  gesperrt, solange nichts geändert wurde, „Verwerfen" setzt das Feld zurück, der
  Bestätigungsdialog erscheint und ein Abbruch löst keinen Versand aus, die Bestätigung
  genau einen; danach steht die Quittung auf der Seite. Kein waagerechter Seitenscroll in
  beiden Breiten, die Berichtstabelle scrollt mobil in ihrem eigenen Bereich, keine
  Konsolenfehler. Zwei Darstellungsfehler kamen dabei ans Licht und wurden behoben (der
  dreizeilige Hinweis unter „Versandweg" überlappte die Knöpfe – fehlendes
  `subscriptSizing="dynamic"`; Zahlen und Daten standen unformatiert statt wie im Mailtext).

### Offene Abnahmegrenzen von AP-S1

- **Ein echter erfolgreicher Mailversand über Resend steht noch aus.** `MAIL_ABSENDER` und
  `MAIL_API_TOKEN` sind inzwischen im Secrets Store angelegt und die zugehörigen
  `[[secrets_store_secrets]]`-Blöcke in `worker/wrangler.toml` aktiviert (`deploy:dry-run`
  bestätigt, dass beide Bindings aufgelöst werden). Ein erster echter Versandversuch über den
  Reiter „Kilometerübersicht" endete jedoch mit `502 / MAIL_VERSAND_FEHLGESCHLAGEN` („Der
  Mailanbieter war nicht erreichbar."). Der `fetch()`-Catch in `ResendVersand.sende()`
  (`worker/src/mail-versand.ts`) protokollierte dabei nichts, sodass sich eine echte
  Nichterreichbarkeit nicht von einem ungültigen `Authorization`-Header unterscheiden ließ –
  etwa durch ein aus dem Cloudflare-Dashboard kopiertes Token mit angehängtem Zeilenumbruch,
  was `fetch()` mit einem `TypeError` scheitern lässt, bevor überhaupt eine Verbindung
  aufgebaut wird. Behoben: `MAIL_API_TOKEN` wird jetzt wie `MAIL_ABSENDER` getrimmt, und der
  Catch loggt Fehlerklasse und -text redigiert über `ursachenText()`/`redigiere()` (gleiches
  Muster wie `efs.ts`/`nextcloud.ts`), siehe `worker/tests/mail-versand.spec.ts`. Ob damit
  bereits die tatsächliche Ursache behoben ist oder der nächste Versuch eine andere,
  jetzt sichtbare Fehlerursache zeigt, ist nach diesem Fix noch nicht erneut geprüft.
- Email Routing (`send_email`) bleibt weiterhin auskommentiert ausgeliefert, da nicht
  eingerichtet (keine bestätigte Zieladresse in Cloudflare Email Routing). Der
  Einrichtungsweg (erst Secret anlegen beziehungsweise Email Routing einrichten und die
  Zieladresse bestätigen, dann den Block aktivieren, dann deployen) steht in
  [Einrichtung](einrichtung.md) und im [Worker-README](../worker/README.md). Ein Binding auf
  ein im Store nicht vorhandenes Secret bricht `wrangler deploy` ab und hätte das Deployment
  des gesamten Workers an eine noch nicht bestehende Einrichtung gekoppelt – deshalb bleibt
  ungenutzten Wegen ihr Block auskommentiert, bis die Einrichtung nachgeholt ist.
- Die Migration `0005_systemkonfiguration.sql` wurde am 2026-09-15 auf der produktiven
  `stationwizard-benutzer`-Datenbank angewendet (`CREATE TABLE systemkonfiguration`
  verifiziert); zuvor antwortete die Seite mit `SYSTEMKONFIGURATION_DB_FEHLER`.
- Die Kennzahlenlogik liegt doppelt vor: `worker/src/km-bericht.ts` bildet
  `src/app/fahrzeuge/services/kilometer-soll.ts` nach, weil das Worker-Bundle bewusst keine
  Anwendungsquellen zieht. `worker/tests/km-bericht.spec.ts` spiegelt die Fälle der dortigen
  Tests; die beiden Fassungen sind gemeinsam zu ändern.
- Rollenprüfung fehlt weiterhin: jede geprüfte Identität kann Einstellungen ändern und den
  Bericht versenden („Rechte vorerst alle, Rollen später").
- `npm run test:spa` bleibt wie zuvor dokumentiert blockiert.
- Node 24 stand nicht zur Verfügung; alle Läufe erfolgten unter Node 22.22.2 mit npm 11.

### Nachtrag – Versand in eigenen Reiter, Einstellungen ins Email-Versand-Menü

Vorschau und Versand standen bisher zusammen mit den Versandeinstellungen auf der
Systemkonfigurationsseite; das war fachlich nicht gewollt (Versand ist eine
Fahrzeug-Tagesaufgabe, keine Betriebseinstellung). Aufgeteilt:

- Neuer Reiter **„Kilometerübersicht"** im Fahrzeug-Dashboard (`KilometerUebersicht`,
  `src/app/fahrzeuge/pages/kilometer-uebersicht/`) übernimmt Vorschau, Sendebestätigung und
  den „Bericht jetzt senden"-Button. Er liest die gespeicherten Einstellungen nur noch
  (`SystemkonfigurationStoreService.gespeicherteEinstellungen`), ändert sie nicht.
- Die Systemkonfigurationsseite behält ausschließlich Empfänger, Betreff und Versandweg,
  jetzt unter einem Menü-Reiter **„Email Versand"** (`mat-tab-group` mit vorerst einem
  Eintrag, Platz für künftige weitere Einstellungsbereiche).

**Browserprüfung durchgeführt** (Chromium über Playwright gegen `ng serve`, alle `/api/*`-
Antworten lokal abgefangen mit ausschließlich erfundenen Fahrzeugen; kein echter Worker).
Desktop 1440×900 und Mobil 390×844: beide Reiter erreichbar, Tab-Leiste scrollt mobil
horizontal in ihrem eigenen Bereich (wie beim Wochenraster), die Berichtstabelle bleibt
lesbar, keine Konsolenfehler. Ein Darstellungsartefakt (sich überlappende Tab-Inhalte beim
Wechsel) erwies sich als Fehler im Testskript selbst (per `addInitScript` erzwungenes
Abschalten der Tab-Animation griff vor Angulars eigener Sichtbarkeitssteuerung) und nicht als
Anwendungsfehler – mit normaler Animation und ausreichender Wartezeit verschwand es.
