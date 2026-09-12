-- Fahrzeugmodul (AP-F2). Wartungstermine liegen als JSON-Array in der
-- Fahrzeugzeile, analog zur bestehenden PEP-Datei als ein zusammengehöriger
-- Datensatz (siehe docs/konzept-fahrzeuge.md). `version` ist ein reiner
-- Zähler für die optimistische Sperre über If-Match/If-None-Match, keine
-- fachliche Information.
CREATE TABLE fahrzeuge (
  id TEXT PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  funkrufname TEXT NOT NULL,
  kennzeichen TEXT NOT NULL,
  fahrgestellnummer TEXT,
  eigentuemer TEXT NOT NULL,
  bemerkung TEXT NOT NULL,
  wartungstermine TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- Ablesungen sind unveränderlich (siehe Konzept, Abschnitt 8: unbegrenzte
-- Aufbewahrung, keine Löschung). Eine Korrektur ist ein neuer Datensatz mit
-- Verweis über `korrigiert`, nie ein Update einer bestehenden Zeile.
CREATE TABLE ablesungen (
  id TEXT PRIMARY KEY,
  fahrzeug_id TEXT NOT NULL REFERENCES fahrzeuge (id),
  abgelesen_am TEXT NOT NULL,
  stand INTEGER NOT NULL,
  erfasst_am TEXT NOT NULL,
  erfasst_von TEXT NOT NULL,
  quelle TEXT NOT NULL,
  korrigiert TEXT,
  bemerkung TEXT NOT NULL
);

CREATE INDEX idx_ablesungen_fahrzeug_datum ON ablesungen (fahrzeug_id, abgelesen_am);
