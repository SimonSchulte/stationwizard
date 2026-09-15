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
- **HiOrg-Kalenderfeed:** In `HIORGSERVER_CALENDER_FEED` gehört die **vollständige
  Freigabe-URL** aus HiOrg (empfohlen, weil HiOrg sie genau so ausgibt); der Worker ruft
  genau diese Adresse ab und ersetzt darin nur `monate`. Ersatzweise genügt der reine
  `lab`-Tokenwert (der Wert hinter `lab=` im Freigabelink); dann baut der Worker Host, Pfad
  und die Parameter (`ov`, `termin`, `dienst`, `auchint`, `zr_dienst`, `json`) selbst – das
  passt aber nur zu einer Freigabe mit genau diesen Parametern und führt sonst zu
  `HIORG_KALENDER_ANTWORT_UNGUELTIG` (HiOrg antwortet dann mit einer HTML-Seite statt mit
  JSON). Die Adresse beziehungsweise der Tokenwert wird wie ein Passwort behandelt – nicht
  in Tickets, Chats oder Repositorys einfügen. Umschließende Leerzeichen und ein aus einer
  HTML-Seite kopierter Link mit `&amp;` statt `&` werden beim Lesen abgefangen; die Adresse
  muss aber vollständig sein (mit `lab=`) und darf nicht gekürzt werden.

- **Mailversand:** `MAIL_ABSENDER` ist die Absenderadresse des Kilometerstandsberichts und
  muss zu einer Domain gehören, die im Cloudflare-Konto für den Versand belegt ist.
  `MAIL_API_TOKEN` gehört zum Versandweg „Mail-API (Resend)"; wer nur Email Routing
  benutzt, legt das Secret trotzdem an, weil `wrangler deploy` sonst über das fehlende
  Binding stolpert. Für den Versandweg **Cloudflare Email Routing** zusätzlich Email
  Routing für die Zone aktivieren, die Berichtsadresse dort als **Zieladresse bestätigen**
  und den `[[send_email]]`-Block in `worker/wrangler.toml` aktivieren (`destination_address`
  auf genau diese Adresse). Ohne die Bestätigung lehnt Cloudflare den Versand ab – das ist
  eine Eigenschaft von Email Routing, keine Einstellung dieser Anwendung. Empfänger,
  Betreff und Versandweg werden anschließend in der Anwendung unter
  **Verwaltung → Systemkonfiguration** gesetzt, nicht im Dashboard.

Alle acht Werte werden im Cloudflare **Secrets Store** mit Permission scope **Workers**
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
| `HIORG_KALENDER_KONFIGURATION_FEHLT` | `HIORGSERVER_CALENDER_FEED` fehlt, ist leer, enthält Steuerzeichen/Backslash oder ist eine URL ohne HTTPS beziehungsweise ohne HiOrg-Ziel.  |
| `MAIL_VERSANDWEG_NICHT_EINGERICHTET` | Kein `MAIL_ABSENDER`, kein `send_email`-Binding beziehungsweise kein `MAIL_API_TOKEN` für den gewählten Weg.                                |
| `MAIL_VERSAND_FEHLGESCHLAGEN`        | Der Anbieter hat abgelehnt – bei Email Routing meist eine nicht bestätigte Zieladresse. Details stehen nur im Betreiberlog.                 |
| `KM_BERICHT_EMPFAENGER_FEHLT`        | Unter Verwaltung → Systemkonfiguration ist keine Empfängeradresse gespeichert.                                                              |
| Secret vorhanden, trotzdem Fehler    | Unter **Bindings** kontrollieren, ob genau dieser Worker das Secret nutzt – ein Eintrag unter **Build Variables and Secrets** genügt nicht. |

Der vollständige Fehlercode-Katalog mit HTTP-Status steht im
[Worker-README](../worker/README.md#schutzgrenzen-und-diagnose).

## Offene Punkte

- `npm run test:spa` und die zugehörige Browserprüfung der Direkteinstiege waren zuletzt
  nicht erfolgreich (siehe [Arbeitsstand](arbeitsstand.md)). Bis zu einem erfolgreichen
  Lauf bleibt Hash-Routing (`/#/…`) bestehen; es wird nicht vorab entfernt.
- Die beiden ursprünglichen Altrepositorys sind erst nach bestätigter Abnahme zu
  archivieren, siehe [README](../README.md#herkunft).
