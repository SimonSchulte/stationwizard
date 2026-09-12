# stationwizard-Worker

Der Worker liefert die Angular-App, die Nextcloud-Dateianbindung und die drei bekannten
EFS-Aktionen unter derselben Origin. Vor jeder API und jeder statischen Datei steht die
serverseitige Access-JWT-Prüfung. Ohne vollständige Access-Konfiguration bleibt der Worker
geschlossen.

Die App läuft produktiv. Referenz für Secrets, Access-Konfiguration und eine erneute
Einrichtung: [Einrichtung](../docs/einrichtung.md). Historie der Arbeitspakete und
Prüfläufe: [Arbeitsstand](../docs/arbeitsstand.md).

## Static Assets und Routing

`worker/wrangler.toml` bindet `../dist/stationwizard/browser` als `ASSETS` ein.
`run_worker_first = true` führt den Worker vor **jedem** Assetabruf aus.
`not_found_handling = "single-page-application"` bereitet den SPA-Fallback vor. Unbekannte
`/api/*`-Pfade werden vorher mit JSON und HTTP 404 beantwortet und erreichen diesen
Fallback nicht.

Angular behält vorerst `withHashLocation()` und die Routen `/#/ausbildung`, `/#/einsatz`
sowie `/#/einsatz/editor`. Der echte workerd-/SPA-Test konnte in der aktuellen Umgebung
nicht erfolgreich gestartet werden. Auf saubere Pfade erst nach erfolgreichem
`npm run test:spa` und Browserprüfung der Direkteinstiege umstellen.

## Laufzeitkonfiguration

Die zwei folgenden **Text-Laufzeitvariablen** am Worker setzen:

| Name                 | Wert                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `ACCESS_TEAM_DOMAIN` | `https://<teamname>.cloudflareaccess.com`, ohne abschließenden `/`    |
| `ACCESS_AUD`         | Application Audience (AUD) Tag genau der schützenden Access-Anwendung |

Cloudflare: **Worker → Settings → Variables and Secrets**. Die gleichnamige Karte unter
**Build** stellt keine Laufzeitvariablen bereit. Die Audience findet sich unter
**Zero Trust → Access controls → Applications → Anwendung konfigurieren → Additional
settings**. Diese beiden Werte sind Konfiguration und keine Upstream-Geheimnisse.

`keep_vars = true` bewahrt Dashboard-Laufzeitvariablen bei Deployments. Der Schlüssel
steht vor allen TOML-Tabellen und ersetzt keine Secrets oder Secret-Bindings.

### Sechs verpflichtende Secrets-Store-Bindings

`wrangler.toml` referenziert den Store `36762a3b5aa547bea7f547b1d66c30ee`. Binding und
Secret heißen jeweils gleich. Die Store-ID darf ins Repository, die Werte nicht.

| Binding                     | Wert                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NEXTCLOUD_BASE_URL`        | HTTPS-Basis der Nextcloud-Installation, gegebenenfalls mit Installationsunterverzeichnis; ohne Freigabelink oder WebDAV-Suffix |
| `NEXTCLOUD_SHARE_TOKEN`     | Token der Excel-**Dateifreigabe**, nur der Teil hinter `/s/`                                                                   |
| `NEXTCLOUD_PEP_SHARE_TOKEN` | Token des gesonderten PEP-**Ordners**, nur der Teil hinter `/s/`                                                               |
| `HIORGSERVER_BASE_URL`      | Vollständige gültige HTTPS-EFS-Endpunkt-URL aus dem bestehenden Zugang, **mit** abschließendem `/`                             |
| `HIORGSERVER_EFS_API_TOKEN` | Unveränderter EFS-API-Schlüssel, ohne Präfix oder zusätzliche Leerzeichen                                                      |
| `HIORGSERVER_CALENDER_FEED` | Vollständige HTTPS-URL des HiOrg-Kalenderfeeds **einschließlich Query-Parameter**; die URL ist selbst das Zugangsdatum         |

Die Store-Einträge benötigen den Permission scope **Workers**. Nach dem Deployment im
Worker unter **Bindings** kontrollieren, ob genau diese sechs Namen auf den richtigen Store
zeigen. Eine vorhandene Build-Variable genügt nicht.

Die Nextcloud-Basis und die EFS-Ziel-URL dürfen keine eingebetteten Zugangsdaten,
Query-Parameter oder Fragmente enthalten. Der EFS-Endpunkt wird nicht im Quellcode
festgelegt; er stammt ausschließlich aus `HIORGSERVER_BASE_URL`.

Bei `hiorg-server.de` liefert die HTTPS-URL ohne abschließenden `/` (z. B.
`https://www.hiorg-server.de/api/efs`) serverseitig einen `301` auf eine unverschlüsselte
`http://…:1080/…`-Adresse. Der Worker fragt mit `redirect: 'manual'` an, folgt dieser
Weiterleitung bewusst nicht und meldet sie als `EFS_UMLEITUNG`; Ziel, Inhalt und Header der
Weiterleitung werden verworfen. Die URL braucht deshalb zwingend den
abschließenden Slash (`https://www.hiorg-server.de/api/efs/`), der ohne Redirect direkt
antwortet. Bei einer neuen Einrichtung diese Endpunkt-Variante immer zuerst mit
`curl -Is <URL>` gegenprüfen.

### Optionale Freigabepasswörter

Bei passwortgeschützten Freigaben zusätzlich **klassische Worker-Laufzeit-Secrets** unter
**Settings → Variables and Secrets → Add → Secret** setzen:

| Name                           | Wert                                     |
| ------------------------------ | ---------------------------------------- |
| `NEXTCLOUD_SHARE_PASSWORD`     | Exaktes Passwort der Excel-Dateifreigabe |
| `NEXTCLOUD_PEP_SHARE_PASSWORD` | Exaktes Passwort des PEP-Ordners         |

Ohne Freigabepasswort den jeweiligen Eintrag komplett weglassen; kein `leer`, `optional`
oder anderer Platzhalter. Diese optionalen Werte erfordern keinen Wert im Repository und
keinen zusätzlichen Secrets-Store-Block in der vorliegenden Konfiguration.

`leseZugangsdatum()` in `src/zugangsdaten.ts` unterstützt klassische Secret-Strings und
Secrets-Store-Bindings mit asynchronem `get()`. Nicht auflösbare Bindings gelten als
fehlend. Ein Bindingobjekt wird niemals direkt als String verglichen.

`APP_SHARED_SECRET` wird nicht mehr verwendet. Einen alten Store-Eintrag erst entfernen,
wenn kein noch betriebener alter Worker ihn benötigt.

## Cloudflare Access und Google

Nach Einrichtung schützt **Workers & Pages → stationwizard → Access → Protect this Worker
behind Access → All traffic** den gesamten Worker einschließlich `workers.dev`, Vorschauen
und Custom Domains. Die Allow-Richtlinie braucht die konkret vereinbarten Adressen und
Google als erforderliche Login-Methode; keine pauschale Freigabe aller Google-Nutzer.

Google-OAuth-Clienttyp: **Web application**.

- JavaScript-Origin: `https://<teamname>.cloudflareaccess.com`
- Redirect-URI: `https://<teamname>.cloudflareaccess.com/cdn-cgi/access/callback`
- Client ID und Client Secret ausschließlich im Cloudflare-Google-Identitätsanbieter.
- Abmeldung: `/cdn-cgi/access/logout`.

Der Logout widerruft die Access-Sitzung auch für andere Access-Anwendungen desselben Teams;
das Anwendungscookie wird sofort gelöscht, bereits ausgestellte Tokens werden laut
Cloudflare nach 20–30 Sekunden nicht mehr akzeptiert. Die Google-Sitzung ist davon getrennt.
[Cloudflare: Sitzungen und Logout](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)

Der Worker prüft `Cf-Access-Jwt-Assertion` mittels `jose` gegen
`<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`. Er erlaubt ausschließlich RS256 und prüft
Issuer, Audience und Ablauf. `exp`, `iss`, `aud`, `sub` und `email` sind Pflichtclaims;
`nbf` wird geprüft, falls vorhanden. Ein vorhandenes `type` muss `app` sein. JWKS-Abrufe
haben ein Zeitlimit und einen begrenzten Cache; Schlüsselrotation wird unterstützt.

Service-Tokens wurden nicht eingerichtet. Es gibt keinen produktiven
Entwicklungs-Bypass. Access auf `workers.dev` erlaubt einen Vorabtest ohne DNS-Umzug;
die gewünschte Custom Domain braucht eine aktive Cloudflare-Zone und vorher die bestätigte
Hostname-/DNS-/Mail-Einrichtung.

## APIs

Alle Endpunkte benötigen die verifizierte Anmeldung:

| Endpunkt                           | Methode    | Anfrage beziehungsweise Antwort                                                              |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `/api/benutzer`                    | GET        | Antwort `{ "email": "…" }`                                                                   |
| `/api/status`                      | GET        | Antwort `{ "status": "erreichbar" }`; keine Prüfung der Upstream-Systeme                     |
| `/api/efs/checkapikey`             | POST       | Anfrage JSON `{}`                                                                            |
| `/api/efs/getveranstaltungen`      | POST       | Anfrage JSON `{}`                                                                            |
| `/api/efs/getveranstaltung`        | POST       | Anfrage JSON `{ "id": "…" }`                                                                 |
| `/api/nextcloud/arbeitsmappe`      | GET / PUT  | Konfigurierte Excel-Datei                                                                    |
| `/api/nextcloud/planungen`         | GET        | Antwort `{ "dateien": [...] }`; Einträge mit UUID `id` und ETag als Zeichenkette oder `null` |
| `/api/nextcloud/planungen/<UUID>`  | GET / PUT  | Einzelne `<UUID>.pep.json` im konfigurierten Ordner                                          |
| `/api/hiorg/kalender`              | GET        | Antwort `{ "status": "OK", "eintraege": [...] }`; keine Anfrageparameter                     |
| `/api/fahrzeuge`                   | GET / POST | Liste; Neuanlage nur mit `If-None-Match: *`                                                  |
| `/api/fahrzeuge/<UUID>`            | GET / PUT  | Einzelnes Fahrzeug mit `ETag`; Update nur mit passendem `If-Match`                           |
| `/api/fahrzeuge/<UUID>/ablesungen` | GET / POST | Kilometerablesungen; `erfasstVon`/`erfasstAm` setzt der Worker aus der Anmeldung             |
| `/f/<UUID>`, `/f/<UUID>/km`        | GET        | Weiterleitung (302) für gedruckte QR-Codes auf die aktuelle Hash-Route                       |

### Fahrzeugmodul (D1)

`FAHRZEUGE_DB` bindet die D1-Datenbank `stationwizard-fahrzeuge`
(`698facb9-4c99-45de-8879-d262c2144144`, siehe `[[d1_databases]]` in
`wrangler.toml`). Schema in `worker/migrations/0001_fahrzeuge.sql`, angewendet über die
Cloudflare-D1-API. Ohne dieses Binding antwortet `/api/fahrzeuge*` mit 503
(`FAHRZEUGE_KONFIGURATION_FEHLT`) statt eines Absturzes.

Domäne (`src/app/fahrzeuge/`) und Persistenz (`worker/src/fahrzeuge.ts`,
`src/app/fahrzeuge/storage/api-fahrzeug-storage.ts`) sind strikt getrennt: die Fachschicht
kennt kein D1-, SQL- oder HTTP-Detail. `version` ist ein starkes HTTP-ETag über einen
Zähler in der Fahrzeugzeile, für die Fachschicht eine undurchsichtige Zeichenkette. Details
und die Begründung für D1 statt Supabase: `docs/konzept-fahrzeuge.md`.

Kilometerablesungen sind unveränderlich – eine Korrektur ist ein neuer Datensatz mit
Verweis über `korrigiert`, nie ein Update. `erfasstVon` und `erfasstAm` setzt der Worker
ausschließlich aus der geprüften Anmeldung beziehungsweise der Serverzeit; ein
gleichnamiges Feld im Anfragekörper wird verworfen.

Eine neue D1-Datenbank für eine erneute Einrichtung anlegen:

```bash
npx wrangler d1 create stationwizard-fahrzeuge --config worker/wrangler.toml
npx wrangler d1 execute stationwizard-fahrzeuge --remote --config worker/wrangler.toml \
  --file worker/migrations/0001_fahrzeuge.sql
```

Die zurückgegebene `database_id` in den `[[d1_databases]]`-Block von `wrangler.toml`
eintragen.

### HiOrg-Kalenderfeed

`HIORGSERVER_CALENDER_FEED` ist die vollständige Feed-URL. Anders als bei allen anderen
Zielen liegt das Zugangsdatum **in der URL selbst** (als Query-Parameter), deshalb ist der
Query-String hier ausdrücklich erlaubt, während er beim EFS-Endpunkt abgelehnt wird. Die
Schreibweise „CALENDER" ist bewusst übernommen – das Secret heißt im Store genau so.

Der Worker bindet das Ziel fest an `hiorg-server.de` beziehungsweise dessen Subdomains.
Ein versehentlich vertauschtes Secret kann den Worker damit nicht zu einem beliebigen
fremden Ziel schicken.

Weitergereicht wird pro Termin ausschließlich `sortdate`, `enddate`, `verbez`, `typ`, `id`
und die geprüfte `url`. Bewusst **nicht** weitergereicht werden `ansprech` und `bemerkung`
(Klarnamen und Freitext, teils mit Zugangslinks), `verort`, `treff`, `kursnr`,
`max_meldungen` sowie die `personal_*`-Felder der Einsatzdisposition: für den
Namensabgleich und den Link im Ausbildungsplan werden sie nicht gebraucht, und was nicht
durchgereicht wird, landet auch nicht in Screenshots, Exporten oder Logs.

Die Ereignis-URL liefert der Feed HTML-escaped (`&amp;` als Parametertrenner). Der Worker
dekodiert sie, prüft sie gegen dieselbe Host-Bindung und lässt einen unbrauchbaren Link
weg, statt den ganzen Termin zu verwerfen. Einzelne fehlerhafte Datensätze werden
übersprungen; erst wenn ein nicht leerer Feed gar keinen brauchbaren Termin enthält, gilt
die Antwort als ungültig. Vor dem Senden prüft der Worker die eigene Ausgabe darauf, dass
weder die Feed-URL noch einer ihrer Parameterwerte darin gespiegelt ist.

Grenzen: Antwort höchstens 1 MiB, Upstream-Zeitlimit 15 Sekunden, `redirect: 'manual'`.

### Nextcloud

Beide Freigaben nutzen die vorhandene WebDAV-Anbindung über
`<NEXTCLOUD_BASE_URL>/public.php/webdav/` mit Basic-Authentifizierung aus Freigabetoken
und optionalem Passwort. Die Arbeitsmappe ist eine **Dateifreigabe**. Der PEP-Speicher ist
ein eigener **Ordner** auf derselben Instanz mit Lesen, Bearbeiten und Hochladen.

Weiterleitungen werden bewusst nicht verfolgt. Der Worker fragt mit `redirect: 'manual'`
an und beantwortet jede `3xx`-Antwort mit `NEXTCLOUD_UMLEITUNG`; Ziel, Inhalt und Header
der Weiterleitung werden verworfen. `NEXTCLOUD_NICHT_ERREICHBAR` bedeutet dagegen, dass
schon die Verbindung selbst scheitert (DNS, TLS, Transport).

Zur Eingrenzung ohne Zugangsdaten reicht ein Blick auf den nackten Endpunkt:

```bash
curl -Is "<NEXTCLOUD_BASE_URL>/public.php/webdav/"
```

- `401` mit `WWW-Authenticate: Basic` ist der Sollzustand; dann liegt der Fehler an
  Freigabetoken, Passwort oder Freigaberechten (`NEXTCLOUD_ZUGANG_ABGELEHNT`).
- `301`/`302` bedeutet, dass `NEXTCLOUD_BASE_URL` nicht die kanonische Adresse der
  Installation ist. Häufige Ursachen: `www`-Variante, fehlendes oder überzähliges
  Installationsunterverzeichnis, HTTP-nach-HTTPS-Umleitung eines vorgelagerten Proxys
  oder ein von `overwrite.cli.url` abweichender Hostname. Die Zieladresse der
  Weiterleitung als `NEXTCLOUD_BASE_URL` eintragen — ohne `/public.php/webdav/`.
- Kein Verbindungsaufbau (DNS-Fehler, TLS-Fehler, Zeitüberschreitung) entspricht
  `NEXTCLOUD_NICHT_ERREICHBAR`. Auch eine Zugriffsbeschränkung der Nextcloud-Instanz auf
  bestimmte Quell-IP-Adressen fällt hierunter, weil der Worker aus dem
  Cloudflare-Netz anfragt.
- `404`/`405` deutet auf eine Installation ohne den öffentlichen WebDAV-Endpunkt hin; der
  Endpunkt gilt in neueren Nextcloud-Fassungen als veraltet. Ein Wechsel des Endpunkts
  wäre eine Vertragsänderung und braucht zuerst den Nachweis an der echten Instanz.

Antwortet der Endpunkt von außen mit `401`, meldet der Worker aber weiterhin
`NEXTCLOUD_NICHT_ERREICHBAR`, scheitert erst der Subrequest aus dem Cloudflare-Netz. Der
Worker schreibt in diesem Fall Fehlerklasse und Meldung der Laufzeit ins eigene Log;
Basisadresse, Hostname, Freigabetoken und Passwort werden vorher durch `<redigiert>`
ersetzt. Die HTTP-Antwort an den Browser bleibt unverändert der feste Code. Mitlesen
während eines Ladeversuchs:

```bash
npx wrangler tail stationwizard --config worker/wrangler.toml
```

Typische Ursachen dieser Klasse: DNS- oder TLS-Fehler gegenüber der Nextcloud-Adresse,
eine Zugriffsbeschränkung der Instanz auf bestimmte Quell-IP-Adressen sowie
Cloudflare-Einschränkungen für Subrequests (Fehler 1024 auf Cloudflare-eigene
IP-Adressen, Fehler 1042 bei Zielen in derselben Zone wie der Worker).

Die Ordnerliste entsteht serverseitig über `PROPFIND` mit `Depth: 1`. Nur UUID-Dateinamen
mit Endung `.pep.json` werden übernommen; Inhalte werden erst beim bewussten Einzelabruf
gelesen. Es gibt keine generischen WebDAV-Pfade und keine DELETE-Route.

PUT verlangt entweder `If-Match` mit starkem ETag oder bei ausdrücklich neuen Dateien
`If-None-Match: *`. Fehlende Bedingungen ergeben HTTP 428, widersprüchliche oder ungültige
Bedingungen HTTP 400. Ein von Nextcloud gemeldeter Konflikt bleibt HTTP 412. Die App
bewahrt lokale Änderungen und bietet den Dateiexport vor dem erneuten Laden an. Fehlende
starke ETags und unklare Speicherergebnisse dürfen nicht in unbedingte Updates oder
automatische ungeschützte Schreibwiederholungen münden.

PUT akzeptiert XLSX-Medientyp beziehungsweise `application/octet-stream` für die
Arbeitsmappe und `application/json` für PEP. Erfolgreiche Schreibantworten werden auf
204 ohne Upstream-Inhalt normalisiert. Ausgewählte Versionsheader werden weitergegeben.
HTML-Fehler- oder Loginseiten von Nextcloud werden nicht an den Browser durchgereicht.

### EFS

Nur die drei dokumentierten Pfade werden akzeptiert. Browseranfragen müssen JSON sein;
Listen- und Zugangstest erhalten `{}`, der Detailabruf ausschließlich `id`. Die ID ist
eine Zeichenkette mit 1–128 Zeichen aus `A–Z`, `a–z`, `0–9`, `_` und `-`.

Der Worker setzt `apikey`, `version=2` und die zugehörige Aktion als
`application/x-www-form-urlencoded`. Er ergänzt beim Detailabruf `id`. Token und Ziel
werden ausschließlich serverseitig gelesen. Query-Parameter, zusätzliche Felder und
Redirects werden abgewiesen. Es gibt keine nachgewiesene EFS-Schreibaktion.

Antworten benötigen `status: "OK"` und die erwartete Form. Nur die vom übernommenen
Client benötigten Felder werden weitergereicht; Qualifikationsstrings bleiben für das
bestehende Mapping unverändert. Ein in Nutzdaten zurückgespiegelter API-Key wird
abgewiesen. Rohfehler von HiOrg gelangen nicht in die Browserantwort.

## Schutzgrenzen und Diagnose

Die Grenzen entsprechen `src/nextcloud.ts`, `src/efs.ts` und `src/anmeldung.ts`:

| Vorgang                                                               | Grenze      |
| --------------------------------------------------------------------- | ----------- |
| XLSX-Datei, Upload und Download                                       | 15 MiB      |
| PEP-Datei sowie Nextcloud-Ordnerantwort                               | 2 MiB       |
| EFS-JSON-Anfrage                                                      | 8 KiB       |
| EFS-JSON-Upload zum Worker                                            | 30 Sekunden |
| EFS-JSON-Antwort                                                      | 5 MiB       |
| Nextcloud-Upload zum Worker                                           | 30 Sekunden |
| Anschließender Nextcloud-Upstream-Zugriff einschließlich Antwortlesen | 30 Sekunden |
| EFS-Upstream-Anfrage                                                  | 15 Sekunden |
| Abruf der öffentlichen Access-Schlüssel                               | 5 Sekunden  |

Die Nextcloud-Zeitlimits gelten für getrennte Phasen, nicht als gemeinsames
30-Sekunden-Gesamtbudget. Der Browser-Client besitzt zusätzlich sein eigenes
Anfragezeitlimit. Ein Browserabbruch belegt keinen fehlgeschlagenen Upstream-Schreibvorgang.

JSON-/Datei-APIs und Fehler tragen `Cache-Control: no-store`. Schreibanfragen mit fremder
`Origin` oder `Sec-Fetch-Site: cross-site` werden abgewiesen. Fehler verwenden feste Codes
im JSON sowie in `X-Stationwizard-Diagnose`:

| Code                                  | HTTP | Bedeutung / nächste Prüfung                                       |
| ------------------------------------- | ---- | ----------------------------------------------------------------- |
| `ACCESS_KONFIGURATION_FEHLT`          | 503  | Teamdomain oder Audience fehlt beziehungsweise ist ungültig       |
| `ACCESS_TOKEN_FEHLT`                  | 401  | Keine Access-Anmeldung auf diesem Zugangsweg                      |
| `ACCESS_TOKEN_UNGUELTIG`              | 401  | Signatur oder erforderliche Claims ungültig                       |
| `ACCESS_TOKEN_ABGELAUFEN`             | 401  | Neu anmelden                                                      |
| `ACCESS_PRUEFUNG_NICHT_ERREICHBAR`    | 503  | Öffentliche Schlüssel derzeit nicht prüfbar                       |
| `ANFRAGE_URSPRUNG_UNGUELTIG`          | 403  | Fremder Ursprung bei einer Schreibanfrage                         |
| `NEXTCLOUD_KONFIGURATION_FEHLT`       | 503  | Basis, Token oder Binding prüfen                                  |
| `NEXTCLOUD_ZUGANG_ABGELEHNT`          | 502  | Nextcloud lehnt Token, Passwort oder Freigaberechte ab            |
| `NEXTCLOUD_VORBEDINGUNG_FEHLT`        | 428  | Geladene Dateiversion oder ausdrückliche Neuanlage fehlt          |
| `NEXTCLOUD_VORBEDINGUNG_UNGUELTIG`    | 400  | ETag beziehungsweise Schreibbedingung ungültig                    |
| `NEXTCLOUD_DATEI_GEAENDERT`           | 412  | Lokale Kopie sichern, neu laden und zusammenführen                |
| `NEXTCLOUD_DATEI_NICHT_GEFUNDEN`      | 404  | Gewählte Datei/Freigabe prüfen                                    |
| `NEXTCLOUD_DATEI_ZU_GROSS`            | 413  | Upload überschreitet die Dateigrenze                              |
| `NEXTCLOUD_ANTWORT_ZU_GROSS`          | 502  | Nextcloud-Antwort überschreitet die Grenze                        |
| `NEXTCLOUD_UPLOAD_ZEITLIMIT`          | 408  | Upload zum Worker zu langsam                                      |
| `NEXTCLOUD_ZEITLIMIT`                 | 504  | Nextcloud-Upstream zu langsam                                     |
| `NEXTCLOUD_NICHT_ERREICHBAR`          | 502  | DNS, TLS oder Verbindung zur Basisadresse prüfen                  |
| `NEXTCLOUD_UMLEITUNG`                 | 502  | Basisadresse antwortet mit 3xx; kanonische URL eintragen          |
| `NEXTCLOUD_ANTWORT_UNGUELTIG`         | 502  | Unerwarteter Status oder ungültiger Dateiinhalt                   |
| `EFS_KONFIGURATION_FEHLT`             | 503  | EFS-Ziel, Token und Laufzeit-Bindings prüfen                      |
| `EFS_ANFRAGE_UNGUELTIG`               | 400  | Anfragefelder, JSON oder Veranstaltungs-ID ungültig               |
| `EFS_INHALTSTYP_UNGUELTIG`            | 415  | Browseranfrage muss JSON sein                                     |
| `EFS_ANFRAGE_ZU_GROSS`                | 413  | Anfrage überschreitet 8 KiB                                       |
| `EFS_UPLOAD_ZEITLIMIT`                | 408  | EFS-JSON-Upload zum Worker zu langsam                             |
| `EFS_ZEITLIMIT`                       | 504  | HiOrg-Upstream zu langsam                                         |
| `EFS_NICHT_ERREICHBAR`                | 502  | DNS, TLS oder Verbindung zum EFS-Endpunkt prüfen                  |
| `EFS_UMLEITUNG`                       | 502  | EFS-Endpunkt antwortet mit 3xx; abschließenden `/` prüfen         |
| `EFS_ABRUF_FEHLGESCHLAGEN`            | 502  | HiOrg lieferte einen nicht erfolgreichen HTTP-Status              |
| `EFS_ANTWORT_UNGUELTIG`               | 502  | JSON-Status/Form unerwartet oder Zugangsdaten gespiegelt          |
| `EFS_ANTWORT_ZU_GROSS`                | 502  | Antwort überschreitet 5 MiB                                       |
| `HIORG_KALENDER_KONFIGURATION_FEHLT`  | 503  | Feed-Secret fehlt, ist kein HTTPS-URL oder zeigt nicht auf HiOrg  |
| `HIORG_KALENDER_ANFRAGE_UNGUELTIG`    | 400  | Der Endpunkt nimmt keine URL-Parameter entgegen                   |
| `HIORG_KALENDER_ZEITLIMIT`            | 504  | HiOrg-Feed zu langsam                                             |
| `HIORG_KALENDER_NICHT_ERREICHBAR`     | 502  | DNS, TLS oder Verbindung zum Feed prüfen                          |
| `HIORG_KALENDER_UMLEITUNG`            | 502  | Feed antwortet mit 3xx; kanonische URL eintragen                  |
| `HIORG_KALENDER_ABRUF_FEHLGESCHLAGEN` | 502  | HiOrg lieferte einen nicht erfolgreichen HTTP-Status              |
| `HIORG_KALENDER_ANTWORT_ZU_GROSS`     | 502  | Feed-Antwort überschreitet 1 MiB                                  |
| `HIORG_KALENDER_ANTWORT_UNGUELTIG`    | 502  | `success` fehlt, kein brauchbarer Termin oder Feed-URL gespiegelt |

Keine Tokens, Secretlängen oder vollständigen Bindinglisten werden veröffentlicht.
Der gemeinsame Client sendet `X-Requested-With: XMLHttpRequest`, damit Access eine
abgelaufene AJAX-Sitzung mit HTTP 401 beantworten kann. Die Detaildiagnose im Worker
ersetzt keine erfolgreiche Anmeldung oder fachliche Prüfung gegen die echten Systeme.

## Kommandos und Tests

Node 24 und npm mindestens 11; alle Kommandos aus der Repository-Wurzel:

```bash
npx npm@11 ci
npm run build
npm test
npm run format:check
npm run worker:check
npm run worker:test
npm run test:spa
npm run deploy:dry-run
```

`npm run worker:dev` startet Wrangler lokal und prüft weiterhin vollständige JWTs.
`test:spa` verwendet dagegen ausschließlich eine isolierte Testumgebung mit dem echten
Worker-Bundle, den Assets aus `wrangler.toml` und einem frisch erzeugten RSA-Testschlüssel.
Nur der JWKS-Abruf wird lokal beantwortet. Testcode unter `worker/tests/` wird nicht mit
dem produktiven Worker ausgeliefert.

Der bisherige echte workerd-Lauf wurde beim Start mit
`network approval was cancelled before a decision was returned` blockiert. Auch die
Browser-Vorschau war blockiert. Die daraus fehlenden Nachweise stehen im
[Arbeitsstand](../docs/arbeitsstand.md); Testzahlen werden dort zentral gepflegt.

## Workers Builds

Git-Repository `SimonSchulte/stationwizard`, Produktionsbranch `main`, Root-Verzeichnis
Repository-Wurzel. Der Workername im Dashboard muss zu `name = "stationwizard"` passen.
Die Git-Integration ist vorzubereiten; sie wurde noch nicht produktiv eingerichtet.

| Einstellung            | Wert                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| Build-Variablen        | `NODE_VERSION=24`, `SKIP_DEPENDENCY_INSTALL=true`                    |
| Buildkommando          | `npx npm@11 ci && npm run format:check && npm test && npm run build` |
| Deploykommando         | `npm run deploy`                                                     |
| Nichtproduktionsbranch | `npx wrangler versions upload --config worker/wrangler.toml`         |

Das Build-Image nennt npm 10 als Standard. Deshalb automatische Installation deaktivieren
und npm 11 ausdrücklich aufrufen. Nichtproduktionsbranches erzeugen Vorschauversionen,
keine Änderungen an der Produktions-URL. `npm run deploy` entspricht
`wrangler deploy --config worker/wrangler.toml` und benötigt zuvor gebaute Assets.

## Offizielle Quellen

Für die Einrichtung am 08.09.2026 geprüft:

- [Worker vor Static Assets](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [SPA-Fallback](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Access für den ganzen Worker](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Access-JWT-Verifikation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Google-Identitätsanbieter](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)
- [Access-Richtlinien](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Sitzungen, AJAX und Logout](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build-Image und eigene Installation](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Secrets Store mit Workers](https://developers.cloudflare.com/secrets-store/integrations/workers/)
- [Klassische Worker-Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
