# stationwizard – Umsetzungs- und Übergabebericht

**Stand: Alle sechs Arbeitspakete sind lokal umgesetzt und geprüft. Die App ist noch nicht produktiv bereitgestellt.**

Ausbildungs- und Einsatzplaner sind in einer Angular-21-App zusammengeführt. Der neue
Cloudflare Worker enthält den Zugangsschutz sowie die Nextcloud- und EFS-Anbindung.
Die lokale Umsetzung ist damit vorbereitet, die Definition of Done aber noch nicht
vollständig erfüllt: echte Anmeldung, produktive Datenverbindungen und die visuelle
Abnahme fehlen. Die AP-Branches werden über den Fork
[stexeflex/stationwizard](https://github.com/stexeflex/stationwizard) bereitgestellt.
Die GitHub-Anbindung verweigert die PR-Erstellung im Original mit HTTP 403
(`Resource not accessible by integration`); es wurden noch keine PRs erstellt.
[Vorbereitete Vergleichslinks](pull-requests.md) ermöglichen die Erstellung im Browser.

Die vollständige Anleitung für sämtliche verbleibenden Weboberflächen-Schritte steht in
[Einrichtung und Abnahme](einrichtung.md). Ein lokaler Entwicklungsrechner ist dafür
nicht erforderlich. Den laufend ergänzten Prüfnachweis enthält
[Arbeitsstand](arbeitsstand.md).

## Was zusammengeführt wurde

- Gemeinsame Angular-Shell mit Startseite und zwei getrennten Fachbereichen unter
  `src/app/ausbildung/` und `src/app/einsatz/`. Der gemeinsame Kern enthält den
  Worker-Client, Dateispeicherverträge und Kalenderhilfen.
- Einheitliche Angular-/Material-Versionen und Vitest als Testbasis. Die vorhandenen
  Fachtests wurden übernommen; Karma/Jasmine wurde abgelöst.
- Ausbildungsplanung mit Wochenraster, Ideen, Auswertung, KatS-A-Plan und Feiertagen.
  Excel bleibt das führende Format; die drei bestehenden Arbeitsmappenblätter bleiben
  erhalten. Der öffentliche Feiertagsabruf benötigt keine Zugangsdaten und besitzt
  weiterhin eine lokale Berechnungsrückfallebene.
- Einsatzplanung mit Helferpool, Posten/Positionen, Qualifikationsmatching und
  JSON-/PDF-Export. Das PEP-Format bleibt eine Datei mit `version`, `meta` und `planung`.
- Serverzugriff auf Excel-Dateifreigabe und einen gesonderten Nextcloud-Ordner für
  `<UUID>.pep.json`. Dateiversionen und Schreibbedingungen verhindern unbemerkte
  Überschreibungen; ein Konflikt bewahrt den lokalen Stand.
- EFS dauerhaft über die drei bekannten Worker-Aktionen. API-Key-Eingabe und früherer
  optionaler App-Modus entfallen. Das vorhandene Mapping wird auch auf `bes_ausbild`
  angewendet, damit die dort enthaltene Notarztqualifikation erkannt wird.
- Access-JWT-Prüfung vor allen Worker-APIs und statischen Dateien. Fehlende oder ungültige
  Authentifizierung wird abgewiesen. API-Zugangsdaten werden ausschließlich serverseitig
  aufgelöst; es gibt keinen produktiven Entwicklungs-Bypass.
- Shell mit verifizierter E-Mail-Adresse, Sitzungsfehlern und Access-Abmeldung; Schutz
  vor dem Verlust ungesicherter Änderungen beim Verlassen ist integriert.
- Dokumentation für Architektur, Konventionen, Webeinrichtung und Abnahme ist vorbereitet.
  Gemeinsame Dialoge, Design-Tokens und die responsive Vorbereitung sind integriert.

Die Quellhistorien wurden bewusst nicht importiert. Verwendete Stände:

| Quelle                                                                             | Commit                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------ |
| [ausbildungs-planer](https://github.com/SimonSchulte/ausbildungs-planer)           | `9a1110c4fd7d9ada8575b198d24fe6d90f3a1e85` |
| [personal-einsatz-planer](https://github.com/SimonSchulte/personal-einsatz-planer) | `b6eb36d09ca1994d284cc1084ce8e1be0c5fc67e` |

Die 27 echten Fahrzeugstammdatensätze aus der Quelle wurden nicht übernommen. Freie
Fahrzeugeingabe und Funkrufübernahme aus dem jeweiligen EFS-Einsatz bleiben möglich.

## Arbeitspakete und GitHub-Übergabe

Die sechs Pakete liegen in getrennten AP-Branches und Commits vor.
[PR-Titel, Beschreibungen und Merge-Reihenfolge](pull-requests.md) dokumentieren die
Übergabe aus dem Fork an das Zielrepository.

| Paket                          | AP-Branch                | Lokaler Prüfstand                                                 |
| ------------------------------ | ------------------------ | ----------------------------------------------------------------- |
| AP1 – Gerüst und Übernahme     | `ap1-geruest-uebernahme` | Commit `bcb7011`, lokal geprüft                                   |
| AP2 – Worker und Static Assets | `ap2-worker-assets`      | Commit `e1165d6`, lokal geprüft; realer SPA-Test blockiert        |
| AP3 – Nextcloud                | `ap3-nextcloud`          | Commit `bf70271`, lokal geprüft                                   |
| AP4 – EFS                      | `ap4-efs-worker`         | Commit `3de752e`, lokal geprüft                                   |
| AP5 – Google-Login             | `ap5-google-login`       | Commit `7bc2da8`, lokal geprüft; echter Google-Login bleibt offen |
| AP6 – Konsistenz               | `ap6-konsistenz`         | Geprüfter Stand dieses Branches, lokal committed                  |

Die Tabellenwerte bezeichnen die lokalen Prüfcommits. Beim Upload über die GitHub-API
werden neue Remote-Commits erzeugt; ihre Kennungen können deshalb abweichen. Der jeweilige
Inhaltsbaum muss dem geprüften lokalen AP-Stand entsprechen.

Die verbundene GitHub-Identität `stexeflex` kann den Fork `stexeflex/stationwizard`
beschreiben. Die API-Aktion zum Erstellen eines PRs in `SimonSchulte/stationwizard` wurde
jedoch mit HTTP 403 (`Resource not accessible by integration`) abgewiesen. Dieser
Integrationsfehler verhindert die automatische PR-Erstellung, nicht den Upload in den Fork.
Die sechs PRs müssen deshalb mit dem persönlichen GitHub-Login über die
[Vergleichslinks](pull-requests.md) erstellt werden; Schreibrechte am Original sind dafür
nicht erforderlich.

Der Repository-Eigentümer prüft und übernimmt die Arbeitspakete in Reihenfolge AP1 bis AP6;
die Folgepakete hängen jeweils vom Vorgänger ab. Die PRs ersetzen weder die fachliche
Abnahme noch die produktive Einrichtung.

Du musst die Branches nicht selbst mit Git übertragen. Die Altrepositorys wurden nicht
archiviert und der bisherige Worker wurde nicht stillgelegt.

## Was tatsächlich geprüft wurde

Diese Ergebnisse stammen aus den tatsächlich ausgeführten lokalen Prüfläufen.

| Prüfstand | Ergebnis                                                                                   |
| --------- | ------------------------------------------------------------------------------------------ |
| AP1       | Produktionsbuild erfolgreich, 60 Angular-Tests bestanden; 58 vorhandene Fachtests erhalten |
| AP2       | 64 Angular- und 51 Worker-Tests, TypeScript sowie Wrangler-Trockenlauf erfolgreich         |
| AP3       | 84 Angular- und 122 Worker-Tests, Gesamtbuild/TypeScript und Prettier erfolgreich          |
| AP4       | 116 Angular- und 209 Worker-Tests, Gesamtbuild/TypeScript und Prettier erfolgreich         |
| AP5       | 120 Angular- und 209 Worker-Tests, Gesamtbuild/TypeScript und Prettier erfolgreich         |
| AP6       | 150 Angular- und 216 Worker-Tests, Gesamtbuild/TypeScript und Prettier erfolgreich         |

Geprüft wurden unter anderem Qualifikationsmatching, Excel-Rundlauf, Planoperationen,
Wochenraster, Datum/Feiertage sowie Worker-Authentifizierung, feste API-Verträge und
Dateikonflikte. Angular-Integrationstests instanziieren Jahresplan, Einsatzliste und Editor.
Zusätzlich wurden echte PDF-Bytes mit eingebetteten Schriften, Sommerzeitwechsel und
Speicher-/Ladekonflikte während laufender Bearbeitung geprüft. Der Editor-Lazy-Chunk
sank durch verzögertes Laden der PDF-Bibliothek von etwa 2,17 MB auf 291,28 kB.
Testdaten sind erfunden; das sind keine erfolgreichen Aufrufe der produktiven HiOrg- oder
Nextcloud-Systeme.

Der Build enthält weiterhin Warnungen: Editor-Styles 18,15 kB über dem 12-kB-Warnlimit
(unter der unveränderten 24-kB-Fehlergrenze) sowie CommonJS-Abhängigkeiten bei pdfmake,
Fonts und base64-js.

Folgende Grenzen bleiben ausdrücklich offen:

- **Desktop und Mobil:** Die Cloud-Browser-Vorschau wurde mit `ERR_BLOCKED_BY_CLIENT`
  blockiert. Eine erfolgreiche echte Sicht- und Bedienprüfung liegt nicht vor.
- **SPA-Fallback in workerd:** Der Laufzeitstart von `npm run test:spa` wurde mit
  `network approval was cancelled before a decision was returned` abgebrochen. Der
  konfigurierte Fallback ist deshalb noch nicht durch einen erfolgreichen realen Lauf
  nachgewiesen.
- **Deployment-Trockenlauf:** AP2 war erfolgreich. Der zusätzliche Versuch in AP3 wurde
  von der Ausführungsumgebung abgebrochen und zählt nicht als bestandene Prüfung.
- **Produktion:** Kein DNS-Umzug, keine Cloudflare-Git-Integration, kein Deployment,
  kein Google-Login mit echten Konten und keine echten Nextcloud-/EFS-Lese- oder
  Schreibvorgänge wurden als erfolgreich verifiziert.

Hash-Routing bleibt daher bewusst aktiv: `/#/ausbildung`, `/#/einsatz` und
`/#/einsatz/editor`. Erst ein erfolgreicher workerd-/SPA-Test zusammen mit einer echten
Browserprüfung rechtfertigt die Umstellung auf saubere Pfade.

## Fachliche und mobile Abweichungen

Die Quellimplementierung enthält medizinisch die neun Werte
`EH, SSD, SanH, RH, RS, RA, NotSan, A, NA`. Die beschriebene Zwölferliste einschließlich
`SAN`, `FR` und `RDH` ist dort nicht umgesetzt. Die vorhandene Reihenfolge bleibt erhalten,
weil sie den Qualifikationsabgleich steuert. Ergänzung und Rangfolge müssen fachlich
bestätigt werden; diese Entscheidung wurde nicht durch eine Vermutung ersetzt.

Der ursprüngliche PEP-Editor hat Helferpool und Postenbereich, aber keinen separaten dritten
Inspektor. Dieser vorhandene Funktionsumfang wurde übernommen.

Die Ausbildungsplanung behält ihre mobile Plan-/Listenumschaltung, untere Navigation bis
780 Pixel und das horizontal scrollbar bleibende Wochenraster. Beim PEP sind responsive
Vorbereitungen vorhanden; für umfangreiche Zuordnungen gilt vorerst die Desktopempfehlung.
Diese Codebefunde sind keine visuelle Mobilabnahme.

## Was du noch entscheiden oder bereitstellen musst

| Entscheidung / Zugang | Benötigter Inhalt                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub                | Sechs PRs über die Vergleichslinks im Browser erstellen, in Reihenfolge prüfen und durch den Repository-Eigentümer übernehmen lassen |
| Hostname              | Bestätigung von `stationwizard.altrophie.de` oder Angabe eines anderen Namens                                                        |
| DNS                   | Zustimmung zum Nameserverwechsel und vollständiger bestehender DNS-Bestand                                                           |
| Mail                  | Ob E-Mail unter `altrophie.de` läuft; bestehende MX-/SPF-/DKIM-/DMARC-Werte und Testpostfach                                         |
| Google-Zugriff        | Exakte zulässige Google-Konto-Adressen; keine allgemeine Freigabe für alle Google-Konten                                             |
| Cloudflare            | Das richtige Konto, Zero-Trust-Teamdomain und Audience der Access-Anwendung                                                          |
| Nextcloud             | Excel-Dateifreigabe sowie gesonderter beschreibbarer PEP-Ordner, gegebenenfalls Passwörter                                           |
| HiOrg                 | Gültiger bestehender EFS-Zugang und vollständige Endpunkt-URL                                                                        |
| Fachliche Rangfolge   | Ob und wie die drei zusätzlichen medizinischen Qualifikationen eingeführt werden sollen                                              |

Zugangsdaten direkt in den Verwaltungsoberflächen setzen; keine Secret-Werte als Antwort
auf diesen Bericht versenden.

## Reihenfolge bis zur Produktivabnahme

Die [vollständige Anleitung](einrichtung.md) enthält die Klickfolgen und eine konkrete
Prüfmöglichkeit pro Schritt. Der vorgesehene Produktionsablauf lautet:

1. DNS-Bestand bei netcup vollständig sichern; Cloudflare-Zone vorbereiten; insbesondere
   MX, SPF, alle DKIM-Selectoren und DMARC abgleichen. Erst dann Nameserver wechseln und
   anschließend bestehende Dienste sowie Mailversand und -empfang prüfen.
2. Die AP-PRs aus `stexeflex/stationwizard` über die vorbereiteten Vergleichslinks im
   Browser erstellen, prüfen und in Reihenfolge AP1 bis AP6 im Zielrepository übernehmen.
   Schreibrechte am Original sind nur für die Übernahme nötig.
3. Nextcloud-Freigaben und die fünf verpflichtenden Store-Einträge bereitstellen:
   `NEXTCLOUD_BASE_URL`, `NEXTCLOUD_SHARE_TOKEN`, `NEXTCLOUD_PEP_SHARE_TOKEN`,
   `HIORGSERVER_BASE_URL`, `HIORGSERVER_EFS_API_TOKEN`. Optionale Freigabepasswörter als
   klassische Worker-Laufzeit-Secrets setzen.
4. Zero Trust und Google-Identitätsanbieter einrichten. Die Callback-Adresse lautet exakt
   `https://<teamname>.cloudflareaccess.com/cdn-cgi/access/callback`; den echten Teamnamen
   einsetzen. Google-OAuth-Daten bleiben beim Cloudflare-Identitätsanbieter.
5. Workers Builds mit Node 24 und ausdrücklicher npm-11-Installation verbinden. **All
   traffic** schützen, die konkrete Zugriffsliste und Google als erforderliche
   Anmeldemethode setzen. Teamdomain/Audience und Laufzeit-Bindings kontrollieren.
6. Die bestätigte Custom Domain verbinden. Anmeldung mit erlaubtem und nicht erlaubtem
   Konto, direkte Worker-/Preview-Adressen sowie beide Fachbereiche prüfen.
7. Excel und PEP mit erfundenen Testdaten über den Worker laden und speichern; gespeicherte
   Dateien erneut laden. EFS-Liste und Detailimport, Exporte und Desktop-/Mobilbedienung
   abnehmen. Erst danach auf produktive Freigaben umstellen.
8. Abschließend alte Pages-Bereitstellungen abschalten oder bewusst weiterleiten,
   Ursprungsrepositorys archivieren und den alten Worker stilllegen.

Nach der aktuell geprüften Cloudflare-Dokumentation kann **All traffic** auch `workers.dev`
und Vorschauen schützen. Ein Google-Vorabtest ist deshalb bereits ohne den DNS-Umzug
möglich; die eigene Produktionsdomain braucht weiterhin die aktive Cloudflare-Zone.
Der alternative eigene Google-OIDC-Flow wurde nicht umgesetzt.
[Cloudflare: Access für den gesamten Worker](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
