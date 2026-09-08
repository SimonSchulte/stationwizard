# stationwizard einrichten und abnehmen

Stand der Herstellerdokumentation: 8. September 2026. Alle erforderlichen Einstellungen
lassen sich im Browser vornehmen. Die unten genannten Build-Kommandos werden in Cloudflare
eingetragen; dafür brauchst du keinen lokalen Entwicklungsrechner.

Diese Anleitung beschreibt die noch auszuführende Einrichtung. Sie ist kein Nachweis eines
erfolgten Deployments. Den tatsächlich geprüften Entwicklungsstand dokumentiert
`docs/arbeitsstand.md` im Repository.

## Vorher festlegen

| Angabe               | Noch erforderlich                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produktionsadresse   | `stationwizard.altrophie.de` ist vorgeschlagen, noch nicht bestätigt. Bei anderer Wahl alle entsprechenden Adressen dieser Anleitung ersetzen.          |
| DNS-Umzug            | Zustimmung des Domainverantwortlichen und Zugriff auf netcup sowie Cloudflare.                                                                          |
| Bestehende Dienste   | Vollständiger DNS-Bestand; insbesondere klären, ob E-Mail unter `altrophie.de` genutzt wird.                                                            |
| Berechtigte Personen | Konkrete Google-Konto-Adressen, einschließlich mindestens einer Person für die Erstabnahme. Keine Adressen wurden erfunden oder bereits freigeschaltet. |
| Cloudflare           | Konto mit dem vorhandenen Secrets Store; Zero-Trust-Teamdomain und später die Application Audience.                                                     |
| GitHub               | Sechs PRs aus dem Fork über die Vergleichslinks im Browser erstellen, prüfen und durch den Eigentümer übernehmen lassen.                                |

API-Tokens und Freigabepasswörter direkt in die unten genannten Verwaltungsoberflächen
eintragen. Sie gehören weder in GitHub noch in die App oder einen Chat.

Der Produktionsablauf beginnt mit DNS. Eine aktuelle Änderung gegenüber der ursprünglichen
Planung: Cloudflare Access kann inzwischen einen gesamten Worker einschließlich
`workers.dev`, Vorschauen und Custom Domains schützen. Ein vorgeschalteter Google-Login
lässt sich daher auch vor Abschluss des DNS-Umzugs auf der Worker-Adresse testen. Ein eigener
OIDC-Flow ist dafür nicht erforderlich. Für die gewünschte eigene Domain bleibt die aktive
Cloudflare-Zone nötig. [Cloudflare: Access für Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

## 1. DNS von netcup zu Cloudflare umstellen

### 1.1 Bestand vollständig sichern

Im netcup Customer Control Panel `altrophie.de` öffnen. Vor Änderungen die komplette
DNS-Tabelle exportieren, soweit die Oberfläche das anbietet. Andernfalls alle Seiten und
aufgeklappten Werte vollständig als Screenshots sichern. Lange TXT-Werte müssen vollständig
lesbar sein. Bestehende Nameserver und den DNSSEC-Status ebenfalls festhalten.

Diese Einträge einzeln gegen die spätere Cloudflare-Tabelle prüfen:

| Eintrag                  | Was unverändert übernommen werden muss                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A und AAAA               | Hostname und IPv4-/IPv6-Ziel, auch für `@`, `www` und Subdomains.                                                                                                                  |
| CNAME                    | Jeder Alias mit vollständigem Ziel; auch Verifizierungs- und Mail-Aliase.                                                                                                          |
| MX                       | Alle Mailserver und ihre Prioritäten.                                                                                                                                              |
| SPF                      | Vollständiger TXT-Inhalt ab `v=spf1`, einschließlich aller `include`-Angaben.                                                                                                      |
| DKIM                     | Jeder verwendete Selector unter `selector._domainkey`: kompletter TXT-Schlüssel beziehungsweise komplettes CNAME-Ziel. Nicht nur einen vermeintlichen Standardselector übernehmen. |
| DMARC                    | Vollständiger TXT-Inhalt unter `_dmarc`, einschließlich Berichtsadressen und Richtlinie.                                                                                           |
| Weitere TXT, SRV und CAA | Sämtliche Verifizierungen, Dienstziele, Ports, Prioritäten, Gewichte und Zertifikatsvorgaben.                                                                                      |
| Delegierte Subdomains    | Vorhandene NS-Einträge für Teilzonen dokumentieren und erhalten.                                                                                                                   |

Der Scan-Assistent ersetzt diesen Abgleich nicht. Wenn Mail genutzt wird, vor dem Wechsel
eine Testmail von der Domain an ein externes Postfach senden und von dort antworten; so
steht fest, dass beide Richtungen vorher funktionieren.

### 1.2 Cloudflare-Zone vorbereiten

In [Cloudflare](https://dash.cloudflare.com/) eine Domain hinzufügen, `altrophie.de` eingeben
und den passenden angebotenen Tarif wählen. DNS-Einträge importieren beziehungsweise
erfassen. Unter **DNS → Records** jeden Eintrag mit der Sicherung vergleichen.

Mailbezogene A-/AAAA-/CNAME-Einträge bleiben **DNS only** mit grauer Wolke. MX- und TXT-Daten
vollständig erhalten. Bei bestehenden Webdiensten für diesen Umzug zunächst ihr bisheriges
Ziel und Verhalten bewahren. Die zwei zugeteilten Cloudflare-Nameserver aus der Zonenübersicht
notieren. [Cloudflare: vollständige Zoneneinrichtung](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

**Prüfung:** Die vollständige Sicherung und die Cloudflare-Tabelle stimmen überein; besonders
MX, SPF, alle DKIM-Selectoren und DMARC sind vorhanden. Noch keine Nameserver umstellen,
solange dieser Abgleich offen ist.

### 1.3 DNSSEC berücksichtigen und Nameserver bei netcup ersetzen

Falls bisher DNSSEC aktiv ist, die bestehende DNSSEC-Delegation vor dem Nameserverwechsel
bei netcup deaktivieren und die Übernahme abwarten. Alte DNSSEC-Daten dürfen nicht auf die
neue Zone zeigen. Nach erfolgreicher Umstellung kann DNSSEC mit den neuen Cloudflare-Daten
wieder eingerichtet werden. [Cloudflare: DNSSEC beim Nameserverwechsel](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

netcup hat zwei Oberflächen; den zur Domain passenden Weg verwenden:

| Oberfläche     | Klickfolge                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bestand-Domain | **Domains → Lupe neben altrophie.de → DNS → am Seitenende eigene Nameserver**. Die zwei von Cloudflare zugewiesenen Hostnamen eintragen und **Nameserver speichern**.                                               |
| CloudDNS       | **Nameserver Set → Erstellen**. Ein Set mit den zwei Cloudflare-Nameservern speichern. Danach **Domains → Lupe neben altrophie.de → Nameserver → Eigene Nameserver verwenden**, dieses Set auswählen und speichern. |

Nur die tatsächlich zugeteilten Nameserver einsetzen. Der Registrar bleibt netcup; die
DNS-Verwaltung übernimmt Cloudflare. netcup nennt für die weltweite Übernahme bis zu
48 Stunden. [netcup: Bestand-Domains](https://www.netcup.com/de/helpcenter/dokumentation/domain/eigene-nameserver), [netcup: CloudDNS](https://www.netcup.com/de/helpcenter/dokumentation/domain/eigene-nameserver-cloud-dns)

### 1.4 Gegenprüfung nach dem Wechsel

1. Cloudflare zeigt die Zone als **Active** an.
2. Die bei netcup hinterlegten Nameserver stimmen mit Cloudflare überein.
3. Bestehende Webseiten und weitere genutzte Subdomains funktionieren weiterhin.
4. Die DNS-Tabelle nochmals mit der Sicherung abgleichen.
5. Bei Mailbetrieb erneut von der Domain an ein externes Postfach senden und die Antwort
   zurück empfangen. Wenn der Mailanbieter eine DNS-Diagnose anbietet, dort auch SPF, DKIM
   und DMARC prüfen; bloßes Ankommen einer einzelnen Nachricht prüft diese Einträge nicht
   vollständig.

Nach erfolgreicher Umstellung bei Bedarf DNSSEC in Cloudflare aktivieren und die dort
angezeigten Daten im passenden netcup-DNSSEC-Dialog hinterlegen. Die netcup-Dokumentation
beschreibt für Bestand-Domains **öffentlichen Schlüssel, Flags und Algorithmus**; ihre FAQ
nennt keine Unterstützung für die direkte Eingabe eines DS-Eintrags. Deshalb nicht einen
DS-Text in ein Feld für öffentliche Schlüssel kopieren. Falls die angebotenen Felder nicht
zu Cloudflares Angaben passen, diesen Schritt über den netcup-Support klären.
[netcup: DNSSEC bei eigenen Nameservern](https://www.netcup.com/de/helpcenter/dokumentation/domain/eigene-nameserver)

## 2. Pull Requests im Browser erstellen und geprüften Code übernehmen

Der Fork [stexeflex/stationwizard](https://github.com/stexeflex/stationwizard) enthält die
AP-Branches. Die automatische PR-Erstellung im Original wurde von der GitHub-Anbindung
mit HTTP 403 (`Resource not accessible by integration`) abgewiesen. Es wurden noch keine
PRs erstellt. Mit deinem persönlichen GitHub-Login kannst du die vorbereiteten PRs im
Browser absenden; eine lokale Git-Installation ist nicht erforderlich.

Pull Requests aus dem Fork benötigen keine Schreibrechte auf `SimonSchulte/stationwizard`.
Nur die Übernahme ins Original erfolgt durch dessen Eigentümer beziehungsweise eine dort
berechtigte Person.
[GitHub: Pull Request aus einem Fork](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request-from-a-fork)

1. Bei GitHub als `stexeflex` anmelden. In [Pull Requests](pull-requests.md) den Vergleichslink
   für AP1 öffnen. Prüfen: Basis `SimonSchulte/stationwizard`, Branch `main`; Quelle
   `stexeflex/stationwizard`, Branch `ap1-geruest-uebernahme`.
2. **Create pull request** wählen, den vorbereiteten Titel und Beschreibungstext des APs
   eintragen und mit **Create pull request** absenden. Die entstandene URL enthält
   `/pull/<Nummer>`; erst dann ist tatsächlich ein PR erstellt.
3. Dasselbe für AP2 bis AP6 mit dem jeweiligen Branch wiederholen. Über den Pfeil neben
   dem Absenden-Button **Create draft pull request** wählen. Diese Folgepakete hängen
   jeweils vom Vorgänger ab und bleiben bis zu dessen Übernahme Entwürfe. Alle PRs zielen
   auf `main`; solange Vorgänger fehlen, zeigt ein Folge-PR auch deren Änderungen an.
4. In jedem PR die Prüfungen für Build, Tests und Formatierung abwarten und den Diff prüfen.
   Falls GitHub den Workflow eines externen Beitrags zurückhält, als berechtigte Person
   nach Prüfung **Awaiting approval → Approve workflows to run** wählen. Nur erfolgreiche,
   geprüfte Stände übernehmen. [GitHub: Workflow-Freigabe](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks)
5. AP1 bis AP5 mit **Create a merge commit** übernehmen, damit die gemeinsamen
   Commit-Vorfahren erhalten bleiben. Danach zeigt der nächste PR nur noch das nächste
   AP; diesen mit **Ready for review** zur Prüfung freigeben. Bei Squash- oder Rebase-Merges
   müssen stattdessen die Folgebranches vor ihrer Prüfung auf den neuen Stand gebracht werden.
6. Der Standardbranch des neuen Repositorys bleibt `main`. Unter **Settings → Actions**
   GitHub Actions für die Prüf-Workflows erlauben. Für Cloudflare Workers Builds ist kein
   zusätzlicher Pages-Workflow nötig.

**Prüfung:** Auf GitHub enthält `main` die Angular-App, `worker/wrangler.toml`,
`package-lock.json` und die neue Dokumentation. Die Prüfläufe des übernommenen Commits sind
grün. Eine unverändert leere `README.md` bedeutet, dass die Übergabe noch fehlt.

## 3. Nextcloud-Freigaben und HiOrg-Zugang vorbereiten

### 3.1 Ausbildungs-Arbeitsmappe

In Nextcloud eine Sicherung der bestehenden Excel-Datei erstellen. Für den Ersttest eine
Kopie mit erfundenen Inhalten verwenden; ihre Blätter heißen weiterhin **Jahresplan**,
**Offene Ideen** und **KatS-A-Plan**.

Die **Datei selbst** per Link freigeben und Lesen sowie Bearbeiten/Hochladen erlauben.
Eine reine Ansicht oder eine ausschließlich zum Ablegen von Dateien gedachte Freigabe
genügt nicht. Ein vorhandenes Freigabepasswort aufbewahren. Aus dem Freigabelink den Teil
hinter `/s/` übernehmen; nur dieser Teil ist der Token.

Beispiel ausschließlich zur Form: Aus `https://cloud.example.org/s/AbCdEf123` wird der Token
`AbCdEf123`; die Basis-URL ist `https://cloud.example.org`. Bei einer Installation in einem
Unterverzeichnis gehört dieses zur Basis, beispielsweise `https://example.org/nextcloud`.

Diese Konfiguration übernimmt das Verfahren des bisherigen Workers:
`NEXTCLOUD_BASE_URL` plus `/public.php/webdav/`, authentifiziert mit Freigabetoken und
gegebenenfalls Freigabepasswort. Die Freigabe-URL selbst wird nicht als Basis eingetragen.

### 3.2 Einsatzpläne

Einen **eigenen Nextcloud-Ordner** für gespeicherte Einsatzpläne erstellen, etwa
`stationwizard-einsatzplaene`. Den Ordner per Link mit **Lesen, Bearbeiten und Hochladen**
freigeben. Dafür den gesonderten Token `NEXTCLOUD_PEP_SHARE_TOKEN` verwenden. Bei einem
Passwort kommt `NEXTCLOUD_PEP_SHARE_PASSWORD` hinzu.

Der Ordner muss auf derselben Nextcloud-Instanz liegen wie die Arbeitsmappe. Pro Planung
legt die App eine Datei `<UUID>.pep.json` ab. Das bestehende Format mit `version`, `meta`
und `planung` bleibt erhalten. Der Ordner ist erforderlich, damit Einsatzpläne über den
Worker auch gespeichert und später wieder geladen werden können. Die bekannten drei
EFS-Aktionen bieten dafür keinen nachgewiesenen Schreibweg.

**Prüfung:** Die Arbeitsmappenfreigabe öffnet genau die beabsichtigte Datei. Die zweite
Freigabe zeigt den Einsatzplanordner und erlaubt dort testweise das Hochladen und Bearbeiten
einer erfundenen Testdatei. Diesen Test direkt in Nextcloud durchführen und die Testdatei
anschließend dort entfernen.

### 3.3 HiOrg-Server

Den bereits für den bisherigen Einsatzplaner funktionierenden EFS-API-Token weiterverwenden.
Die vollständige dort verwendete EFS-Endpunkt-URL kommt in `HIORGSERVER_BASE_URL`; nach
vorliegender Implementierung ist das `https://www.hiorg-server.de/api/efs/`.

Für einen weiterhin gültigen bestehenden Token ist keine zusätzliche HiOrg-Einstellung
nachgewiesen. Falls kein gültiger Token vorhanden ist, muss der HiOrg-Verantwortliche den
EFS-Zugang der Organisation bereitstellen. Ein konkreter Menüpfad zur Tokenverwaltung oder
weitere notwendige Freischaltungen konnten nicht gegen die echte HiOrg-Verwaltung geprüft
werden und werden deshalb hier nicht erfunden.

Der Worker verwendet ausschließlich `checkapikey`, `getveranstaltungen` und
`getveranstaltung` mit `version=2`. Die URL stammt zur Laufzeit aus dem Secret. Google-Login
und Cloudflare-Callback werden nicht bei HiOrg eingetragen.

## 4. Secrets Store befüllen

Im richtigen Cloudflare-Konto **Secrets Store** öffnen. Der vorhandene Store muss die ID
`36762a3b5aa547bea7f547b1d66c30ee` haben. Vorhandene korrekte Einträge weiterverwenden;
fehlende über **Create secret** anlegen und als Permission scope **Workers** wählen.
Nach dem Speichern zeigt die Oberfläche den Secret-Wert nicht mehr an.
[Cloudflare: Secrets Store mit Workers verbinden](https://developers.cloudflare.com/secrets-store/integrations/workers/)

Die ersten fünf Werte werden im Store angelegt. Die zwei optionalen Freigabepasswörter
werden später gemäß Abschnitt 7.3 als klassische Laufzeit-Secrets direkt am Worker gesetzt.

| Name                           | Wert und Format                                                                                                                                       | Pflicht                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `NEXTCLOUD_BASE_URL`           | HTTPS-Basis der bestehenden Nextcloud-Installation, gegebenenfalls mit Installationsunterverzeichnis; ohne `/s/TOKEN` und ohne `/public.php/webdav/`. | Ja                                   |
| `NEXTCLOUD_SHARE_TOKEN`        | Nur der Token der Excel-Dateifreigabe, ohne URL.                                                                                                      | Ja                                   |
| `HIORGSERVER_BASE_URL`         | Vollständiger bisher funktionierender HTTPS-EFS-Endpunkt; siehe Abschnitt 3.3.                                                                        | Ja                                   |
| `HIORGSERVER_EFS_API_TOKEN`    | Unveränderter EFS-API-Schlüssel; ohne `apikey=`, ohne Anführungszeichen.                                                                              | Ja                                   |
| `NEXTCLOUD_PEP_SHARE_TOKEN`    | Nur der Token des gesonderten Einsatzplanordners.                                                                                                     | Ja, für Einsatzpläne laden/speichern |
| `NEXTCLOUD_SHARE_PASSWORD`     | Exaktes Passwort der Excel-Freigabe.                                                                                                                  | Nur bei gesetztem Freigabepasswort   |
| `NEXTCLOUD_PEP_SHARE_PASSWORD` | Exaktes Passwort der Ordnerfreigabe.                                                                                                                  | Nur bei gesetztem Freigabepasswort   |

Ohne Freigabepasswort den jeweiligen optionalen Eintrag beziehungsweise sein Binding
weglassen. Niemals Texte wie `leer`, `optional` oder `<Passwort>` als Ersatz eintragen.
Keine zusätzlichen Leerzeichen oder Zeilenumbrüche an Tokens anhängen.

`APP_SHARED_SECRET` wird vom neuen Worker nicht verwendet. Den bestehenden Eintrag erst
entfernen, wenn der alte Worker stillgelegt ist und kein anderer Verbraucher ihn benötigt.
Google Client ID und Client Secret werden später beim Cloudflare-Identitätsanbieter
hinterlegt, nicht als Worker-Secrets.

**Prüfung:** Die fünf Pflichtnamen sind im richtigen Store vorhanden und für Workers
freigegeben. Optional vorhandene Passwörter entsprechen der jeweiligen Freigabe.

## 5. Zero Trust und Google als Identitätsanbieter

### 5.1 Teamdomain festlegen

Im Cloudflare-Konto **Zero Trust** öffnen und gegebenenfalls die Einrichtung abschließen.
Unter **Settings → Team name and domain** die Teamdomain ablesen. Sie hat die Form
`https://<teamname>.cloudflareaccess.com`. Den echten Teamnamen in den folgenden Angaben
einsetzen. Eine noch nicht bekannte Teamdomain kann nicht durch die App-Domain ersetzt
werden. [Cloudflare: Google anbinden](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)

### 5.2 Google Cloud Console

In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt für
`stationwizard` erstellen oder das dafür vorgesehene Projekt auswählen. **Google Auth
Platform → Branding** beziehungsweise **APIs & Services → OAuth consent screen** öffnen.
App-Name, Supportadresse und Kontaktadresse eintragen. Für private Google-Konten eine
externe Zielgruppe wählen. Wenn die Oberfläche Testnutzer verlangt, die vorgesehenen
Abnahmeadressen hinzufügen. Nur Identitätsdaten für die Anmeldung verwenden; diese App
benötigt keine Google-Drive- oder Gmail-Berechtigungen. Den dort angezeigten
Veröffentlichungsstatus vor dem Regelbetrieb prüfen und gegebenenfalls die Freigabe in der
Google-Oberfläche abschließen. [Google: Consent Screen einrichten](https://developers.google.com/workspace/guides/configure-oauth-consent)

Einen OAuth-Client vom Typ **Web application** anlegen. Folgende Felder exakt setzen:

| Google-Feld                   | Eintrag                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| Authorized JavaScript origins | `https://<teamname>.cloudflareaccess.com`                         |
| Authorized redirect URIs      | `https://<teamname>.cloudflareaccess.com/cdn-cgi/access/callback` |

`<teamname>` durch den echten Wert ersetzen, ohne spitze Klammern. Client ID und Client
Secret anschließend in Cloudflare unter **Zero Trust → Integrations → Identity providers
→ Add new identity provider → Google** eintragen und speichern. Über **Test** neben Google
die Anmeldung prüfen. Die OAuth-Daten bleiben beim Identitätsanbieter.
[Cloudflare: Google-Konfiguration und Callback](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)

**Prüfung:** Der Google-Identitätsanbieter besteht den Test. Dieser Test allein gewährt noch
keinen Zugriff auf stationwizard; dafür folgt die konkrete Access-Richtlinie.

## 6. Worker mit Git-Integration anlegen

Voraussetzungen: Die geprüften APs liegen in `main`; die Pflicht-Secrets existieren. Im
Cloudflare-Konto **Workers & Pages** öffnen, einen Worker aus dem GitHub-Repository
`SimonSchulte/stationwizard` erstellen beziehungsweise den vorgesehenen Worker damit
verbinden. Die Cloudflare-GitHub-App benötigt Zugriff auf genau dieses Repository.

Die Git-Integration im Worker unter **Settings → Build** so konfigurieren:

| Einstellung                          | Wert                                                                 |
| ------------------------------------ | -------------------------------------------------------------------- |
| Worker-/Projektname                  | `stationwizard`, passend zu `name` in `worker/wrangler.toml`         |
| Repository                           | `SimonSchulte/stationwizard`                                         |
| Production branch                    | `main`                                                               |
| Root directory                       | Repository-Wurzel: `/`, nicht `worker/`                              |
| Build command                        | `npx npm@11 ci && npm run format:check && npm test && npm run build` |
| Deploy command                       | `npm run deploy`                                                     |
| Non-production branch deploy command | `npx wrangler versions upload --config worker/wrangler.toml`         |

Build und Deploy sind getrennte Schritte. Das Build-Script erzeugt die Angular-Dateien und
prüft den Worker. Die Konfiguration bindet `dist/stationwizard/browser` als Static Assets
ein. Branch-Vorschauen ändern die Produktionsversion nicht.
[Cloudflare: Workers Builds konfigurieren](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

Unter **Settings → Build → Build Variables and Secrets** zusätzlich setzen:

| Build-Variable            | Wert   |
| ------------------------- | ------ |
| `NODE_VERSION`            | `24`   |
| `SKIP_DEPENDENCY_INSTALL` | `true` |

Der automatische Installationsschritt wird damit übersprungen. Das Build-Kommando
installiert ausdrücklich mit npm 11, weil das Cloudflare-Build-Image derzeit npm 10 als
Standard nennt. Secrets für Nextcloud und HiOrg gehören nicht in diese Build-Karte.
[Cloudflare: Build-Image und eigene Installation](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)

Den ersten Build auslösen. Solange Access-Laufzeitvariablen fehlen, beantwortet der Worker
Anfragen mit **503 / ACCESS_KONFIGURATION_FEHLT**. Das ist der vorgesehene gesperrte Zustand
bis zur vollständigen Login-Einrichtung.

**Prüfung:** Die Build-Ausgabe zeigt erfolgreiche Format-, Test- und Build-Schritte; das
Deployment nennt den beabsichtigten `main`-Commit. Die Worker-Adresse aus der Oberfläche
notieren. Bei fehlendem Secret oder Berechtigungsfehler den Store, seinen Workers-Scope und
die Rechte der Cloudflare-Deploy-Identität prüfen.

## 7. Gesamten Worker mit Access schützen und Laufzeit konfigurieren

### 7.1 Richtlinie mit konkreten Adressen

Im Worker **Access → Protect this Worker behind Access** öffnen. **All traffic** wählen;
so werden Produktion und Vorschauen des Workers geschützt. Die erzeugte Access-Anwendung
in Zero Trust aufrufen und ihre Richtlinie bearbeiten.
[Cloudflare: einen gesamten Worker schützen](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

| Richtlinienfeld | Einstellung                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| Name            | Beispielsweise `stationwizard – freigegebene Nutzer`                            |
| Action          | `Allow`                                                                         |
| Include         | `Emails`: jede tatsächlich freigegebene Google-Konto-Adresse einzeln eintragen. |
| Require         | `Login Methods`: den eingerichteten Google-Identitätsanbieter auswählen.        |

Die Zugriffsliste ist noch zu liefern; keine Musteradressen eintragen. **Everyone/Anyone**,
eine allgemeine Google-Include-Regel oder eine `Bypass`-Regel würden die beabsichtigte
Begrenzung unterlaufen. Bestehende weitere Allow-/Bypass-Regeln auf dieser Anwendung
entfernen oder gezielt korrigieren, falls sie den Zugriff erweitern. Wenn ausdrücklich eine
ganze Google-Workspace-Domain berechtigt sein soll, diese Entscheidung zuerst treffen;
`gmail.com` wäre keine sinnvolle Organisationsbeschränkung.
[Cloudflare: Access-Richtlinien](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)

### 7.2 Audience und Teamdomain als Laufzeitvariablen setzen

Unter **Zero Trust → Access controls → Applications → stationwizard → Configure →
Additional settings** den **Application Audience (AUD) Tag** kopieren. Die Audience gehört
genau zu der Anwendung, die den gesamten Worker schützt. Wird diese Anwendung später neu
erstellt, muss die neue Audience auch im Worker gesetzt werden.
[Cloudflare: AUD ermitteln und JWT prüfen](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

Im Worker **Settings → Variables and Secrets** öffnen, außerhalb des Bereichs **Build**,
und die folgenden **Text-Laufzeitvariablen** setzen:

| Variable             | Exaktes Format                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `ACCESS_TEAM_DOMAIN` | `https://<teamname>.cloudflareaccess.com`, mit `https://`, ohne abschließenden Schrägstrich. |
| `ACCESS_AUD`         | Kopierter Application Audience Tag, ohne Anführungszeichen oder zusätzliche Leerzeichen.     |

Speichern und die Konfigurationsänderung deployen. Es gibt keinen produktiven
Entwicklungs- oder Login-Bypass. Der Worker prüft jedes Access-JWT einschließlich Signatur,
Aussteller, Audience und Ablaufzeit; ein beliebiger gleichnamiger Header genügt nicht.

### 7.3 Secret-Bindings kontrollieren

Im Worker **Bindings** beziehungsweise **Settings → Bindings** die Laufzeitbindungen
prüfen. Für jeden Pflichtnamen aus Abschnitt 4 muss die Verbindung zum passenden Secret im
Store `36762a3b5aa547bea7f547b1d66c30ee` vorhanden sein. Die Namen müssen exakt übereinstimmen.

Falls eine Freigabe ein Passwort verwendet, im Worker **Settings → Variables and Secrets
→ Add** öffnen, außerhalb des Bereichs **Build**. Typ **Secret** wählen. Für die
Excel-Dateifreigabe `NEXTCLOUD_SHARE_PASSWORD`, für den Ordner
`NEXTCLOUD_PEP_SHARE_PASSWORD` als Namen setzen; als Wert das jeweilige exakte
Freigabepasswort eintragen und deployen. Ohne Passwort den Eintrag weglassen. Für diese
klassischen Worker-Secrets muss kein Wert und kein zusätzlicher Passwort-Bindingblock
ins Repository geschrieben werden.
[Cloudflare: Worker-Secrets im Dashboard](https://developers.cloudflare.com/workers/configuration/secrets/)

Der Worker unterstützt beide Zugangsformen: Ein Secrets-Store-Binding ist ein Objekt,
dessen `get()` den Wert auflöst; ein klassisches Worker-Secret liefert den Wert direkt.
Dass ein Binding im Dashboard angezeigt wird, prüft noch nicht seinen Inhalt.

`keep_vars = true` erhält die Laufzeit-Textvariablen bei Deployments; es ersetzt weder
Secrets noch Bindings. Der Schlüssel bleibt vor allen TOML-Tabellen stehen.

**Prüfung:** Die Worker-Adresse im privaten Browserfenster verlangt eine Anmeldung. Eine
freigegebene Google-Adresse erreicht die App und sieht ihre E-Mail-Adresse in der Shell.
Ein anderes Google-Konto wird abgelehnt. Anschließend
`https://<worker-adresse>/api/benutzer` öffnen: Die Antwort enthält die eigene E-Mail-Adresse.

## 8. Custom Domain verbinden

Die Cloudflare-Zone muss aktiv und der Hostname bestätigt sein. Im Worker **Settings →
Domains & Routes → Add → Custom Domain** öffnen, `stationwizard.altrophie.de` eintragen und
hinzufügen. Cloudflare ordnet die Domain dem Worker zu und verwaltet das Zertifikat.
Konfliktmeldungen zu bestehenden DNS-Einträgen zuerst gegen die Sicherung prüfen; nicht
versehentlich einen bereits genutzten Dienst ersetzen.
[Cloudflare: Custom Domain einrichten](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

Nach Bestätigung des Hostnamens die Domain außerdem reproduzierbar in
`worker/wrangler.toml` ergänzen, falls sie dort noch nicht steht. Im GitHub-Dateieditor am
Ende der Datei ergänzen und als kleine Änderung über einen geprüften PR übernehmen:

```toml
[[routes]]
pattern = "stationwizard.altrophie.de"
custom_domain = true
```

Die vorgeschlagene Domain darf erst nach der tatsächlichen Bestätigung eingesetzt werden.
Keine eigene IP-Adresse und keinen CNAME auf eine Preview-Adresse erfinden.

**Prüfung:** [stationwizard öffnen](https://stationwizard.altrophie.de/). Zertifikat gültig,
Google-Login vorgeschaltet, beide Fachbereiche erreichbar. Der bereits eingerichtete
Schutz für **All traffic** gilt auch hier. Zusätzlich direkte Worker-Adresse und eine
Vorschauadresse jeweils ohne Anmeldung prüfen: Auch diese müssen geschützt bleiben.

## 9. Fachliche Abnahme vollständig im Browser

Die folgende Tabelle erst nach Durchführung abhaken. Für Schreibtests zunächst Testkopien
und erfundene Einsatzdaten nutzen. Danach mit dem fachlich Verantwortlichen auf die
beabsichtigten produktiven Freigaben umstellen.

Vor einem Neuladen der Seite lokale Änderungen speichern oder als Datei herunterladen.
Nach dem Neuladen muss eine Einsatzplanung bewusst erneut aus der gespeicherten Liste
oder einer JSON-Datei geöffnet werden. Die Editor-URL allein lädt keine Planung.

Die App behält vorerst Hash-Routing: `/#/ausbildung`, `/#/einsatz` und
`/#/einsatz/editor`. Der konfigurierte SPA-Fallback konnte wegen des blockierten
workerd-Laufzeitstarts noch nicht erfolgreich nachgewiesen werden. Erst nach bestandenem
`npm run test:spa` und Browserprüfung darf auf saubere Pfade umgestellt werden.

| Prüfung                | Vorgehen und erwartetes Ergebnis                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ohne Anmeldung         | Privates Browserfenster → App und `/api/status` öffnen. Access verlangt Anmeldung; keine Planungsdaten sichtbar.                                                                                                  |
| Erlaubte Adresse       | Mit freigegebenem Google-Konto anmelden. Shell zeigt diese E-Mail-Adresse.                                                                                                                                        |
| Nicht erlaubte Adresse | Separates privates Fenster mit anderem Google-Konto. Access lehnt den Zugriff ab.                                                                                                                                 |
| Worker erreichbar      | Angemeldet `/api/status` öffnen. JSON zeigt `status: erreichbar`. Das prüft den Worker, noch nicht Nextcloud oder HiOrg.                                                                                          |
| Benutzerkontext        | Angemeldet `/api/benutzer` öffnen. JSON enthält die eigene E-Mail-Adresse.                                                                                                                                        |
| Routen und Neuladen    | `/#/ausbildung` und `/#/einsatz` direkt öffnen und neu laden: App statt 404. `/#/einsatz/editor` ohne aktive Planung zeigt „Keine Planung geöffnet“; über „Zur Übersicht“ eine gespeicherte Planung erneut laden. |
| Ausbildung lesen       | Quelle **Nextcloud** auswählen und **Arbeitsmappe laden**. Jahresplan, Ideen und KatS-A-Inhalte der Testmappe erscheinen.                                                                                         |
| Ausbildung schreiben   | Eine erfundene Änderung speichern. Seite neu laden und Arbeitsmappe nochmals laden. Änderung ist erhalten; die Datei in Nextcloud bleibt eine lesbare Excel-Arbeitsmappe.                                         |
| EFS-Verbindung         | Einsatzplanung öffnen. Veranstaltungsliste laden und eine Veranstaltung zum Detailimport auswählen. Veranstaltung und Einsatzkräfte erscheinen ohne Eingabe eines Schlüssels.                                     |
| Einsatzplan schreiben  | Eine Planung mit erfundenen Inhalten erstellen, **In Nextcloud speichern** wählen. Im Ordner erscheint eine UUID-Datei mit Endung `.pep.json`.                                                                    |
| Einsatzplan lesen      | Seite neu laden. Unter **Gespeicherte Einsatzpläne** den Testplan mit **Laden** öffnen. Posten, Qualifikationen und Zuordnungen stimmen mit dem gespeicherten Stand überein.                                      |
| Dateiexport            | **JSON herunterladen** und vorhandenen PDF-Export testen. Das JSON bleibt im bisherigen versionierten PEP-Format; der PDF-Inhalt ist lesbar.                                                                      |
| Desktop                | Beide Fachbereiche, Dialoge, Ausbildungs-Drag-and-Drop und PEP-Zuordnung mit Qualifikationsfarben bedienen.                                                                                                       |
| Mobil                  | Auf dem echten Telefon Anmeldung, Navigation, Ausbildungs-Listen-/Planumschaltung, Laden/Speichern und den PEP-Editor ausprobieren. Einschränkungen konkret notieren.                                             |
| Abmeldung              | **Abmelden** benutzen. Danach eine geschützte URL erneut öffnen; die Anwendung benötigt wieder eine gültige Access-Anmeldung.                                                                                     |

Die Abmeldeadresse lautet bei der vorgeschlagenen Domain
`https://stationwizard.altrophie.de/cdn-cgi/access/logout`. Sie widerruft die Access-Sitzung
auch für andere Access-Anwendungen dieses Teams. Das lokale Anwendungscookie wird sofort
gelöscht; bereits ausgestellte Tokens werden laut Cloudflare nach 20–30 Sekunden nicht
mehr akzeptiert. Das Google-Konto selbst wird dadurch nicht überall abgemeldet. Eine noch
bestehende Google-Sitzung kann beim erneuten Login die Kontoanmeldung verkürzen.
[Cloudflare: Sitzungen und Abmeldung](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)

Die EFS-Endpunkte akzeptieren POST-Aufrufe der App:
`/api/efs/checkapikey`, `/api/efs/getveranstaltungen` und
`/api/efs/getveranstaltung`. Ein direktes Öffnen dieser URLs in der Adresszeile sendet GET
und ist kein Funktionstest. Die Nextcloud-Endpunkte sind
`/api/nextcloud/arbeitsmappe`, `/api/nextcloud/planungen` und
`/api/nextcloud/planungen/<UUID>`. Es wird keine unbekannte EFS-Schreibaktion verwendet.

Gespeicherte Einsatzpläne erscheinen zunächst mit ihrer UUID; Namen werden erst nach
bewusstem Laden einer einzelnen Planung oder nach dem Speichern bekannt. Einsatzpläne
werden ausdrücklich über **In Nextcloud speichern** gesichert, nicht automatisch.
Schlägt dieser Vorgang mit einem Konflikt **412** fehl, hat sich die gespeicherte Datei
zwischenzeitlich geändert. Die lokalen Änderungen bleiben erhalten: zuerst **JSON
herunterladen**, anschließend den gespeicherten Stand neu laden und die gewünschten
Änderungen zusammenführen. Ein erneutes blindes Überschreiben ist nicht vorgesehen.

Fehlt ein starker ETag für eine geladene Datei, wird ein Update ebenfalls verhindert.
Dann eine lokale Kopie sichern, den gespeicherten Stand erneut laden und das ETag-Verhalten
der Nextcloud-Freigabe prüfen. `GET /api/nextcloud/planungen` darf dabei `etag: null`
enthalten; diese Liste allein bestätigt noch keine sichere Schreibmöglichkeit.

Die App bekommt für ihre Sitzung den von Cloudflare Access verwalteten Anmeldestatus.
HiOrg-API-Schlüssel, Nextcloud-Tokens und Freigabepasswörter werden nicht an sie
weitergegeben. Alte Browserdaten des bisherigen Einsatzplaners bleiben auf dessen alter
Origin getrennt; nach dessen Stilllegung dort die Website-Daten löschen, damit ein früher
gespeicherter `pep_efs_api_key` nicht weiter im alten Browserprofil liegt.

Optional, falls später eine Konsole verfügbar ist: Ein anonymer Aufruf mit
`curl -i https://stationwizard.altrophie.de/api/status` darf keine erfolgreiche
API-Datenantwort liefern. Diese Prüfung ist für die Einrichtung im Browser nicht nötig.
Service-Tokens werden nur eingerichtet, wenn automatisierter Zugriff tatsächlich benötigt
wird; für diese Abnahme sind sie nicht erforderlich.

## 10. Häufige Fehler zuordnen

| Beobachtung                                                           | Nächster Schritt                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build scheitert beim Installieren                                     | `SKIP_DEPENDENCY_INSTALL=true` in den **Build**-Variablen und `npx npm@11 ci` am Anfang des Build-Kommandos prüfen. Root directory ist die Repository-Wurzel.           |
| Neuer Branch, alte Produktionsseite                                   | Preview-URL aus dem Build/PR öffnen. Erst der `main`-Deploy aktualisiert Produktion.                                                                                    |
| `ACCESS_KONFIGURATION_FEHLT`                                          | Laufzeitvariablen prüfen: Teamdomain mit `https://`, ohne End-Slash; korrekter AUD-Tag ohne Leerzeichen.                                                                |
| `ACCESS_TOKEN_FEHLT`                                                  | Access-Schutz fehlt auf diesem Zugangsweg oder die Anmeldung ist noch nicht erfolgt. **All traffic** und die richtige Worker-Zuordnung prüfen.                          |
| `ACCESS_TOKEN_UNGUELTIG`                                              | Richtige Access-Anwendung/Audience kontrollieren; abmelden und neu anmelden. Nicht einen Header manuell ergänzen.                                                       |
| `ACCESS_TOKEN_ABGELAUFEN`                                             | Neu anmelden.                                                                                                                                                           |
| `ACCESS_PRUEFUNG_NICHT_ERREICHBAR`                                    | Später erneut versuchen; Teamdomain prüfen. Die Schlüsselprüfung wird bei Fehlern nicht übersprungen.                                                                   |
| Nextcloud-Fehler                                                      | Richtige Instanz, Datei- beziehungsweise Ordnerfreigabe, Token, Passwort, Schreibrechte und Ablaufdatum prüfen. Danach das Laufzeit-Binding am richtigen Worker prüfen. |
| HiOrg-Verbindungsfehler                                               | EFS-Endpunkt und Token im Store sowie die beiden Laufzeit-Bindings prüfen; HiOrg-Verantwortlichen die Gültigkeit des EFS-Zugangs prüfen lassen.                         |
| Geheimnis im Store vorhanden, Anwendung meldet fehlende Konfiguration | Unter **Bindings** kontrollieren, ob genau dieser Worker genau dieses Secret verwendet. Ein Eintrag unter **Build Variables and Secrets** genügt nicht.                 |
| `redirect_uri_mismatch` beim Google-Login                             | Redirect URI in Google exakt mit `https://<teamname>.cloudflareaccess.com/cdn-cgi/access/callback` vergleichen.                                                         |

Der Worker liefert feste Fehlercodes im JSON und im Header
`X-Stationwizard-Diagnose`. Diese Codes ermöglichen die Einordnung ohne Ausgabe von
Tokenwerten oder personenbezogenen Upstream-Antworten. Bei einem Fehler die Meldung und
den betroffenen Funktionsschritt notieren, keine Zugangsdaten versenden.

## 11. Altsysteme erst nach erfolgreicher Abnahme stilllegen

1. Vorher die produktive Excel-Arbeitsmappe und benötigte `.pep.json`-Dateien sichern und im
   neuen System erfolgreich öffnen. Die neuen Speicherorte mit den Nutzern abstimmen.
2. In den beiden bisherigen READMEs einen Hinweis auf `SimonSchulte/stationwizard` und die
   bestätigte neue App-Adresse ergänzen. Das neue README verlinkt beide Quellrepositorys;
   ihre Historie bleibt dort erhalten.
3. Beim bisherigen Ausbildungsplaner unter **Settings → Pages** die veröffentlichte Seite
   über **Unpublish site** zurückziehen und den alten Pages-Deployment-Workflow deaktivieren.
   Alternativ eine bewusst eingerichtete Weiterleitung behalten; dafür muss zuerst die
   endgültige Zieladresse feststehen. [GitHub: Pages-Veröffentlichung zurückziehen](https://docs.github.com/en/pages/getting-started-with-github-pages/unpublishing-a-github-pages-site)
4. Beim bisherigen Einsatzplaner prüfen, ob überhaupt Pages oder ein anderes Hosting aktiv
   ist. Kein Pages-Deployment wird vorausgesetzt. Gegebenenfalls ebenfalls abschalten.
5. Beide Altrepositorys jeweils unter **Settings → General → Danger Zone → Archive this
   repository** archivieren und die Bestätigung durchführen. Dies macht das Repository
   schreibgeschützt. [GitHub: Repository archivieren](https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories)
6. Den alten Nextcloud-Worker erst abschalten, wenn alle Nutzer die neue App verwenden.
   Danach nicht mehr benötigte alte Zugangsschlüssel und Freigaben gezielt widerrufen;
   gemeinsam genutzte Secrets erhalten.

**Prüfung:** Die zwei alten Repositorys zeigen den Archivhinweis. Die neue App ist in ihren
READMEs erreichbar. Die alte Pages-Adresse ist abgeschaltet oder führt bewusst zum neuen
Ziel. Keine produktive Planung wird noch über den alten Worker gespeichert.

## Noch nicht als erledigt bestätigt

- Produktionshostname, Zustimmung zum DNS-Umzug, Mailbestand und konkrete Zugriffsliste
  müssen festgelegt beziehungsweise geprüft werden.
- Wegen HTTP 403 (`Resource not accessible by integration`) wurden noch keine PRs
  automatisch erstellt. Sie müssen über die vorbereiteten Vergleichslinks im Browser
  erstellt und anschließend geprüft sowie in Reihenfolge übernommen werden. Ein Merge
  auf `main` ist noch nicht erfolgt.
- Cloudflare-Git-Integration, Deployment, DNS-Umzug, Google-Login sowie echte Nextcloud- und
  HiOrg-Aufrufe sind durch lokale Tests nicht verifiziert.
- Die versuchte Cloud-Browser-Vorschau wurde in dieser Umgebung mit
  `ERR_BLOCKED_BY_CLIENT` blockiert. Daraus lässt sich keine erfolgreiche Desktop- oder
  Mobilabnahme ableiten. Spätere erfolgreiche Prüfungen sind mit konkretem Ergebnis im
  Arbeitsstand zu ergänzen.
- Archivierung und Stilllegung der Altsysteme sind noch nicht erfolgt und gehören an das
  Ende der erfolgreichen fachlichen Abnahme.
