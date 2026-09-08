# Pull Requests

Die sechs AP-Branches liegen im Fork
[stexeflex/stationwizard](https://github.com/stexeflex/stationwizard). Die automatische
PR-Erstellung im Original `SimonSchulte/stationwizard` wurde mit HTTP 403
(`Resource not accessible by integration`) abgewiesen. **Es wurden noch keine PRs erstellt.**

Mit dem persönlichen GitHub-Login `stexeflex` den jeweiligen Vergleichslink öffnen und
**Create pull request** wählen. Die Links übergeben Titel und Beschreibung; die vollständigen
Texte stehen zusätzlich im zugehörigen Abschnitt unten. AP1 mit **Create pull request** absenden; bei AP2 bis AP6 über den
Pfeil am Absenden-Button **Create draft pull request** wählen. Schreibrechte am Original
sind für diese Fork-PRs nicht erforderlich. Erst eine URL mit `/pull/<Nummer>` bestätigt
die Erstellung.

| Reihenfolge | Vergleich öffnen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Beim Erstellen wählen |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| AP1         | [Gerüst und Übernahme](https://github.com/SimonSchulte/stationwizard/compare/main...stexeflex:ap1-geruest-uebernahme?expand=1&quick_pull=1&title=AP1%3A%20Ausbildungs-%20und%20Einsatzplanung%20in%20Angular%2021%20zusammenf%C3%BChren&body=Branch%3A%20%60ap1-geruest-uebernahme%60%3B%20Basis%3A%20%60main%60.%0A%0ADie%20bisher%20getrennten%20Planer%20ben%C3%B6tigen%20eine%20gemeinsame%20Anwendung.%20Dieser%20PR%20%C3%BCbernimmt%0Abeide%20Fachbereiche%20ohne%20Quellhistorie%2C%20erg%C3%A4nzt%20Shell%20und%20Lazy-Routen%20und%20vereinheitlicht%0AAngular%2C%20Material%2C%20LESS%2C%20Formatierung%20und%20Vitest.%20Gemeinsame%20Kalender-%20und%20Dateivertr%C3%A4ge%0Aliegen%20im%20Kern%3B%20Excel%20und%20PEP%20behalten%20ihre%20bestehenden%20Formate.%20Echte%20Fahrzeugstammdaten%0Awerden%20nicht%20%C3%BCbernommen.%0A%0AGepr%C3%BCft%3A%2060%20Angular-Tests%2C%20Produktionsbuild%20und%20Prettier.%20Die%20vorhandenen%2058%20Fachtests%0Ableiben%20erhalten.%20Browserpr%C3%BCfung%20durch%20die%20Umgebung%20blockiert%3B%20medizinische%20Rangfolge%0Aaus%20dem%20Quellcode%20bewahrt%2C%20Abweichung%20von%20der%20Auftragsliste%20dokumentiert.%0A%0ADie%20Pakete%20sind%20in%20der%20Reihenfolge%20AP1%20bis%20AP6%20zu%20%C3%BCbernehmen%3B%20Folgepakete%20zun%C3%A4chst%20als%20Entwurf.%20Vor%20Ver%C3%B6ffentlichung%20sind%20Browser-%2C%20Access-%20und%20Live-Datenabnahme%20erforderlich.)                                                                                                                                                                                                       | Pull Request          |
| AP2         | [Worker und Static Assets](https://github.com/SimonSchulte/stationwizard/compare/main...stexeflex:ap2-worker-assets?expand=1&quick_pull=1&title=AP2%3A%20Worker%20mit%20gesch%C3%BCtzten%20Static%20Assets%20aufsetzen&body=Branch%3A%20%60ap2-worker-assets%60%3B%20Basis%3A%20%60main%60%3B%20ben%C3%B6tigt%20zuerst%20%60ap1-geruest-uebernahme%60.%0A%0AEine%20gemeinsame%20Origin%20ben%C3%B6tigt%20ein%20gemeinsames%20Hosting.%20Der%20Worker%20liefert%20die%0AAngular-Assets%20und%20feste%20Status-%2FBenutzer-APIs%20aus.%20Die%20Access-JWT-Verifikation%20liegt%0Abereits%20vor%20allen%20Inhalten%2C%20sodass%20auch%20direkte%20Worker-Aufrufe%20keine%20Assets%20umgehen.%0AWrangler%20und%20Workers%20Builds%20sind%20vorbereitet%3B%20der%20gemeinsame%20WorkerClient%20behandelt%0ASitzungs-%20und%20Verbindungsfehler.%0A%0AGepr%C3%BCft%3A%2064%20Angular-%20und%2051%20Worker-Tests%2C%20Build%2C%20Prettier%20und%20Wrangler-Trockenlauf.%0ADer%20echte%20workerd-%2FSPA-Test%20ist%20durch%20die%20Umgebung%20blockiert.%20Deshalb%20bleibt%0AHash-Routing%20erhalten%3B%20die%20Infrastruktur%20ist%20noch%20nicht%20im%20Cloudflare-Konto%20eingerichtet.%0A%0ADie%20Pakete%20sind%20in%20der%20Reihenfolge%20AP1%20bis%20AP6%20zu%20%C3%BCbernehmen%3B%20Folgepakete%20zun%C3%A4chst%20als%20Entwurf.%20Vor%20Ver%C3%B6ffentlichung%20sind%20Browser-%2C%20Access-%20und%20Live-Datenabnahme%20erforderlich.)                                                                                                                                                                                                      | Entwurf               |
| AP3         | [Nextcloud](https://github.com/SimonSchulte/stationwizard/compare/main...stexeflex:ap3-nextcloud?expand=1&quick_pull=1&title=AP3%3A%20Excel%20und%20Einsatzplandateien%20%C3%BCber%20Nextcloud%20speichern&body=Branch%3A%20%60ap3-nextcloud%60%3B%20Basis%3A%20%60main%60%3B%20ben%C3%B6tigt%20zuerst%20%60ap2-worker-assets%60.%0A%0AZugangsdaten%20und%20direkte%20WebDAV-Zugriffe%20geh%C3%B6ren%20hinter%20den%20Worker.%20Dieser%20PR%20f%C3%BChrt%0Adie%20bestehende%20Excel-Dateifreigabe%20unter%20dem%20gemeinsamen%20API-Pfad%20weiter%20und%20erg%C3%A4nzt%0Aeinen%20separaten%20Ordner%20f%C3%BCr%20unver%C3%A4nderte%20einzelne%20PEP-Dateien.%20Die%20Oberfl%C3%A4che%20bietet%0Abewusstes%20Laden%20und%20Speichern%3B%20ETags%20sch%C3%BCtzen%20gegen%20unbemerkte%20%C3%9Cberschreibungen.%0AFreigabe-%20und%20Zugriffsschl%C3%BCssel%20werden%20im%20Browser%20nicht%20mehr%20eingegeben.%0A%0AGepr%C3%BCft%3A%2084%20Angular-%20und%20122%20Worker-Tests%2C%20Build%20und%20Prettier.%20Echte%20Nextcloud-Verbindung%0Anoch%20ungepr%C3%BCft.%20Der%20neue%20PEP-Ordner%20ben%C3%B6tigt%20ein%20zus%C3%A4tzliches%20serverseitiges%20Freigabe-Secret.%0A%0ADie%20Pakete%20sind%20in%20der%20Reihenfolge%20AP1%20bis%20AP6%20zu%20%C3%BCbernehmen%3B%20Folgepakete%20zun%C3%A4chst%20als%20Entwurf.%20Vor%20Ver%C3%B6ffentlichung%20sind%20Browser-%2C%20Access-%20und%20Live-Datenabnahme%20erforderlich.)                                                                                                                                                                                                                | Entwurf               |
| AP4         | [EFS-Anbindung](https://github.com/SimonSchulte/stationwizard/compare/main...stexeflex:ap4-efs-worker?expand=1&quick_pull=1&title=AP4%3A%20EFS-Anbindung%20dauerhaft%20%C3%BCber%20den%20Worker%20f%C3%BChren&body=Branch%3A%20%60ap4-efs-worker%60%3B%20Basis%3A%20%60main%60%3B%20ben%C3%B6tigt%20zuerst%20%60ap3-nextcloud%60.%0A%0ADer%20bisherige%20EFS-Schl%C3%BCssel%20im%20Browser%20wird%20durch%20serverseitige%20Secrets%20ersetzt.%0ADer%20Proxy%20erlaubt%20ausschlie%C3%9Flich%20die%20drei%20bekannten%20Aktionen%20und%20bewahrt%20das%20vorhandene%0AQualifikationsmapping.%20Die%20Oberfl%C3%A4che%20zeigt%20Verbindungszustand%20und%20Wiederholen%3B%0Aoptionaler%20App-Modus%20und%20API-Key-Dialog%20entfallen.%20Asynchrone%20Ergebnisse%20d%C3%BCrfen%20nicht%0Ainzwischen%20gewechselte%20Planungen%20ver%C3%A4ndern.%20Live-Fahrzeugfunkrufe%20ersetzen%20die%20entfernten%0Aechten%20Stammdaten%2C%20soweit%20sie%20im%20EFS-Einsatz%20vorhanden%20sind.%0A%0AGepr%C3%BCft%3A%20116%20Angular-%20und%20209%20Worker-Tests%2C%20Build%20und%20Prettier.%20Darunter%20drei%0AIntegrationstests%20f%C3%BCr%20die%20tats%C3%A4chlichen%20Fachansichten.%20Live-HiOrg%20bleibt%20ungepr%C3%BCft.%0A%0ADie%20Pakete%20sind%20in%20der%20Reihenfolge%20AP1%20bis%20AP6%20zu%20%C3%BCbernehmen%3B%20Folgepakete%20zun%C3%A4chst%20als%20Entwurf.%20Vor%20Ver%C3%B6ffentlichung%20sind%20Browser-%2C%20Access-%20und%20Live-Datenabnahme%20erforderlich.)                                                                                                                                                                   | Entwurf               |
| AP5         | [Google-Login und Sitzung](https://github.com/SimonSchulte/stationwizard/compare/main...stexeflex:ap5-google-login?expand=1&quick_pull=1&title=AP5%3A%20Gepr%C3%BCfte%20Benutzeridentit%C3%A4t%20und%20Access-Abmeldung%20anzeigen&body=Branch%3A%20%60ap5-google-login%60%3B%20Basis%3A%20%60main%60%3B%20ben%C3%B6tigt%20zuerst%20%60ap4-efs-worker%60.%0A%0ADie%20gemeinsame%20Shell%20zeigt%20die%20vom%20Worker%20best%C3%A4tigte%20E-Mail-Adresse%2C%20den%20laufenden%0ADatentransfer%20und%20abgelaufene%20Sitzungen.%20Anmeldung%20und%20Abmeldung%20verwenden%20Cloudflare%0AAccess.%20Es%20werden%20keine%20eigenen%20Google-Sitzungen%20oder%20Tokens%20im%20Browser%20verwaltet.%0A%0AGepr%C3%BCft%3A%20120%20Angular-%20und%20209%20Worker-Tests%2C%20Build%20und%20Prettier.%20Die%20konkrete%20Google-%0AZugriffsliste%20sowie%20Cloudflare-Team%20und%20Audience%20m%C3%BCssen%20extern%20eingerichtet%20werden%3B%0Aohne%20g%C3%BCltige%20Konfiguration%20bleibt%20der%20Worker%20geschlossen.%0A%0ADie%20Pakete%20sind%20in%20der%20Reihenfolge%20AP1%20bis%20AP6%20zu%20%C3%BCbernehmen%3B%20Folgepakete%20zun%C3%A4chst%20als%20Entwurf.%20Vor%20Ver%C3%B6ffentlichung%20sind%20Browser-%2C%20Access-%20und%20Live-Datenabnahme%20erforderlich.)                                                                                                                                                                                                                                                                                                                                                                         | Entwurf               |
| AP6         | [Konsistenz und Übergabe](https://github.com/SimonSchulte/stationwizard/compare/main...stexeflex:ap6-konsistenz?expand=1&quick_pull=1&title=AP6%3A%20Dialoge%2C%20Darstellung%2C%20Datensicherung%20und%20%C3%9Cbergabe%20vereinheitlichen&body=Branch%3A%20%60ap6-konsistenz%60%3B%20Basis%3A%20%60main%60%3B%20ben%C3%B6tigt%20zuerst%20%60ap5-google-login%60.%0A%0AGemeinsame%20Dialoge%20und%20Design-Tokens%20verbinden%20die%20Fachbereiche.%20Schmale%20Ansichten%0Aerhalten%20umbrechende%20Bedienelemente%20und%20scrollbare%20Arbeitsfl%C3%A4chen.%20Der%20%C3%BCbernommene%0AEinsatzeditor%20bleibt%20mit%20Helferpool%20und%20Postenbereich%20auf%20Desktop%20ausgerichtet.%0APDF-Bibliothek%20und%20Schriften%20laden%20erst%20beim%20Export%3B%20die%20Fontregistrierung%20ist%20f%C3%BCr%0Adie%20eingesetzte%20Version%20korrigiert.%20Gemeinsame%20Kalenderhilfen%2C%20Speicherzust%C3%A4nde%20und%0AVerlassensschutz%20werden%20erg%C3%A4nzt.%20Der%20Proxyreview%20schlie%C3%9Ft%20URL-%20und%20Upload-Zeitlimitfehler.%0A%0ADie%20README%2C%20CLAUDE.md%20und%20Webanleitung%20beschreiben%20Architektur%2C%20Einrichtung%2C%20Grenzen%0Aund%20Abnahme.%20Endg%C3%BCltige%20Pr%C3%BCfzahlen%20stehen%20im%20%5BArbeitsstand%5D%28arbeitsstand.md%29.%0AVisuelle%20Desktop-%2FMobilabnahme%20und%20Produktionsverbindungen%20bleiben%20vor%20Freigabe%20erforderlich.%0A%0ADie%20Pakete%20sind%20in%20der%20Reihenfolge%20AP1%20bis%20AP6%20zu%20%C3%BCbernehmen%3B%20Folgepakete%20zun%C3%A4chst%20als%20Entwurf.%20Vor%20Ver%C3%B6ffentlichung%20sind%20Browser-%2C%20Access-%20und%20Live-Datenabnahme%20erforderlich.) | Entwurf               |

Alle PRs zielen auf `main`, da die AP-Branches nur im Fork liegen. AP1 zuerst prüfen;
AP2 bis AP6 bis zur Übernahme ihres jeweiligen Vorgängers als Entwürfe belassen. Solange ein
Vorgänger noch nicht übernommen wurde, enthält der Folge-PR auch dessen Änderungen.
AP1 bis AP5 mit **Create a merge commit** übernehmen, damit nach jedem Merge nur die
zusätzlichen Änderungen des nächsten APs angezeigt werden. Bei Squash- oder Rebase-Merges
müssen die Folgebranches vor ihrer Prüfung angepasst werden. Vor jedem Merge müssen die
GitHub-Prüfungen und die jeweils mögliche Abnahme bestehen.

## AP1: Ausbildungs- und Einsatzplanung in Angular 21 zusammenführen

Branch: `ap1-geruest-uebernahme`; Basis: `main`.

Die bisher getrennten Planer benötigen eine gemeinsame Anwendung. Dieser PR übernimmt
beide Fachbereiche ohne Quellhistorie, ergänzt Shell und Lazy-Routen und vereinheitlicht
Angular, Material, LESS, Formatierung und Vitest. Gemeinsame Kalender- und Dateiverträge
liegen im Kern; Excel und PEP behalten ihre bestehenden Formate. Echte Fahrzeugstammdaten
werden nicht übernommen.

Geprüft: 60 Angular-Tests, Produktionsbuild und Prettier. Die vorhandenen 58 Fachtests
bleiben erhalten. Browserprüfung durch die Umgebung blockiert; medizinische Rangfolge
aus dem Quellcode bewahrt, Abweichung von der Auftragsliste dokumentiert.

## AP2: Worker mit geschützten Static Assets aufsetzen

Branch: `ap2-worker-assets`; Basis: `main`; benötigt zuerst `ap1-geruest-uebernahme`.

Eine gemeinsame Origin benötigt ein gemeinsames Hosting. Der Worker liefert die
Angular-Assets und feste Status-/Benutzer-APIs aus. Die Access-JWT-Verifikation liegt
bereits vor allen Inhalten, sodass auch direkte Worker-Aufrufe keine Assets umgehen.
Wrangler und Workers Builds sind vorbereitet; der gemeinsame WorkerClient behandelt
Sitzungs- und Verbindungsfehler.

Geprüft: 64 Angular- und 51 Worker-Tests, Build, Prettier und Wrangler-Trockenlauf.
Der echte workerd-/SPA-Test ist durch die Umgebung blockiert. Deshalb bleibt
Hash-Routing erhalten; die Infrastruktur ist noch nicht im Cloudflare-Konto eingerichtet.

## AP3: Excel und Einsatzplandateien über Nextcloud speichern

Branch: `ap3-nextcloud`; Basis: `main`; benötigt zuerst `ap2-worker-assets`.

Zugangsdaten und direkte WebDAV-Zugriffe gehören hinter den Worker. Dieser PR führt
die bestehende Excel-Dateifreigabe unter dem gemeinsamen API-Pfad weiter und ergänzt
einen separaten Ordner für unveränderte einzelne PEP-Dateien. Die Oberfläche bietet
bewusstes Laden und Speichern; ETags schützen gegen unbemerkte Überschreibungen.
Freigabe- und Zugriffsschlüssel werden im Browser nicht mehr eingegeben.

Geprüft: 84 Angular- und 122 Worker-Tests, Build und Prettier. Echte Nextcloud-Verbindung
noch ungeprüft. Der neue PEP-Ordner benötigt ein zusätzliches serverseitiges Freigabe-Secret.

## AP4: EFS-Anbindung dauerhaft über den Worker führen

Branch: `ap4-efs-worker`; Basis: `main`; benötigt zuerst `ap3-nextcloud`.

Der bisherige EFS-Schlüssel im Browser wird durch serverseitige Secrets ersetzt.
Der Proxy erlaubt ausschließlich die drei bekannten Aktionen und bewahrt das vorhandene
Qualifikationsmapping. Die Oberfläche zeigt Verbindungszustand und Wiederholen;
optionaler App-Modus und API-Key-Dialog entfallen. Asynchrone Ergebnisse dürfen nicht
inzwischen gewechselte Planungen verändern. Live-Fahrzeugfunkrufe ersetzen die entfernten
echten Stammdaten, soweit sie im EFS-Einsatz vorhanden sind.

Geprüft: 116 Angular- und 209 Worker-Tests, Build und Prettier. Darunter drei
Integrationstests für die tatsächlichen Fachansichten. Live-HiOrg bleibt ungeprüft.

## AP5: Geprüfte Benutzeridentität und Access-Abmeldung anzeigen

Branch: `ap5-google-login`; Basis: `main`; benötigt zuerst `ap4-efs-worker`.

Die gemeinsame Shell zeigt die vom Worker bestätigte E-Mail-Adresse, den laufenden
Datentransfer und abgelaufene Sitzungen. Anmeldung und Abmeldung verwenden Cloudflare
Access. Es werden keine eigenen Google-Sitzungen oder Tokens im Browser verwaltet.

Geprüft: 120 Angular- und 209 Worker-Tests, Build und Prettier. Die konkrete Google-
Zugriffsliste sowie Cloudflare-Team und Audience müssen extern eingerichtet werden;
ohne gültige Konfiguration bleibt der Worker geschlossen.

## AP6: Dialoge, Darstellung, Datensicherung und Übergabe vereinheitlichen

Branch: `ap6-konsistenz`; Basis: `main`; benötigt zuerst `ap5-google-login`.

Gemeinsame Dialoge und Design-Tokens verbinden die Fachbereiche. Schmale Ansichten
erhalten umbrechende Bedienelemente und scrollbare Arbeitsflächen. Der übernommene
Einsatzeditor bleibt mit Helferpool und Postenbereich auf Desktop ausgerichtet.
PDF-Bibliothek und Schriften laden erst beim Export; die Fontregistrierung ist für
die eingesetzte Version korrigiert. Gemeinsame Kalenderhilfen, Speicherzustände und
Verlassensschutz werden ergänzt. Der Proxyreview schließt URL- und Upload-Zeitlimitfehler.

Die README, CLAUDE.md und Webanleitung beschreiben Architektur, Einrichtung, Grenzen
und Abnahme. Endgültige Prüfzahlen stehen im [Arbeitsstand](arbeitsstand.md).
Visuelle Desktop-/Mobilabnahme und Produktionsverbindungen bleiben vor Freigabe erforderlich.
