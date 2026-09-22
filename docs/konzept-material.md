# Konzept: Modul „Materialverwaltung"

Dieses Dokument beschreibt das vierte Fachmodul neben Ausbildungs-, Einsatz- und
Fahrzeugplanung. Anders als `konzept-fahrzeuge.md` bei seiner Entstehung beschreibt es
einen **umgesetzten** Stand: die Arbeitspakete AP-M1 bis AP-M7 liegen auf
`claude/funny-cannon-j35k2h`. Was nicht umgesetzt ist, steht in Abschnitt 8.

## 1. Ziel und Abgrenzung

Die Einheit kontrolliert den Bestand ihrer Notfallrucksäcke bisher mit einer statischen
HTML-Seite: Fächer abhaken, Ist-Mengen korrigieren, Unbrauchbares markieren, optional
Verfallsdaten erfassen, am Ende Bestellschein und Mängelanzeigen als Text herauskopieren.
Die Seite speichert nichts. Ein Check ist nach dem Schließen des Tabs verloren, niemand
weiß, wer wann was geprüft hat, und die Soll-Liste steht im Quelltext.

Das Modul überführt genau das in die App und ergänzt, was der Zettelweg nicht leisten kann:
die Soll-Listen sind pflegbar, ein Check ist ein dauerhafter und einer Person zurechenbarer
Datensatz, die Berichte lassen sich verschicken, und der Check ist per QR-Code ohne
Anmeldung am Telefon durchführbar.

**Umfang dieses Wurfs ist ausschließlich der Fahrzeugcheck.** Das Modul heißt
„Materialverwaltung", weil weitere Punkte absehbar sind, ist aber nicht auf Vorrat für sie
gebaut. Nicht Gegenstand: Lagerhaltung, Bestellabwicklung, Wareneingang, Gerätebuch nach
MPBetreibV, Ausgabe an Personen, Wartungs- oder Prüffristen von Geräten. Das Modul erfasst
**Bestandsprüfungen**, keine Bestände.

### Verhältnis zum Bestand

Behälter hängen an Fahrzeugen des Moduls `fahrzeuge/`; deren Gruppe entscheidet über die
Freigabeberechtigung. Der öffentliche Weg übernimmt Aufbau, Schutzmaßnahmen und Wortlaut
der öffentlichen Kilometermeldung (siehe `konzept-fahrzeuge.md`, Abschnitt 10) so weit wie
möglich unverändert – jede Abweichung davon ist in Abschnitt 7 einzeln begründet.

## 2. Domänenmodell

**Prüfvorlage** – eine Soll-Liste. Bezeichnung, Beschreibung, `grundlage` (die Fußzeile der
erzeugten Berichte, etwa „NFR EE, Stand 25.10.2012"), und ein Baum aus **Fächern** mit
**Artikeln**. Ein Artikel hat Bezeichnung, Sollmenge, Einheit, `herkunft`
(`seg` | `land` | `beide`) und `verfallsdatumPflicht`.

**Behälter** – ein physisches Einzelstück mit eigener Identität, das an genau einem Fahrzeug
hängt und nach genau einer Vorlage geprüft wird. Das ist die zentrale fachliche Festlegung:
ein GW SAN trägt zehn Notfallrucksäcke, jeder KTW-B einen, und jeder davon wird **einzeln**
geprüft. „NFR 3 auf dem GW SAN 01" ist ein Behälter, nicht eine Rolle des Fahrzeugs. Die
drei Fahrzeuge aus dem Prototyp (Abschnitt 1) sind mit ihren Behältern inzwischen real
angelegt: der GW Sanintätsdienst (Funkrufname 72 GW-SAN 01) mit zehn Behältern „NFR 1" bis
„NFR 10", die beiden KTW-B je mit einem Behälter „NFR" – die Behälterbezeichnung folgt
also dem Fahrzeug, nicht einer eigenen, dem Prototyp entlehnten Nummerierung „GW SAN 01…10",
die dort irreführend zehn verschiedene Fahrzeuge suggerierte, obwohl es sich um zehn
Behälter desselben Fahrzeugs handelt.

**Check** – das Ergebnis einer Prüfung genau eines Behälters zu genau einem Zeitpunkt, durch
genau eine Person. Eine Checkposition trägt Ist-Menge, „geprüft", „unbrauchbar" und
gegebenenfalls Verfallsdaten je Stück – und dazu ihre **eigene Momentaufnahme** von
Bezeichnung, Sollmenge, Einheit und Herkunft.

**Einreichung** – eine über den öffentlichen Weg gemeldete Prüfung, die noch keine ist.

**Herkunft** unterscheidet, wer Ersatz beschafft: SEG-eigenes Material gegenüber
Landesmaterial. Sie steuert, in welchem der beiden Mängelberichte eine Position erscheint,
und ist deshalb Teil der Vorlage und nicht eine Anzeigeeigenschaft.

### Welche Artikel ein Verfallsdatum tragen

`verfallsdatumPflicht` folgt einer mit dem Betreiber abgestimmten Regel: markiert ist, was
ein **aufgedrucktes Verfalls- oder Haltbarkeitsdatum trägt und verbraucht wird** – steril
verpacktes Einmalmaterial (Tuben, Katheter, Kanülen, Spritzen, Kompressen, Verbandmaterial,
Masken, Filter), Flüssigkeiten und Chemikalien (Infusion, Gleitgel, Desinfektion,
Kontrolllösung, Batterien) sowie unsteriles Verbrauchsmaterial mit Haltbarkeitsangabe
(Klebeband, Einweghandschuhe, Brechbeutel, Rettungsdecke, Kühlpack). Nicht markiert sind
Geräte und Mehrweginstrumente, Textilien ohne Sterilverpackung, Papier, Behälter und Beutel
sowie Schienenmaterial. Das ergibt 83 der 125 Artikel.

Vier Grenzfälle sind bewusst entschieden: das **Blutzuckermessgerät** bleibt markiert, weil
die 15 Safety-Lanzetten derselben Zeile verfallen – die Zeile wird nicht aufgeteilt, sie
stammt so aus der Vorlage. Die **Blockerspritzen** der Tubensätze bleiben unmarkiert
(Mehrwegzubehör), ebenso der **Einmalrasierer** (Einmalprodukt ohne Verfallsdatum). Die
**Sauerstoffflasche** ist nicht markiert, weil sie einen Prüftermin trägt
(Druckbehälterprüfung) und kein Verfallsdatum – eine Fälligkeit, die fachlich zu den
Wartungsterminen gehört und im Modul bewusst noch nicht abgebildet ist.

Die Regel steht ausführlich im Kommentar über dem `INSERT` in Migration 0010. **Seit dem
2026-09-22 ist 0010 angewendet**; die Datei ist damit eingefroren, und eine Korrektur am
Startbestand läuft über die Vorlagenpflege in der Oberfläche oder über eine Migration 0011 –
nicht mehr durch Ändern der Datei. Eine Markierung erzwingt keine Eingabe: ein nicht
erfasstes Feld bleibt `null`, und der Check lässt sich trotzdem abschließen.

## 3. Statuslogik und Verfallsdaten

Ein Verfallsdatum wird als Monat erfasst (`JJJJ-MM`), nicht als Tag: auf der Packung steht
ein Monat, und ein erfundener Tag wäre eine Scheingenauigkeit. Stichtag ist das **Monatsende**.
`verfallsdatumStatus()` kennt `keines`, `ok`, `laeuft-ab` (innerhalb `WARNFRIST_TAGE = 90`)
und `abgelaufen`.

Die Funktion steht **zweimal**: in `worker/src/material-check.ts` (für die Kennzahlen des
gespeicherten Checks) und in `src/app/material/services/check-status.ts` (für die sofortige
Rückmeldung beim Ausfüllen). Das ist dieselbe bewusste Verdopplung wie beim
Kilometerbericht und aus demselben Grund unvermeidbar: eine Rückmeldung je Tastendruck darf
keinen Serveraufruf kosten. Beide Fassungen sind in beiden Dateien als gemeinsam zu ändern
gekennzeichnet.

Die **Berichtslogik** ist bewusst **nicht** verdoppelt. Der ursprüngliche Plan sah ein
Frontend-Gegenstück `src/app/material/services/material-bericht.ts` vor und benannte die
Verdopplung selbst als Risiko; die Vorschau holt denselben Text stattdessen über den
Berichtsendpunkt. Der Unterschied zur Statuslogik: ein Bericht wird selten und bewusst
erzeugt, ein Serveraufruf ist dabei nicht störend.

Beim Wiedereinstieg kann es zwei Zwischenstände geben, den auf dem Gerät und den
serverseitigen. Übernommen wird der **neuere**; der andere bleibt im Speicher und ist mit
einem Knopf erreichbar, ohne dass ein weiterer Serveraufruf nötig wäre. Ein Stand, der nicht
mehr zur Prüfvorlage passt, wird verworfen statt halb übernommen.

Ein globaler Schalter beim Check überspringt die Verfallsdatenerfassung vollständig
(`verfallsdatum_erfasst`). Es gibt bewusst **keine Fälligkeit und keine Ampel** je Behälter:
angezeigt wird nur „zuletzt geprüft am …". Eine Fälligkeitsregel ohne fachliche Festlegung
wäre geraten.

## 4. QR-Codes und der öffentliche Weg

Für den öffentlichen Check gilt dieselbe Umkehrung wie bei der Kilometermeldung: der
QR-Code trägt ein **unerratbares Zufallstoken je Behälter**, weil es ohne Access-Sitzung das
einzige Zugangsmerkmal ist. `behaelter.check_token` ist ein Geheimnis – es steht nie in einer
Behälterantwort, nie in einem Log, nie in einem Fehlertext; auslesbar ist es allein über
`GET /api/material/behaelter/<UUID>/pruefcode` und `GET /api/material/pruefcodes`. Erneuern
macht alle gedruckten Aufkleber dieses Behälters ungültig; es gibt bewusst keine
Übergangsfrist mit zwei gültigen Token.

Für die internen Wege gilt „kein Token" unverändert weiter: es gibt keinen Kurzlink auf einen
Behälter.

Die öffentliche Seite gibt preis: Behälterbezeichnung, Fahrzeugbezeichnung, Funkrufname und
die Soll-Liste. **Nicht**: UUIDs, frühere Checks, Kennzeichen, E-Mail-Adressen. Unbekanntes
Token, formal ungültiges Token und gelöschter Behälter werden byteweise gleich beantwortet
(404 `CHECK_UNBEKANNT`) – kein Orakel. Die Mengenbremsen sind behälterbezogen und nicht
IP-bezogen (`MAX_OFFENE_JE_BEHAELTER = 3`, `WIEDERHOLFENSTER_MS = 300_000`), weil eine
IP-Speicherung eine neue personenbezogene Verarbeitung ohne fachlichen Auftrag wäre.

Die Seite läuft im **bestehenden** zweiten Build-Ziel `oeffentlich` mit, als zweite Seite
neben der Kilometermeldung. Ein drittes Build-Ziel hätte neue Dateinamen gebracht und damit
`OEFFENTLICHE_DATEIEN` angefasst – die gefährlichste Stelle des Repositorys. Preis dieser
Entscheidung ist, dass die Kilometerseite den Checkcode mitlädt; das Bündel wuchs dadurch von
rund 146 kB auf rund 151 kB, weshalb nur die **Warnschwelle** in `angular.json` von 150 kB
auf 200 kB angehoben wurde, die Fehlerschwelle von 250 kB aber unverändert blieb.

## 5. Oberfläche

Die Check-Oberfläche ist der Punkt, an dem es zählt: der öffentliche Weg ist der
Hauptanwendungsfall und findet praktisch ausschließlich auf Telefonen statt.

- **Klebriger Fortschritt** (`check-fortschritt`) mit „x von y geprüft", Fehlmengen,
  Unbrauchbarem und – nur wenn Verfallsdaten erfasst werden – deren eigenem Fortschritt.
  Solange nichts erfasst ist, steht dort ein neutrales „Verfallsdaten offen" und keine
  vermeintliche Entwarnung.
- **Fächer als aufklappbare Abschnitte** mit der Kopfzeile des Prototyps
  (`x/y geprüft · n unvollständig`).
- **Positionszeile** (`check-position`) mit einem Antippfeld über die ganze Breite
  (`--tap-ziel: 48px`), Mengensteller mit `inputmode="numeric"`, „unbrauchbar" und bei Bedarf
  einem Monatswähler je Stück. Herkunft als Chip.
- **Leer-, Lade- und Fehlerzustände** in der bestehenden Dreiergestalt.

Die angemeldete Seite (`behaelter-check`) und die öffentliche Seite teilen **das Verhalten,
nicht den Code**. Die öffentliche Seite bleibt strukturell isoliert: kein Router, kein
Angular Material, kein `HttpClient`, kein Weg zurück in die App.

Eine Eigenheit, die zweimal Zeit gekostet hat und deshalb hier steht: der Router der
Hauptanwendung läuft mit `withHashLocation()`, aber **ohne** `withComponentInputBinding()`.
Routenparameter kommen deshalb über `ActivatedRoute.paramMap` und `toSignal`, nie über
`input.required()` – letzteres scheitert zur Laufzeit mit NG0950 und fällt in keinem Test auf.

## 6. Persistenz

Alle fünf Tabellen liegen in `FAHRZEUGE_DB` (`worker/migrations/0010_material.sql`). Die
Konvention „eine Datenbank je Fachdomäne" trägt hier nicht: ein Behälter hängt an
`fahrzeuge.id`, die Freigabeberechtigung ergibt sich aus `fahrzeuge.gruppe`, und die
Behälterübersicht braucht in **einem** Aufruf Behälter samt Fahrzeugangaben. Zwei Datenbanken
kosteten den Fremdschlüssel und verdoppelten jede Abfrage – gegen die Sparsamkeitsregel
„ein Aufruf über den ganzen Bestand". Präzedenzfall ist `systemkonfiguration` in `BENUTZER_DB`.

`pruefvorlagen.inhalt` und `materialchecks.positionen` sind JSON in einer Spalte, nicht Zeilen.
Ein Check hat gut hundert Positionen; eine Zeile je Position wäre ein Schreibvorgang je
Position gegen das Tageskontingent. Tragfähig ist das, weil ein abgeschlossener Check eine
unveränderliche Momentaufnahme ist: kein Bearbeiten einzelner Positionen, keine Auswertung
quer über Positionen verschiedener Checks. Für die Listen sind die Kennzahlen zusätzlich als
Spalten geführt, damit keine Übersicht JSON parsen muss.

`check_einreichungen` ist eine **eigene Tabelle** und kein Statusfeld auf `materialchecks` –
derselbe Grund wie bei `ablesung_einreichungen`: in `materialchecks` steht ausschließlich, was
als geprüfter Stand gilt, und jede Kennzahl liest diese Tabelle vollständig.

`check_entwuerfe` ist eine Ersetzungstabelle mit zusammengesetztem Schlüssel
(`behaelter_id`, `inhaber`): jedes Speichern ist ein `INSERT … ON CONFLICT DO UPDATE`, je
Person und Behälter gibt es genau eine Zeile, und niemand kann beliebig viele anlegen.
`inhaber` ist ausschließlich die geprüfte E-Mail; ein fremder Stand ist über keinen Weg
lesbar. Geschrieben wird nur auf ausdrücklichen Knopfdruck – automatisch wäre das ein
Schreibvorgang je Änderung gegen das Tageskontingent. Gelesen wird der Stand **nicht** über
einen eigenen Endpunkt, sondern als Feld des Prüfauftrags, aus demselben Grund, aus dem der
Prüfauftrag überhaupt ein einzelner Aufruf ist. Beim Abschließen eines Checks räumt der
Worker den eigenen Entwurf in derselben Anweisungsfolge weg, sonst käme er beim nächsten
Öffnen wieder hoch.

Den serverseitigen Zwischenstand gibt es **nur im angemeldeten Bereich**. Auf der
öffentlichen Checkseite wäre `inhaber` leer, der Stand also je Behälter geteilt: jeder Scan
des Aufklebers könnte den halbfertigen Stand einer anderen Person lesen und überschreiben.
Dazu käme ein weiteres Muster im Access-Bypass und ein unangemeldeter Schreibzugriff, der
keine Einreichung ist. Dort bleibt es beim Gerätestand – für den Anwendungsfall „am Telefon
angefangen, am Rechner weiter" ist das kein Verlust, weil ein öffentlicher Check ohnehin an
den Aufkleber in der Hand gebunden ist.

### Optimistische Sperre

Vorlagen und Behälter tragen `version` und werden wie Fahrzeuge und Angebote behandelt:
Neuanlage nur mit `If-None-Match: *`, Update nur mit `If-Match`. Die Versionsnummer liest
gemeinsam `worker/src/etag.ts`, das einen abgeschwächten ETag (`W/"3"`) annimmt – Cloudflare
wandelt starke ETags bei Komprimierung um, und „Respect Strong ETags" fehlt im kostenlosen
Tarif. Checks sind unveränderlich und brauchen keine Sperre.

### Datenschutz

Gespeichert wird je Check die geprüfte E-Mail der erfassenden beziehungsweise freigebenden
Person und, beim öffentlichen Weg, der selbst angegebene Name. Keine IP-Adressen, keine
Gerätekennungen. Auf dem Gerät liegt ausschließlich der unfertige Arbeitsstand
(`localStorage`, zwei aufgezählte Schlüssel, siehe `CLAUDE.md`); die führende Fassung jedes
Checks liegt in D1.

## 7. Abweichungen vom Vorbild „öffentliche Kilometermeldung"

Zwei, und nur zwei:

1. **Körpergrenze 256 KB statt 2 KB** auf einem unangemeldeten Endpunkt. Ein Check mit
   hundert Positionen passt nicht in 2 KB. Gegengewicht sind die behälterbezogenen
   Mengenbremsen und `pruefePositionen()`: der Körper wird vollständig gegen die gespeicherte
   Vorlage geprüft – unbekannte Artikel-Ids werden verworfen, bevor irgendetwas geschrieben
   wird, und Bezeichnung, Sollmenge, Einheit und Herkunft kommen aus der Vorlage, nie aus dem
   Körper.
2. **Mehrfachfreigabe.** Die Ablesungen werden einzeln freigegeben; Checks fallen im Dutzend
   an, wenn ein GW SAN durchgeprüft wird. `POST /api/material/einreichungen/freigabe` nimmt
   bis zu 50 Ids und antwortet mit 200 und einem Ergebnis **je Eintrag** (`freigegeben`,
   `nicht-erlaubt`, `nicht-gefunden`, `nicht-offen`) statt die ganze Anfrage abzulehnen: die
   Liste ist ohnehin auf die eigenen Gruppen gefiltert, und ein einzelner Fehlschlag darf die
   übrigen Freigaben nicht verwerfen. Jede Einzelfreigabe ist über
   `WHERE id = ? AND status = 'offen'` gegen ein Rennen abgesichert.

Unverändert übernommen: `SCHUTZ_HEADER`, die strikte CSP, die eigene Ursprungsprüfung, die
eine `unbekannt()`-Antwort, exakt verankerte reguläre Ausdrücke statt Präfixabgleich, die
unveränderte Dateierlaubnisliste samt Inhaltstyp-Gegenprüfung.

## 8. Noch offen

- **Aufkleberbogen.** Der QR-Code eines Behälters ist auf der Detailseite sichtbar; ein
  druckbarer Bogen über alle Behälter – analog `fahrzeug-druckbogen.service.ts` – fehlt.
- **Rollen jenseits der Freigabe.** Vorlagen pflegen, Behälter anlegen und ändern
  steht weiterhin jeder geprüften Identität offen („Rechte vorerst alle, Rollen später").
  Die Rollenschranke der Materialeinstellungen ist zudem nur so stark wie die Rollenvergabe:
  `PUT /api/benutzerverwaltung/<E-Mail>` steht jeder geprüften Identität offen, wer sich
  selbst `zugfuehrung` setzt, kann auch die Empfänger ändern. Kein Grund, nicht zu prüfen,
  aber ehrlich zu benennen.
- **Prüfung am echten Telefon** steht aus; geprüft wurde im emulierten Chromium auf 390×844.
