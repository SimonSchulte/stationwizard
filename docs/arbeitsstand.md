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
- Remote: GitHub-Verbindung stexeflex hat keine Schreibrechte auf
  SimonSchulte/stationwizard; bisher keine PRs, kein Push, kein Deployment.

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
