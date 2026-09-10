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
`https://www.hiorg-server.de/termin.php?id=<id>` (Typ `termin`) beziehungsweise
`https://www.hiorg-server.de/dienstform.php?action=show_existing&id=<id>` (Typ `dienst`).
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
