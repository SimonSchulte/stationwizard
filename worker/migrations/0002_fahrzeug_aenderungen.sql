-- Änderungsprotokoll (siehe docs/konzept-fahrzeuge.md, Abschnitt „Änderungsprotokoll").
-- Ausschließlich serverseitig befüllt: der Worker leitet `beschreibung` aus dem
-- tatsächlichen Unterschied zwischen altem und neuem Stand ab, `von` und
-- `zeitpunkt` kommen aus der geprüften Anmeldung bzw. der Serverzeit. Kein
-- Client-Schreibzugriff auf diese Tabelle.
CREATE TABLE fahrzeug_aenderungen (
  id TEXT PRIMARY KEY,
  fahrzeug_id TEXT NOT NULL REFERENCES fahrzeuge (id),
  zeitpunkt TEXT NOT NULL,
  von TEXT NOT NULL,
  beschreibung TEXT NOT NULL
);

CREATE INDEX idx_fahrzeug_aenderungen_fahrzeug_zeit
  ON fahrzeug_aenderungen (fahrzeug_id, zeitpunkt);
