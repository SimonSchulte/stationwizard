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

Lokale Builds und Tests ersetzen keine Produktionsabnahme. Google-Zugriffsliste,
Hostname, DNS-/Mail-Bestand, Cloudflare-Team/AUD sowie echte Nextcloud-/EFS-Verbindungen
sind vom Auftraggeber noch bereitzustellen bzw. zu prüfen. Keine Altrepositories
archivieren, bevor der Ersatz abgenommen ist.

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

## GitHub-Übergabe

Alle sechs AP-Stände liegen als Branches und Commits vor. Der vom Auftraggeber erstellte
Fork [stexeflex/stationwizard](https://github.com/stexeflex/stationwizard) ist für die
verbundene Identität beschreibbar und enthält die AP-Branches für die Übergabe. Der Upload
über die GitHub-API erzeugt neue Remote-Commits; die früher angegebenen Kennungen bleiben
lokale Prüfcommits. Für jeden AP ist die Übereinstimmung des Inhaltsbaums maßgeblich.

Die anschließende PR-Erstellung im Original `SimonSchulte/stationwizard` wurde mit
HTTP 403 (`Resource not accessible by integration`) abgewiesen. Es wurden noch keine
Remote-PRs erstellt. Fehlende Schreibrechte am Original verhindern grundsätzlich keine
Fork-Pull-Requests; die eingesetzte GitHub-Anbindung darf diese konkrete API-Aktion dort
jedoch nicht ausführen. Die sechs PRs können über die
[Vergleichslinks und Beschreibungen](pull-requests.md) mit dem persönlichen GitHub-Login
im Browser erstellt werden.

Ein Merge auf `main` und Infrastrukturänderungen wurden noch nicht vorgenommen.
GitHub-Prüfungen und Review sind von den oben dokumentierten lokalen Prüfläufen zu
unterscheiden.

## Nextcloud-Diagnose im Deployment (offen)

Im `main`-Deployment beantwortet `GET /api/nextcloud/arbeitsmappe` den Ladeversuch mit
`X-Stationwizard-Diagnose: NEXTCLOUD_NICHT_ERREICHBAR`. Der Code fasste bisher zwei
verschiedene Ursachen zusammen: eine nicht verfolgte Weiterleitung und einen echten
Transportfehler. Der Worker fragt jetzt mit `redirect: 'manual'` an, folgt weiterhin
keiner Weiterleitung und meldet `3xx`-Antworten getrennt als `NEXTCLOUD_UMLEITUNG`.
Ziel, Inhalt und Header der Weiterleitung werden verworfen.

Damit unterscheidet die nächste Deployment-Prüfung zwei Fälle:

- `NEXTCLOUD_UMLEITUNG`: `NEXTCLOUD_BASE_URL` ist nicht die kanonische Adresse der
  Installation. Prüf- und Korrekturschritte stehen im [Worker-README](../worker/README.md).
- `NEXTCLOUD_NICHT_ERREICHBAR`: Verbindung, DNS, TLS oder eine IP-Beschränkung der
  Nextcloud-Instanz gegenüber dem Cloudflare-Netz.

Geprüft wurden `npm run worker:check`, `npm run worker:test`, `npm run build`, `npm test`
und `npm run format:check`. Die eigentliche Ursache im Deployment ist damit noch nicht
bestimmt; sie ergibt sich erst aus dem nächsten Ladeversuch gegen die echte Instanz.

Erste Messung an der echten Instanz: `curl -Is` auf den öffentlichen WebDAV-Endpunkt
antwortet mit `401` und `WWW-Authenticate: Basic realm="Nextcloud"`. Endpunkt, DNS und TLS
sind von außen also in Ordnung, und es gibt dort keine Weiterleitung. App-Zone und
Nextcloud-Zone sind verschieden, eine Same-Zone-Einschränkung scheidet damit aus. Der
Fehler entsteht folglich erst im Subrequest aus dem Cloudflare-Netz. Damit dessen Ursache
überhaupt sichtbar wird, protokolliert der Worker sie jetzt redigiert im eigenen Log.
Die konkrete Ursache ist weiterhin offen und braucht einen Ladeversuch mit `wrangler tail`.
