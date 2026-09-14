# Konzept: Mobile App (Android zuerst, iOS später)

Dieses Dokument beschreibt eine mobile App auf Basis der bestehenden Angular-Anwendung.
Es ist ein Entwurf zur Abstimmung; nichts davon ist implementiert. Zwei Punkte sind
technisch blockierend und als solche gekennzeichnet (Abschnitte 4 und 5); sie sind nicht
stillschweigend als gelöst angenommen.

## 1. Ziel und Abgrenzung

Ziel ist eine installierbare App für Android, die den gedruckten QR-Code am Fahrzeug zum
unmittelbaren Einstieg macht: Scannen mit der System-Kamera öffnet die App direkt in der
Kilometererfassung des betreffenden Fahrzeugs, statt über den Browser. Zusätzlich soll die
native Kamera für künftige fotogestützte Vorgänge verfügbar sein. Die Verteilung erfolgt
intern über Firebase App Distribution, nicht über den öffentlichen Play Store.

Nicht Gegenstand dieses Konzepts:

- **Mängelmeldung mit Foto.** Fachlich reizvoll, aber es gibt weder Datenmodell noch Route
  noch Protokolltyp dafür. Das braucht ein eigenes Konzept (Speicherort für Bilder, Rechte,
  Lebenszyklus einer Meldung). Dieses Dokument schafft nur die technische Voraussetzung.
- **Offline-Betrieb.** Siehe Abschnitt 3: die gewählte Architektur ist bewusst
  online-gebunden.
- **Ein zweites Fachmodell.** Ausbildungs-, Einsatz- und Fahrzeuglogik bleiben unverändert
  in `src/app/`. Die App fügt eine Hülle hinzu, keine Parallelimplementierung.
- **Öffentliche Store-Veröffentlichung.** Bewusst ausgeschlossen (Abschnitt 8).

## 2. Technologiewahl

**Capacitor.** Die bestehende Angular-Anwendung wird in eine native Hülle gepackt; native
Fähigkeiten kommen über eine JS-Brücke. Eine Codebasis, zwei Plattformen.

Verworfene Alternativen:

- **PWA / Trusted Web Activity.** Für Android tragfähig, aber WebKit kennt kein
  TWA-Äquivalent. Sobald iOS dazukommt, wäre ein zweiter Weg nötig. Zudem kein Zugriff auf
  native Kamera-Plugins.
- **Native Neuentwicklung (Kotlin/Swift).** Zwei zusätzliche UI-Implementierungen dauerhaft
  parallel zur Weiterentwicklung von Ausbildung, Einsatz und Fahrzeugen zu pflegen ist für
  dieses Repository nicht realistisch.

## 3. Der bestimmende Zwang: Ursprungsschutz und Anmeldung

Die bestehende Sicherheitsarchitektur legt die App-Architektur fest. Drei Stellen im
Quellstand wirken zusammen:

| Ort                                   | Verhalten                                                                |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `worker/src/index.ts:27`              | `pruefeAnmeldung()` läuft vor **allem**, auch vor jedem statischen Asset |
| `worker/src/index.ts:33-45`           | Schreibzugriffe mit fremder `Origin` werden mit 403 abgewiesen           |
| `src/app/kern/worker-client.ts:37-43` | `fetch` mit relativem `/api/*`-Pfad, `credentials: 'same-origin'`        |

Daraus folgen zwei Varianten, von denen nur eine mit den Vorgaben in `CLAUDE.md` vereinbar
ist.

### Variante A: Entfernte Origin in der WebView (empfohlen)

Die App lädt über `server.url` in `capacitor.config.ts` die echte Anwendungs-URL. Die
WebView läuft damit auf derselben Origin wie im Browser.

- Der Worker-Client bleibt **unverändert**: relative Pfade, `same-origin`, `redirect: 'error'`.
- Der `CF_Authorization`-Cookie liegt im Cookie-Speicher der WebView; Access ergänzt daraus
  wie gewohnt `Cf-Access-Jwt-Assertion`.
- Der Ursprungsschutz für Schreibzugriffe greift unverändert, weil `Origin` die echte Origin ist.
- Native Plugins bleiben über die Capacitor-Brücke nutzbar.

Preis dieser Variante, ehrlich benannt:

- **Kein Offline-Betrieb.** Ohne Netz startet die App nicht. Für den Anwendungsfall
  „QR am Fahrzeug scannen, Stand eintragen" vertretbar, für eine Einsatzlage nicht.
- Die Capacitor-Brücke wird in eine entfernt geladene Seite injiziert. Ein XSS auf dieser
  Seite bekäme damit native Rechte. Die Seite ist Access-geschützt und die Navigation wird
  auf die eigene Origin begrenzt (`server.allowNavigation` restriktiv halten), aber die
  Abwägung gehört festgehalten.

### Variante B: Lokal gebündelte Assets (verworfen)

Der Capacitor-Normalfall — Assets aus `dist/stationwizard/browser` im App-Paket, API-Aufrufe
gegen die entfernte Origin. Das bricht an jeder der drei Stellen oben:

- Origin wäre `capacitor://localhost`; **jeder** Schreibzugriff liefe in den 403 aus
  `index.ts:39`.
- `credentials: 'same-origin'` sendet über Origin-Grenzen keine Cookies; ohne
  `CF_Authorization` gibt es kein Access-Token, also 401 auf jede API.
- Relative `/api/*`-Pfade zeigten ins lokale Bundle statt auf den Worker.

Die Reparatur verlangte CORS am Worker, `credentials: 'include'`, eine Origin-Ausnahmeliste
für die App und damit eine Aufweichung des Ursprungsschutzes. `CLAUDE.md` schließt das
ausdrücklich aus („Nur relative `/api/*`-Pfade derselben Origin", „Ursprungsschutz […]
erhalten"). Variante B wird deshalb nicht weiterverfolgt.

## 4. Blockierender Punkt: Access-Anmeldung in der WebView

**Das ist das Risiko, an dem das Vorhaben scheitern kann, und es ist von hier aus nicht
entscheidbar.**

Cloudflare Access authentifiziert derzeit über Google. Google verweigert OAuth in
eingebetteten WebViews (`disallowed_useragent`). Eine WebView, die den Access-Login selbst
durchlaufen soll, läuft damit voraussichtlich in eine Sackgasse.

Denkbare Auswege, alle mit offenen Fragen:

1. **Zusätzlicher Access-IdP „One-time PIN".** Anmeldung per E-Mail und Einmalcode
   funktioniert in WebViews. Die Zugriffsliste bleibt dieselbe, es entsteht kein `Everyone`
   und kein Bypass — die Richtlinie prüft weiterhin die konkrete E-Mail. Erfordert eine
   bewusste Änderung an der Access-Anwendung und deren Abnahme.
2. **Anmeldung im System-Browser (Custom Tabs) mit anschließender Cookie-Übernahme.** Auf
   Android haben Custom Tabs und App-WebView getrennte Cookie-Speicher; ein verlässlicher
   Übergabeweg ist nicht bekannt. Technisch fragil.
3. **Access Service Token.** Scheidet aus: die Identität einer Ablesung stammt laut
   `CLAUDE.md` und `konzept-fahrzeuge.md` aus der geprüften Anmeldung und wird serverseitig
   in `erfasstVon` geschrieben. Ein geräteweites Maschinentoken zerstört genau diese Zuordnung.

**AP-M0 klärt dies durch einen Versuch an der echten Access-Instanz, bevor weitere Arbeit
beginnt.** Fällt der Versuch negativ aus und ist Option 1 nicht gewollt, ist eine
App im hier beschriebenen Sinn nicht umsetzbar; dann bleibt der Browser der Zugangsweg.

Ergänzend zu klären: Läuft eine Sitzung in der App ab, setzt der Worker-Client den Zustand
`sitzung-abgelaufen` (`worker-client.ts:44-50`). In der App braucht dieser Zustand einen
eigenen Weg zurück in die Anmeldung; die Browserlösung „Seite neu laden und umgeleitet
werden" greift wegen `redirect: 'error'` nicht selbsttätig.

## 5. Blockierender Punkt: `.well-known` liegt hinter Access

Damit ein gescannter QR-Code die App statt des Browsers öffnet, braucht Android App Links
die Datei `/.well-known/assetlinks.json` — **anonym abrufbar**, ohne Weiterleitung, mit
Status 200. Googles Prüfdienst holt sie ohne Sitzung ab.

Der Worker prüft Access aber vor allen Assets (`index.ts:27`, dazu `run_worker_first = true`
in `worker/wrangler.toml`). Die Datei käme damit als 401 zurück und die Verifizierung der
App Links schlüge fehl. Dasselbe gilt später für `/.well-known/apple-app-site-association`
unter iOS.

Vorgeschlagene Lösung, bewusst eng gefasst:

- Eine Ausnahme **vor** `pruefeAnmeldung()` in `worker/src/index.ts`, ausschließlich für die
  exakten Pfade `/.well-known/assetlinks.json` und (später) `/.well-known/apple-app-site-association`.
- Nur `GET`/`HEAD`, fester im Worker hinterlegter Inhalt, keine Auslieferung beliebiger
  Dateien aus `.well-known/`, kein Präfix-Abgleich.
- Offengelegt wird damit der Signaturfingerabdruck der App und der Paketname. Das sind keine
  Nutz-, Personal- oder Zugangsdaten; der Fingerabdruck ist für App Links konstruktionsbedingt
  öffentlich.

Diese Öffnung ist eine Abweichung von „Anmeldung vor allen Assets" und gehört vor der
Umsetzung ausdrücklich abgenommen. Sie ist in den Worker-Tests abzusichern: die beiden Pfade
liefern ohne Token 200, jeder andere Pfad unter `/.well-known/` weiterhin 401.

## 6. QR-Einstieg

Hier ist wenig zu tun — der Quellstand ist bereits richtig vorbereitet:

- `src/app/fahrzeuge/services/fahrzeug-qr.ts` erzeugt Codes auf die festen Kurzpfade
  `/f/<UUID>` und `/f/<UUID>/km`.
- `kurzlinkWeiterleitung()` in `worker/src/fahrzeuge.ts:758` leitet auf die Hash-Route weiter
  und setzt bei der Kilometererfassung `quelle=qr`.

Mit verifizierten App Links öffnet die System-Kamera dieselbe URL in der App. Die
Weiterleitung des Workers wird in der WebView durchlaufen wie im Browser; die Hash-Route
bleibt erhalten. **Bereits gedruckte Aufkleber bleiben unverändert gültig** — genau dafür
wurden die Kurzpfade eingeführt.

Ein In-App-Scanner ist optional und zweitrangig: der Normalfall ist die System-Kamera. Er
wäre erst dann sinnvoll, wenn Nutzer die App zuerst öffnen und dann scannen wollen.

## 7. Kamera

`@capacitor/camera` liefert Aufnahme und Auswahl mit nativer Kompression. Einbindung als
Adapter in `src/app/fahrzeuge/` beziehungsweise unter `src/app/kern/`, mit einer
Rückfallebene auf `<input type="file" capture>` im Browser, sodass die Fachlogik
plattformunabhängig bleibt — dieselbe Trennung wie zwischen `DateiStorage` und seinen
Adaptern.

Solange kein Mängelmeldungskonzept vorliegt, hat die Kamera **keinen fachlichen Aufrufer**.
AP-M4 legt deshalb nur die Zugriffsschicht an und ist ohne das Folgekonzept nicht
nutzenstiftend; es ist vertretbar, ihn bis dahin zurückzustellen.

## 8. Verteilung über Firebase App Distribution

Gewählt gegenüber dem Play-Console-Testkanal: kein Entwicklerkonto nötig, keine
Store-Einträge, Verteilung an eine E-Mail-Liste.

Wesentlich für dieses Projekt:

- **Kein Firebase-SDK in der App.** App Distribution verlangt nur ein hochgeladenes Paket
  mit passender Anwendungs-ID. Die App enthält damit kein Analytics, kein Crashlytics und
  keinen zusätzlichen Datenabfluss. Ohne SDK entfallen die In-App-Benachrichtigungen über
  neue Versionen; Tester erhalten stattdessen eine E-Mail. Das ist der richtige Tausch.
- **Keystore und Dienstkonto gehören nicht ins Repository.** Signaturschlüssel, dessen
  Passwörter und die JSON-Zugangsdaten des Firebase-Dienstkontos bleiben Geheimnisse der
  Ablaufumgebung — entsprechend „Secret-Werte niemals" in `CLAUDE.md`. Anwendungs-ID und
  Paketname dürfen ins Repository.
- **Tester-E-Mail-Adressen liegen bei Google.** Das ist eine bewusste Entscheidung und in
  `docs/einrichtung.md` festzuhalten. Release-Notes dürfen keine realen Personal-,
  Fahrzeug- oder Planungsdaten enthalten.
- Der Upload erfolgt über die Firebase-CLI (`firebase appdistribution:distribute`) aus
  `.github/workflows/`, aufbauend auf dem vorhandenen `pruefen.yml`, und erst nach
  erfolgreichem Build, Test und Formatprüfung.

## 9. Auswirkungen auf Repository und Werkzeuge

- `android/` wird eingecheckt. Dort liegen App-Links-Konfiguration, Berechtigungen und
  Signaturkonfiguration; die gehören versioniert. Neuerzeugung in der Ablaufumgebung würde
  sie verlieren.
- `.prettierignore` um `android/` (später `ios/`) erweitern; Gradle- und Java-Dateien werden
  nicht von Prettier formatiert. `capacitor.config.ts` bleibt formatiert.
- Neue npm-Skripte, ergänzend zu den bestehenden: `app:sync` (Build plus `cap sync`),
  `app:android` (Öffnen in Android Studio). Die bestehenden Prüfbefehle bleiben unverändert.
- Node 24 und npm ≥ 11 gelten weiter; Android-Builds brauchen zusätzlich ein JDK und das
  Android SDK, was bislang keine Voraussetzung des Repositorys war.

## 10. Arbeitspakete

| AP    | Inhalt                                                                              | Abhängigkeit |
| ----- | ----------------------------------------------------------------------------------- | ------------ |
| AP-M0 | Versuch: Access-Anmeldung in einer WebView; Entscheidung über IdP-Weg (Abschnitt 4) | —            |
| AP-M1 | `.well-known`-Ausnahme im Worker samt Tests (Abschnitt 5)                           | —            |
| AP-M2 | Capacitor-Grundgerüst, `capacitor.config.ts` mit `server.url`, Android-Projekt      | AP-M0        |
| AP-M3 | App Links verifizieren, QR-Einstieg auf Gerät prüfen (Abschnitt 6)                  | AP-M1, AP-M2 |
| AP-M4 | Kamera-Zugriffsschicht mit Browser-Rückfallebene (Abschnitt 7)                      | AP-M2        |
| AP-M5 | Firebase App Distribution, Signierung, CI-Erweiterung (Abschnitt 8)                 | AP-M2        |
| AP-M6 | iOS: `apple-app-site-association`, Universal Links, TestFlight                      | AP-M3, AP-M5 |

AP-M0 und AP-M1 sind unabhängig voneinander und können parallel laufen. AP-M0 entscheidet,
ob AP-M2 überhaupt beginnt.

## 11. Prüfungen

Für jedes AP gelten unverändert `npm run build`, `npm test` und `npm run format:check`.
Bei AP-M1 zusätzlich `npm run worker:check`, `npm run worker:test` und `npm run deploy:dry-run`,
weil Routing und Zugangsschutz betroffen sind.

Nicht durch automatisierte Prüfungen abgedeckt und deshalb ausdrücklich als Gerätetest
auszuweisen: die Anmeldung in der WebView (AP-M0), die Verifizierung der App Links und der
Sprung vom gescannten Code in die Kilometererfassung (AP-M3). `npm run test:spa` bricht in
der bisherigen Umgebung beim Laufzeitstart ab (`network approval was cancelled before a
decision was returned`); dieser Zustand bleibt bestehen und wird durch dieses Konzept nicht
verbessert. Ein blockierter Lauf gilt weiterhin nicht als bestandene Prüfung.

## 12. Offene Entscheidungen

1. Welcher Anmeldeweg für die WebView (Abschnitt 4)? Ohne Antwort kein AP-M2.
2. Wird die `.well-known`-Ausnahme (Abschnitt 5) abgenommen?
3. Ist der Verzicht auf Offline-Betrieb (Abschnitt 3) fachlich tragbar?
4. Wird die Kamera-Zugriffsschicht (AP-M4) vorgezogen oder bis zum Mängelmeldungskonzept
   zurückgestellt?
5. Ab wann wird iOS tatsächlich gebraucht? Davon hängt ab, ob AP-M6 mitgeplant oder später
   neu bewertet wird.
6. Welcher Hostname trägt die App? Die App-Links-Verifizierung bindet sich an eine konkrete
   Domain; ein späterer Wechsel erfordert neue Signaturkonfiguration und neue Aufkleber nur
   dann nicht, wenn die Kurzpfade unter derselben Domain bleiben.
