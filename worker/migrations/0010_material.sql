-- Materialverwaltung, Punkt "Fahrzeugcheck" (AP-M1).
--
-- Warum in FAHRZEUGE_DB und nicht in einer eigenen Datenbank: die Konvention
-- "eine Datenbank je Fachdomäne" trägt hier nicht. Ein Behälter ist kein
-- eigenständiges Fachobjekt, sondern haengt an genau einem Fahrzeug; die
-- Freigabeberechtigung eines Checks ergibt sich aus `fahrzeuge.gruppe`, und die
-- Behälterübersicht braucht in **einem** Aufruf Behälter samt Fahrzeugangaben.
-- Eine eigene Datenbank kostete den Fremdschlüssel und verdoppelte jede
-- Abfrage - gegen die Sparsamkeitsregel "ein Aufruf über den ganzen Bestand".
-- Präzedenzfall besteht: `systemkonfiguration` liegt in BENUTZER_DB statt in
-- einer eigenen Datenbank.
--
-- Warum Fächer, Artikel und Checkpositionen als JSON in einer Spalte und nicht
-- als eigene Zeilen: ein Check hat gut hundert Positionen. Eine Zeile je
-- Position wäre ein Schreibvorgang je Position gegen das Tageskontingent des
-- kostenlosen Tarifs. Ein abgeschlossener Check ist eine unveränderliche
-- Momentaufnahme - es gibt kein Bearbeiten einzelner Positionen und keine
-- Auswertung quer über Positionen verschiedener Checks. Dasselbe Muster führt
-- `angebote` mit seinen Schichten bereits (Migration 0008).

CREATE TABLE pruefvorlagen (
  id TEXT PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  beschreibung TEXT NOT NULL,
  -- Fußzeile der erzeugten Berichte; benennt die fachliche Grundlage der Liste.
  grundlage TEXT NOT NULL,
  -- JSON-Array der Fächer:
  -- [{ id, bezeichnung, artikel: [{ id, bezeichnung, sollMenge, einheit,
  --    herkunft: 'seg'|'land'|'beide', verfallsdatumPflicht: boolean }] }]
  inhalt TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  -- Zählerstand der optimistischen Sperre (If-Match), wie bei fahrzeuge/angebote.
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE behaelter (
  id TEXT PRIMARY KEY,
  fahrzeug_id TEXT NOT NULL REFERENCES fahrzeuge (id),
  -- Physisches Einzelstück mit eigener Identität: ein GW SAN trägt zehn
  -- Notfallrucksäcke, jeder davon wird einzeln geprüft ("NFR 3").
  bezeichnung TEXT NOT NULL,
  vorlage_id TEXT NOT NULL REFERENCES pruefvorlagen (id),
  bemerkung TEXT NOT NULL,
  -- Geheimnis des öffentlichen QR-Wegs, wie fahrzeuge.erfassung_token: steht nie
  -- in einer Behälterantwort, nie in einem Log und nie in einem Fehlertext.
  check_token TEXT,
  check_token_am TEXT,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_behaelter_fahrzeug ON behaelter (fahrzeug_id, bezeichnung);

CREATE UNIQUE INDEX idx_behaelter_check_token ON behaelter (check_token)
  WHERE check_token IS NOT NULL;

CREATE TABLE materialchecks (
  id TEXT PRIMARY KEY,
  behaelter_id TEXT NOT NULL REFERENCES behaelter (id),
  -- Momentaufnahme der Vorlage: Bezeichnung, Sollmenge, Einheit und Herkunft
  -- jeder Position stehen vollständig in `positionen`. Die Verweise hier dienen
  -- allein der Nachverfolgung, damit ein späteres Umbenennen oder Löschen eines
  -- Vorlagenartikels keinen gespeicherten Check beschädigen kann (dasselbe
  -- Prinzip wie herkunftEintragId im Angebotswesen).
  vorlage_id TEXT NOT NULL,
  vorlage_version INTEGER NOT NULL,
  vorlage_bezeichnung TEXT NOT NULL,
  grundlage TEXT NOT NULL,
  -- Berliner Kalendertag, serverseitig gesetzt; nie aus dem Anfragekörper.
  geprueft_am TEXT NOT NULL,
  erfasst_am TEXT NOT NULL,
  -- Immer eine geprüfte Identität. Bei einem freigegebenen öffentlichen Check
  -- ist das die **freigebende** Person; der selbst angegebene Name steht
  -- daneben in gemeldet_von_name.
  erfasst_von TEXT NOT NULL,
  gemeldet_von_name TEXT,
  -- 'angemeldet' | 'oeffentlich'. 'oeffentlich' entsteht ausschließlich intern
  -- bei der Freigabe und ist über POST .../checks nicht einreichbar.
  quelle TEXT NOT NULL,
  -- 0, wenn der globale Schalter "Verfallsdaten erfassen" beim Check aus war.
  verfallsdatum_erfasst INTEGER NOT NULL,
  bemerkung TEXT NOT NULL,
  -- JSON-Array: [{ artikelId, fachId, fach, bezeichnung, sollMenge, einheit,
  --   herkunft, geprueft, istMenge, unbrauchbar, verfallsdaten: (string|null)[] }]
  positionen TEXT NOT NULL,
  -- Kennzahlen zusätzlich als Spalten, damit die Übersicht kein JSON parsen muss.
  positionen_gesamt INTEGER NOT NULL,
  positionen_geprueft INTEGER NOT NULL,
  fehlmengen INTEGER NOT NULL,
  unbrauchbar INTEGER NOT NULL,
  abgelaufen INTEGER NOT NULL
);

CREATE INDEX idx_materialchecks_behaelter ON materialchecks (behaelter_id, geprueft_am);

-- Eine öffentliche Meldung wird nie von selbst ein Check. Sie liegt hier und
-- wird erst durch die Freigabe einer geprüften Identität zu einer Zeile in
-- `materialchecks`. Deshalb eine eigene Tabelle und kein Statusfeld auf
-- materialchecks: dort steht ausschließlich, was als geprüfter Stand gilt -
-- dieselbe Entscheidung wie bei ablesung_einreichungen (Migration 0007).
CREATE TABLE check_einreichungen (
  id TEXT PRIMARY KEY,
  behaelter_id TEXT NOT NULL REFERENCES behaelter (id),
  vorlage_id TEXT NOT NULL,
  vorlage_version INTEGER NOT NULL,
  vorlage_bezeichnung TEXT NOT NULL,
  grundlage TEXT NOT NULL,
  geprueft_am TEXT NOT NULL,
  verfallsdatum_erfasst INTEGER NOT NULL,
  bemerkung TEXT NOT NULL,
  positionen TEXT NOT NULL,
  positionen_gesamt INTEGER NOT NULL,
  positionen_geprueft INTEGER NOT NULL,
  fehlmengen INTEGER NOT NULL,
  unbrauchbar INTEGER NOT NULL,
  abgelaufen INTEGER NOT NULL,
  eingereicht_am TEXT NOT NULL,
  -- Ungeprüfte Selbstauskunft der meldenden Person.
  eingereicht_von_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen',
  entschieden_am TEXT,
  entschieden_von TEXT,
  ablehnungsgrund TEXT,
  check_id TEXT REFERENCES materialchecks (id)
);

CREATE INDEX idx_check_einreichungen_offen ON check_einreichungen (status, eingereicht_am);
CREATE INDEX idx_check_einreichungen_behaelter ON check_einreichungen (behaelter_id, eingereicht_am);

-- Zwischenstand eines laufenden Checks. Zusammengesetzter Schlüssel statt
-- eigener Id: je Behälter und Inhaber gibt es genau einen Zwischenstand, jedes
-- Speichern ist ein INSERT ... ON CONFLICT DO UPDATE. So kann der öffentliche
-- Weg nicht beliebig viele Zeilen anlegen. `inhaber` ist die geprüfte E-Mail
-- oder '' für den QR-Weg.
CREATE TABLE check_entwuerfe (
  behaelter_id TEXT NOT NULL REFERENCES behaelter (id),
  inhaber TEXT NOT NULL,
  inhalt TEXT NOT NULL,
  gespeichert_am TEXT NOT NULL,
  gespeichert_von_name TEXT NOT NULL,
  PRIMARY KEY (behaelter_id, inhaber)
);

-- Startbestand: die Ausstattungsliste des Notfallrucksacks Einsatzeinheit aus
-- der bisherigen HTML-Checkliste (11 Fächer, 125 Artikel). Sie ist ab hier
-- gewöhnliche Fachdatenpflege - eine zweite Vorlage braucht keine Migration,
-- sondern POST /api/material/vorlagen.
--
-- `verfallsdatumPflicht` ist auf 83 der 125 Artikel gesetzt, nach einer mit dem
-- Betreiber abgestimmten Regel: markiert ist, was ein aufgedrucktes Verfalls-
-- oder Haltbarkeitsdatum trägt und verbraucht wird - steril verpacktes
-- Einmalmaterial (Tuben, Katheter, Kanülen, Spritzen, Kompressen,
-- Verbandmaterial, Masken, Filter, Skalpell, Mandrins), Flüssigkeiten und
-- Chemikalien (Infusion, Gleitgel, Desinfektion, Kontrolllösung, Batterien)
-- sowie unsteriles Verbrauchsmaterial mit Haltbarkeitsangabe (Klebeband,
-- Einweghandschuhe, Brechbeutel, Rettungsdecke, Kühlpack). Nicht markiert sind
-- Geräte und Mehrweginstrumente, Textilien ohne Sterilverpackung, Papier,
-- Behälter und Beutel sowie Schienenmaterial.
--
-- Die erste Fassung hatte nur 34 Artikel markiert und war dabei
-- widersprüchlich: Verbandmaterial war fast vollständig erfasst, steriles
-- Einmalmaterial fast gar nicht - alle Endotracheal- und Larynxtuben,
-- Spritzen, Venenkatheter und Kanülen trugen keine Pflicht, während das
-- Pflaster für den Venenkatheter daneben sie trug.
--
-- Vier bewusste Grenzfälle: das Blutzuckermessgerät bleibt markiert, weil die
-- 15 Safety-Lanzetten derselben Zeile verfallen (die Zeile wird nicht
-- aufgeteilt, sie stammt so aus der Vorlage); die Blockerspritzen der
-- Tubensätze bleiben unmarkiert, weil sie Mehrwegzubehör sind; der
-- Einmalrasierer bleibt unmarkiert, weil er kein Verfallsdatum trägt; die
-- Sauerstoffflasche hat die Markierung verloren, weil sie einen Prüftermin
-- (Druckbehälterprüfung) trägt und kein Verfallsdatum.
--
-- Eine Markierung erzwingt keine Eingabe: ein nicht erfasstes Feld bleibt
-- `null`, und ein Check lässt sich trotzdem abschließen. Die Liste bleibt in
-- der Oberfläche jederzeit änderbar.
INSERT INTO pruefvorlagen (id, bezeichnung, beschreibung, grundlage, inhalt,
                           geaendert_am, geaendert_von, version)
VALUES (
  '4e465200-0000-4000-8000-000000000000',
  'Notfallrucksack Einsatzeinheit (NFR EE)',
  'Bestandskontrolle nach Fach. Reihenfolge frei wählbar.',
  'Ausstattung Notfallrucksack Einsatzeinheit (NFR EE, Stand 25.10.2012) und Inhaltsverzeichnis Notfallrucksack Erwachsene (BBK-Begleitheft GW San NW, Stand März 2013)',
  '[{"id":"4e465200-0000-4000-8000-000000000001","bezeichnung":"Mitteltrennwand für Intubation","artikel":[{"id":"4e465201-0000-4000-8000-000000000001","bezeichnung":"Guedeltubus Gr. 0","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000002","bezeichnung":"Guedeltubus Gr. 1","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000003","bezeichnung":"Guedeltubus Gr. 2","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000004","bezeichnung":"Guedeltubus Gr. 3","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000005","bezeichnung":"Guedeltubus Gr. 4","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000006","bezeichnung":"Guedeltubus Gr. 5","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000007","bezeichnung":"Laryngoskop Handgriff (Erwachsene + Kinder)","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000008","bezeichnung":"Ersatzbatterien für das Laryngoskop","sollMenge":1,"einheit":"Paar","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000009","bezeichnung":"Ersatzleuchtmittel für das Laryngoskop","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000010","bezeichnung":"Macintosh Spatel Gr. 2","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000011","bezeichnung":"Macintosh Spatel Gr. 3","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000012","bezeichnung":"Macintosh Spatel Gr. 4","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000013","bezeichnung":"Miller Spatel Gr. 0","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000014","bezeichnung":"Miller Spatel Gr. 1","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000015","bezeichnung":"Leukoplast 2,5 cm (Mitteltrennwand)","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000016","bezeichnung":"Absaugkatheter Ch 10 schwarz","sollMenge":2,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000017","bezeichnung":"Absaugkatheter Ch 14 grün","sollMenge":2,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000018","bezeichnung":"Absaugkatheter Ch 18 rot","sollMenge":2,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000019","bezeichnung":"Absaugkatheter Ch 20","sollMenge":2,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000020","bezeichnung":"Magillzange Erwachsene","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000021","bezeichnung":"Magillzange Kind","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000022","bezeichnung":"Einführungsmandrin Gr. 1","sollMenge":2,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000023","bezeichnung":"Mandrin Gr. 12","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000024","bezeichnung":"Mandrin Gr. 14","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000025","bezeichnung":"Einmalskalpell Gr. 11","sollMenge":2,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000026","bezeichnung":"Tubusfixierung z. B. Thomas Tube Holder","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000027","bezeichnung":"Gleitgel für die Tuben","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000028","bezeichnung":"Mullbinde 8 cm","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true}]},{"id":"4e465200-0000-4000-8000-000000000002","bezeichnung":"Deckelinnenseite","artikel":[{"id":"4e465201-0000-4000-8000-000000000029","bezeichnung":"Endotrachealtubus 3,0 mm ID","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000030","bezeichnung":"Endotrachealtubus Ch 22 - 5,5 mm ID","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000031","bezeichnung":"Endotrachealtubus 4,0 mm ID","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000032","bezeichnung":"Endotrachealtubus 5,0 mm ID","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000033","bezeichnung":"Endotrachealtubus 6,0 mm ID","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000034","bezeichnung":"Endotrachealtubus 7,0 mm ID","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000035","bezeichnung":"Endotrachealtubus 8,0 mm ID","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000036","bezeichnung":"Endotrachealtubus Ch 34 - 8,5 mm ID","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000037","bezeichnung":"Endotrachealtubus 9,0 mm ID","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000038","bezeichnung":"Kinder-Trachealtubus CH 12 - 3,5 mm ID","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000039","bezeichnung":"Larynxtubus Gr. 3","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000040","bezeichnung":"Larynxtubus Gr. 4","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000041","bezeichnung":"Larynxtubus Gr. 5","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000042","bezeichnung":"Blockerspritze für die Larynxtuben","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000043","bezeichnung":"Blockerspritze für die Endotrachealtuben","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false}]},{"id":"4e465200-0000-4000-8000-000000000003","bezeichnung":"Deckelaußenseite oben","artikel":[{"id":"4e465201-0000-4000-8000-000000000044","bezeichnung":"Kleiderschere / Schere 19 cm","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000045","bezeichnung":"Kühlpack","sollMenge":2,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000046","bezeichnung":"Verbandpäckchen mittel","sollMenge":10,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000047","bezeichnung":"Verbandpäckchen G groß","sollMenge":2,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000048","bezeichnung":"Verbandpäckchen K klein","sollMenge":2,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000049","bezeichnung":"Elastische Fixierbinde mittel","sollMenge":3,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000050","bezeichnung":"Fixierbinde FB 8, 4 m x 6 cm","sollMenge":3,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000051","bezeichnung":"Fixierbinde FB 6, 4 m x 6 cm","sollMenge":3,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000052","bezeichnung":"Rettungsdecke Gold/Silber","sollMenge":2,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000053","bezeichnung":"Sterile Kompresse 10 x 10 cm","sollMenge":6,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000054","bezeichnung":"Unsterile Kompresse 10 x 10 cm","sollMenge":10,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000055","bezeichnung":"Müllbeutel, 20 Liter","sollMenge":2,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000056","bezeichnung":"Dreiecktuch","sollMenge":2,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000057","bezeichnung":"Verbandtuch 60 x 80 cm","sollMenge":2,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000058","bezeichnung":"Verbandtuch BR 40 x 60 cm","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000059","bezeichnung":"Tourniquet","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000060","bezeichnung":"Metalline Brandwundentuch 80 x 120 cm","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000061","bezeichnung":"Wundschnellverband 10 x 6 cm","sollMenge":16,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000062","bezeichnung":"Fingerkuppenverband aluderm","sollMenge":5,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000063","bezeichnung":"Wundschnellverband 18 x 2 cm aluderm","sollMenge":5,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000064","bezeichnung":"Pflasterstrips 1,9 x 7,2 cm aluderm","sollMenge":10,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000065","bezeichnung":"Augenkompresse Du Ocul aluderm","sollMenge":2,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000066","bezeichnung":"Netzverband Gr. 3","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000067","bezeichnung":"Anhängeblock für Verletzte/Kranke, Satz mit 5 Karten","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":false}]},{"id":"4e465200-0000-4000-8000-000000000004","bezeichnung":"Deckelaußenseite unten","artikel":[{"id":"4e465201-0000-4000-8000-000000000068","bezeichnung":"Ringer Lösung / Infusionslösung 500 ml","sollMenge":2,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000069","bezeichnung":"Infusionssysteme / Infusionsbesteck","sollMenge":2,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true}]},{"id":"4e465200-0000-4000-8000-000000000005","bezeichnung":"Seitenfach links außen","artikel":[{"id":"4e465201-0000-4000-8000-000000000070","bezeichnung":"Pulsoximeter mit Patientenkabel (ggf.)","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000071","bezeichnung":"Stethoskop Erwachsene","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000072","bezeichnung":"Blutdruckmessgerät Erwachsene (Manometer + Manschette)","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000073","bezeichnung":"Blutdruckmessmanschette Kind / Klettmanschette","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000074","bezeichnung":"Diagnostik Kleinleuchte","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000075","bezeichnung":"Kontrolllösung (BZ-Messgerät)","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true}]},{"id":"4e465200-0000-4000-8000-000000000006","bezeichnung":"Seitenfach rechts außen oben","artikel":[{"id":"4e465201-0000-4000-8000-000000000076","bezeichnung":"Blutzuckermessgerät mit 15 Safety-Lanzetten","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000077","bezeichnung":"Unsterile Kompressen 10 x 10 cm","sollMenge":10,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000078","bezeichnung":"Händedesinfektionsmittel","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true}]},{"id":"4e465200-0000-4000-8000-000000000007","bezeichnung":"Seitenfach rechts außen unten","artikel":[{"id":"4e465201-0000-4000-8000-000000000079","bezeichnung":"Einweghandschuhe Größe L / XL","sollMenge":16,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000080","bezeichnung":"„Sic Sac“ Brechbeutel","sollMenge":2,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000081","bezeichnung":"Kanülenabwurfbehälter","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":false}]},{"id":"4e465200-0000-4000-8000-000000000008","bezeichnung":"Innenfach mit Reißverschluss","artikel":[{"id":"4e465201-0000-4000-8000-000000000082","bezeichnung":"SAM Splint-Schiene","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000083","bezeichnung":"Schienenmaterial QuickFix Alu Polsterschiene klein 45 x 11 cm","sollMenge":2,"einheit":"","herkunft":"land","verfallsdatumPflicht":false}]},{"id":"4e465200-0000-4000-8000-000000000009","bezeichnung":"Fach für Protokolle","artikel":[{"id":"4e465201-0000-4000-8000-000000000084","bezeichnung":"Einsatzprotokolle Notfallrettung","sollMenge":5,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000085","bezeichnung":"Einsatzprotokolle Sanitätswachdienst (gemäß Vorgabe der Hilfsorganisationen)","sollMenge":10,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000086","bezeichnung":"Hinweise für Pflege, Behandlung, Aufbereitung und Instrumente","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000087","bezeichnung":"Inhalts- und Ortsverzeichnis","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000088","bezeichnung":"Pflegeanleitung Rucksack","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000089","bezeichnung":"Liste mit Verfallsdaten","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":false}]},{"id":"4e465200-0000-4000-8000-000000000010","bezeichnung":"Hauptfach","artikel":[{"id":"4e465201-0000-4000-8000-000000000090","bezeichnung":"Beatmungsbeutel Kind mit Sauerstoffreservoir, ggf. Einweg","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000091","bezeichnung":"Beatmungsbeutel Erwachsene mit Sauerstoffreservoir, ggf. Einweg","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000092","bezeichnung":"Beatmungsmaske Gr. 2","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000093","bezeichnung":"Beatmungsmaske Gr. 3","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000094","bezeichnung":"Beatmungsmaske Gr. 4","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000095","bezeichnung":"Beatmungsmaske Gr. 5","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000096","bezeichnung":"Handabsaugpumpe mit Auffangbehälter / Absauggerät","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000097","bezeichnung":"Kontamedbox klein","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000098","bezeichnung":"Sauerstoffflasche, 2 Liter mit Druckminderer","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000099","bezeichnung":"Sauerstoffmaske mit Reservoir und Schlauch / Inhalationsmaske","sollMenge":2,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000100","bezeichnung":"Müllbeutel","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000101","bezeichnung":"Zahnprothesenbeutel","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000102","bezeichnung":"Klimafilter Erwachsene","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000103","bezeichnung":"Klimafilter Kind","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000104","bezeichnung":"Vliesstoff-Tuch","sollMenge":10,"einheit":"","herkunft":"land","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000105","bezeichnung":"Folienbeutel","sollMenge":2,"einheit":"","herkunft":"land","verfallsdatumPflicht":false}]},{"id":"4e465200-0000-4000-8000-000000000011","bezeichnung":"Trennwand zum Hauptfach","artikel":[{"id":"4e465201-0000-4000-8000-000000000106","bezeichnung":"Faserschreiber","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000107","bezeichnung":"Stauschlauch / Einhandvenenstauer","sollMenge":1,"einheit":"","herkunft":"beide","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000108","bezeichnung":"Spritze 2 ml","sollMenge":5,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000109","bezeichnung":"Spritze 5 ml","sollMenge":5,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000110","bezeichnung":"Spritze 10 ml","sollMenge":2,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000111","bezeichnung":"Spritze 20 ml","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000112","bezeichnung":"Venenkatheter blau","sollMenge":2,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000113","bezeichnung":"Venenkatheter rosa","sollMenge":4,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000114","bezeichnung":"Venenkatheter weiß (G17)","sollMenge":4,"einheit":"","herkunft":"beide","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000115","bezeichnung":"Venenkatheter orange","sollMenge":2,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000116","bezeichnung":"Sicherheitsvenenverweilkanüle G18 - 1,3 grün","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000117","bezeichnung":"Sicherheitsvenenverweilkanüle G16 - 45 mm","sollMenge":1,"einheit":"","herkunft":"land","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000118","bezeichnung":"Pflaster für Venenkatheter","sollMenge":4,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000119","bezeichnung":"Reflexhammer nach Buck","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000120","bezeichnung":"Einmalrasierer","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000121","bezeichnung":"Anatomische Pinzette","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":false},{"id":"4e465201-0000-4000-8000-000000000122","bezeichnung":"Gelbe Kanülen","sollMenge":10,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000123","bezeichnung":"Leukoplast 1,25 cm","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000124","bezeichnung":"Leukoplast 2,5 cm (Trennwand Hauptfach)","sollMenge":1,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true},{"id":"4e465201-0000-4000-8000-000000000125","bezeichnung":"Rote Verschlussstopfen","sollMenge":10,"einheit":"","herkunft":"seg","verfallsdatumPflicht":true}]}]',
  '2026-09-21T00:00:00.000Z',
  'migration',
  1
);
