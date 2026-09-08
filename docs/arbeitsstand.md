# Arbeitsstand

## AP1 – Gerüst und Übernahme

- Angular 21.2.22, Material/CDK 21.2.14, Build/CLI 21.2.23; standalone, zoneless, strict.
- Beide Fachbereiche mit Lazy-Routen, gemeinsamer Shell, lokal ausgelieferten Schriften.
- Alle 58 Fachtests erhalten; zwei PEP-App-Tests auf tatsächliche gemeinsame Shell angepasst
  (der alte Titeltest erwartete eine nicht mehr vorhandene Angular-Willkommensseite).
- Ergebnis: Produktionsbuild erfolgreich, Vitest 9 Dateien / 60 Tests bestanden.
- Reale Fahrzeugstammdaten nicht übernommen; freie Eingabe bleibt möglich.
- Quelle enthält nur 9 medizinische Enumwerte, entgegen 12 Werten im Auftrag.
  AP1 bewahrt den Quellstand; gezielte Angleichung im Fachtest folgt.
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
