# stationwizard-Worker

Der Worker liefert die Angular-SPA und gleichartige `/api/*`-Endpunkte unter einer
Origin aus. Jeder Aufruf durchläuft die serverseitige Access-JWT-Prüfung, auch
JavaScript, Bilder und SPA-Direkteinstiege. Ohne vollständige Access-Konfiguration
bleibt der Worker geschlossen.

## Konfiguration

`wrangler.toml` bindet `../dist/stationwizard/browser` als `ASSETS` ein.
`run_worker_first = true` führt die Anmeldung vor **jedem** Assetabruf aus.
`not_found_handling = "single-page-application"` liefert die `index.html` für
SPA-Direkteinstiege. Unbekannte `/api/*`-Endpunkte werden vorher mit JSON und HTTP
404 beantwortet; sie landen niemals in der SPA.

Die beiden folgenden **Laufzeitvariablen** müssen am Worker gesetzt werden:

| Name                 | Wert                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `ACCESS_TEAM_DOMAIN` | `https://<teamname>.cloudflareaccess.com`, ohne abschließenden `/` |
| `ACCESS_AUD`         | Application Audience (AUD) Tag der geschützten Access-Anwendung    |

Cloudflare: **Worker → Settings → Variables and Secrets**. Die gleichnamige Karte
unter **Build** stellt keine Laufzeitvariablen bereit. Die AUD steht unter
**Zero Trust → Access controls → Applications → Anwendung konfigurieren →
Additional settings**. Beide Werte sind Konfiguration, keine Geheimnisse.

`keep_vars = true` bewahrt Dashboard-Laufzeitvariablen beim Deployment. Der
Schlüssel steht oberhalb aller TOML-Tabellen und verwaltet keine Secrets.

Die JWT-Prüfung verwendet den Header `Cf-Access-Jwt-Assertion`, die öffentlichen
Schlüssel unter `<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`, ausschließlich RS256,
den konfigurierten Issuer und die Audience. Ablauf (`exp`), `iss`, `aud`, `sub`
und `email` sind Pflicht; `nbf` wird geprüft, falls vorhanden. Ein vorhandenes
`type` muss `app` sein. Schlüsselrotation und ein begrenzter JWKS-Cache werden von
`jose` übernommen. Service-Token-Zugriffe werden derzeit nicht eingerichtet.

## Zugang über Cloudflare Access

**Workers & Pages → stationwizard → Access → Protect this Worker behind Access →
All traffic** schützt auch `workers.dev` und Vorschau-URLs. Die gewählte Richtlinie
muss auf die vereinbarten Adressen oder Organisationsdomain eingeschränkt werden;
ein Google-Konto allein genügt nicht. Google als erforderliche Anmeldemethode
auswählen. Der Access-Teamname und die erlaubten Personen sind vor Freigabe mit
dem Auftraggeber festzulegen.

Für Google wird ein OAuth-Client des Typs **Web application** eingerichtet:

- JavaScript-Origin: `https://<teamname>.cloudflareaccess.com`
- Redirect-URI: `https://<teamname>.cloudflareaccess.com/cdn-cgi/access/callback`
- Client-ID und Client-Secret ausschließlich im Cloudflare-Google-Identitätsanbieter.
- Abmelden in der Anwendung: `/cdn-cgi/access/logout`.

Access unterstützt die Worker-URL auch ohne DNS-Umzug. Die gewünschte Custom Domain
erfordert eine aktive Cloudflare-Zone; die Domain wird erst nach bestätigtem
Hostnamen und vollständiger DNS-/Mail-Sicherung verbunden. `ctx.access` ist bei
Workers Static Assets derzeit nicht verfügbar; deshalb wird das Header-JWT geprüft.

## Kommandos ab Repositorywurzel

```bash
npx npm@11 ci
npm run build
npm run worker:check
npm run worker:test
npm run test:spa
npm run deploy:dry-run
npm run worker:dev
```

`worker:dev` führt ebenfalls die vollständige Anmeldung aus; es gibt keinen
Entwicklungsschalter zum Umgehen der Prüfung. `test:spa` startet dagegen eine
abgeschlossene lokale workerd-Testumgebung: Sie verwendet das reale Worker-Bundle
und die Assets aus `wrangler.toml`, erzeugt ein frisches RSA-Testschlüsselpaar und
beantwortet ausschließlich den JWKS-Abruf lokal. Damit werden SPA-Rückfallebene,
Access-Pflicht vor Assets und API-404 ohne echte Zugangsdaten geprüft. Testcode
unter `worker/tests/` wird nicht mit dem Worker ausgeliefert.

**Prüfstand AP2:** Worker-TypeScript und 51 Vitest-Tests wurden erfolgreich
ausgeführt. Der tatsächliche `test:spa`-Lauf wurde von der Ausführungsumgebung mit
`network approval was cancelled before a decision was returned` blockiert, auch
nach Abschaltung externer Standortabfragen und Telemetrie. Ein erfolgreicher
workerd-Nachweis liegt deshalb noch nicht vor. Die Angular-App behält zunächst
Hash-Routing bei; die Umstellung auf saubere Pfade erfolgt erst nach erfolgreichem
`test:spa` und Browserprüfung der Direkteinstiege.

## Workers Builds

Git-Repository `SimonSchulte/stationwizard` verbinden, Produktionsbranch `main`,
Root-Verzeichnis Repositorywurzel. Unter **Settings → Build**:

| Einstellung            | Wert                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| Buildvariable          | `SKIP_DEPENDENCY_INSTALL=true`                                       |
| Node-Version           | Passende Version aus `.node-version` verwenden                       |
| Buildkommando          | `npx npm@11 ci && npm run build && npm test && npm run format:check` |
| Deploykommando         | `npx wrangler deploy --config worker/wrangler.toml`                  |
| Nichtproduktionsbranch | `npx wrangler versions upload --config worker/wrangler.toml`         |

Das dokumentierte Build-Image verwendet standardmäßig npm 10. Deshalb wird die
automatische Installation abgeschaltet und npm 11 ausdrücklich aufgerufen.
Nichtproduktionsbranches erzeugen Vorschauversionen; ihre URL ersetzt die
Produktions-URL nicht. Der Konfigurationsdatei zufolge heißt der Worker
`stationwizard`; der im Dashboard verbundene Worker muss denselben Namen tragen.

## APIs und Diagnose

| Endpunkt        | Methode | Antwort nach verifizierter Anmeldung |
| --------------- | ------- | ------------------------------------ |
| `/api/benutzer` | GET     | `{ "email": "…" }`                   |
| `/api/status`   | GET     | `{ "status": "erreichbar" }`         |
| andere `/api/*` | —       | HTTP 404, JSON                       |

Die Proxys für NextCloud und EFS folgen in eigenen Arbeitspaketen. Die bestehende
Hilfsfunktion `leseZugangsdatum()` wurde aus dem alten NextCloud-Worker übernommen
und unterstützt sowohl Strings als auch Secrets-Store-Bindings mit `get()`.
`APP_SHARED_SECRET` wird nicht verwendet.

API-Antworten und Fehler tragen `Cache-Control: no-store`. Schreibanfragen mit
fremder `Origin` oder `Sec-Fetch-Site: cross-site` werden abgewiesen. Fehler liefern
feste Codes auch im Header `X-Stationwizard-Diagnose`:

| Code                               | Bedeutung                                     |
| ---------------------------------- | --------------------------------------------- |
| `ACCESS_KONFIGURATION_FEHLT`       | Laufzeitkonfiguration fehlt oder ist ungültig |
| `ACCESS_TOKEN_FEHLT`               | Kein Access-Anwendungstoken vorhanden         |
| `ACCESS_TOKEN_UNGUELTIG`           | Signatur oder Claims ungültig                 |
| `ACCESS_TOKEN_ABGELAUFEN`          | Access-Sitzung abgelaufen                     |
| `ACCESS_PRUEFUNG_NICHT_ERREICHBAR` | Öffentliche Schlüssel derzeit nicht prüfbar   |
| `ANFRAGE_URSPRUNG_UNGUELTIG`       | Fremde Origin bei einem Schreibzugriff        |

Keine Rohfehler, Tokens, Secretlängen oder Bindinglisten werden veröffentlicht.
Der gemeinsame API-Client sendet `X-Requested-With: XMLHttpRequest`, damit Access
abgelaufene AJAX-Sitzungen mit HTTP 401 beantworten kann.

## Offizielle Quellen

Geprüft am 08.09.2026:

- [Worker vor Static Assets](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [SPA-Rückfallebene](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Access für Worker und Vorschauen](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Access-JWT-Verifikation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Access-Anwendungstoken und Claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- [Google-Identitätsanbieter](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)
- [Access-Richtlinien](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Sitzungen, AJAX und Logout](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build-Image und eigene Installation](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Secrets Store](https://developers.cloudflare.com/secrets-store/integrations/workers/)
- [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
