# stationwizard einrichten

Die App ist eingerichtet und läuft produktiv. Diese Seite dient als Referenz für eine
erneute Einrichtung (z. B. neue Umgebung, neuer Worker) und für den Wechsel von
Zugangsdaten. Die laufende Betriebsreferenz (Secrets, API-Verträge, Fehlercodes) steht im
[Worker-README](../worker/README.md). Den geprüften Entwicklungsstand dokumentiert
[Arbeitsstand](arbeitsstand.md).

## Voraussetzungen

| Angabe     | Herkunft                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Domain/DNS | Cloudflare-Zone mit aktiver DNS-Verwaltung.                                                                   |
| Cloudflare | Konto mit Secrets Store (`36762a3b5aa547bea7f547b1d66c30ee`), Zero-Trust-Teamdomain und Application Audience. |
| Google     | OAuth-Client (Web application) als Cloudflare-Access-Identitätsanbieter.                                      |
| Nextcloud  | Freigegebene Excel-Arbeitsmappe und ein gesonderter, beschreibbarer PEP-Ordner.                               |
| HiOrg      | Gültiger EFS-API-Token und die HiOrg-Kalenderfeed-URL.                                                        |

API-Tokens und Freigabepasswörter ausschließlich in den jeweiligen Verwaltungsoberflächen
eintragen; sie gehören weder in GitHub noch in die App oder einen Chat.

## Nextcloud- und HiOrg-Freigaben

- **Ausbildungs-Arbeitsmappe:** Die Excel-Datei per Link freigeben, Lesen **und**
  Bearbeiten/Hochladen erlauben. `NEXTCLOUD_BASE_URL` ist die Basis-URL der Instanz (ohne
  `/s/TOKEN`, ohne `/public.php/webdav/`); `NEXTCLOUD_SHARE_TOKEN` ist nur der Teil hinter
  `/s/` aus dem Freigabelink.
- **Einsatzpläne:** Ein eigener Ordner (z. B. `stationwizard-einsatzplaene`) auf derselben
  Instanz, ebenfalls mit Lesen/Bearbeiten/Hochladen freigegeben. Token in
  `NEXTCLOUD_PEP_SHARE_TOKEN`. Bei Freigabepasswörtern zusätzlich
  `NEXTCLOUD_SHARE_PASSWORD` bzw. `NEXTCLOUD_PEP_SHARE_PASSWORD` setzen.
- **HiOrg EFS:** Die vollständige, bestehende EFS-Endpunkt-URL kommt in
  `HIORGSERVER_BASE_URL` (bei `hiorg-server.de` **mit** abschließendem `/`, siehe
  [Worker-README](../worker/README.md#sechs-verpflichtende-secrets-store-bindings)), der
  Token in `HIORGSERVER_EFS_API_TOKEN`.
- **HiOrg-Kalenderfeed:** Die vollständige Feed-URL inklusive aller Query-Parameter kommt
  unverändert in `HIORGSERVER_CALENDER_FEED`. Diese URL ist selbst das Zugangsdatum und
  wird wie ein Passwort behandelt – nicht in Tickets, Chats oder Repositorys einfügen.

Alle sechs Werte werden im Cloudflare **Secrets Store** mit Permission scope **Workers**
angelegt; Bindingname und Secret-Name sind identisch. Details und das vollständige
Fehlercode-Mapping stehen im [Worker-README](../worker/README.md).

## Zero Trust, Google-Anmeldung und Access

1. In **Zero Trust → Settings → Team name and domain** die Teamdomain ablesen
   (`https://<teamname>.cloudflareaccess.com`).
2. In der Google Cloud Console einen OAuth-Client vom Typ **Web application** anlegen mit
   Authorized JavaScript origin `https://<teamname>.cloudflareaccess.com` und Authorized
   redirect URI `https://<teamname>.cloudflareaccess.com/cdn-cgi/access/callback`. Client
   ID/Secret unter **Zero Trust → Integrations → Identity providers → Google** eintragen.
3. Am Worker **Access → Protect this Worker behind Access → All traffic** wählen, damit
   Produktion, `workers.dev` und Vorschauen geschützt sind. In der erzeugten
   Access-Anwendung eine Allow-Regel mit den konkret freigegebenen Google-Adressen und
   Google als erforderlicher Login-Methode setzen – kein `Everyone` und kein `Bypass`.
4. `ACCESS_TEAM_DOMAIN` (mit `https://`, ohne Schrägstrich am Ende) und `ACCESS_AUD`
   (Application Audience Tag der Access-Anwendung) als **Text-Laufzeitvariablen** am Worker
   setzen (**Settings → Variables and Secrets**, außerhalb von **Build**).

Ohne diese Laufzeitvariablen antwortet der Worker bewusst mit
`503 / ACCESS_KONFIGURATION_FEHLT`; es gibt keinen produktiven Anmeldungs-Bypass.

## Workers Builds und Custom Domain

Git-Integration: Repository `SimonSchulte/stationwizard`, Produktionsbranch `main`, Root
directory `/`.

| Einstellung           | Wert                                                                 |
| --------------------- | -------------------------------------------------------------------- |
| Build-Variablen       | `NODE_VERSION=24`, `SKIP_DEPENDENCY_INSTALL=true`                    |
| Build command         | `npx npm@11 ci && npm run format:check && npm test && npm run build` |
| Deploy command        | `npm run deploy`                                                     |
| Non-production branch | `npx wrangler versions upload --config worker/wrangler.toml`         |

Eine Custom Domain wird unter **Settings → Domains & Routes → Add → Custom Domain**
verbunden und danach reproduzierbar als `[[routes]]`-Eintrag in `worker/wrangler.toml`
ergänzt. Der Access-Schutz für **All traffic** gilt automatisch auch für die neue Domain.

## Abnahme nach Änderungen

Nach Infrastruktur- oder Zugangsdatenänderungen prüfen:

| Prüfung                 | Erwartetes Ergebnis                                                             |
| ----------------------- | ------------------------------------------------------------------------------- |
| Ohne Anmeldung          | Privates Fenster → App und `/api/status`: Access verlangt Anmeldung.            |
| Erlaubte/fremde Adresse | Freigegebenes Google-Konto kommt durch, ein anderes wird abgelehnt.             |
| `/api/benutzer`         | Enthält die eigene E-Mail-Adresse.                                              |
| Ausbildung              | Arbeitsmappe laden, Änderung speichern, neu laden – Änderung bleibt erhalten.   |
| Einsatz                 | EFS-Veranstaltung importieren; Planung in Nextcloud speichern und wieder laden. |
| HiOrg-Kalender          | Termine erscheinen im Jahresplan als gekennzeichnete Fremdquelle.               |
| Abmeldung               | `/cdn-cgi/access/logout`; geschützte URL verlangt danach erneut eine Anmeldung. |

Bei einem Nextcloud-Speicherkonflikt (HTTP 412) bleiben lokale Änderungen erhalten: zuerst
lokal sichern, dann den aktuellen Stand laden und zusammenführen – kein blindes
Überschreiben.

## Häufige Fehler

| Beobachtung                          | Nächster Schritt                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Build scheitert beim Installieren    | `SKIP_DEPENDENCY_INSTALL=true` und `npx npm@11 ci` im Build command prüfen.                                                                 |
| `ACCESS_KONFIGURATION_FEHLT`         | `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` als Laufzeitvariablen (nicht Build-Variablen) prüfen.                                                     |
| `ACCESS_TOKEN_UNGUELTIG`             | Richtige Access-Anwendung/Audience kontrollieren; ab-/neu anmelden.                                                                         |
| Nextcloud-Fehler                     | Freigabe, Token, Passwort und Schreibrechte prüfen, danach das Secrets-Store-Binding am Worker.                                             |
| `EFS_UMLEITUNG`                      | `HIORGSERVER_BASE_URL` braucht den abschließenden `/` (`https://www.hiorg-server.de/api/efs/`).                                             |
| `HIORG_KALENDER_KONFIGURATION_FEHLT` | `HIORGSERVER_CALENDER_FEED` fehlt oder zeigt nicht auf `hiorg-server.de`.                                                                   |
| Secret vorhanden, trotzdem Fehler    | Unter **Bindings** kontrollieren, ob genau dieser Worker das Secret nutzt – ein Eintrag unter **Build Variables and Secrets** genügt nicht. |

Der vollständige Fehlercode-Katalog mit HTTP-Status steht im
[Worker-README](../worker/README.md#schutzgrenzen-und-diagnose).

## Offene Punkte

- `npm run test:spa` und die zugehörige Browserprüfung der Direkteinstiege waren zuletzt
  nicht erfolgreich (siehe [Arbeitsstand](arbeitsstand.md)). Bis zu einem erfolgreichen
  Lauf bleibt Hash-Routing (`/#/…`) bestehen; es wird nicht vorab entfernt.
- Die beiden ursprünglichen Altrepositorys sind erst nach bestätigter Abnahme zu
  archivieren, siehe [README](../README.md#herkunft).
