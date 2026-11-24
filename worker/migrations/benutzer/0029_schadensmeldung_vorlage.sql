-- PDF-Formular der Schadens- und Verlustmeldung (Anlage 5, siehe docs/konzept-vorgaenge.md,
-- Abschnitt 9): genau eine Zeile mit fester id, gleiches Muster wie `ehrungsantrag_vorlage` (0019).
-- Der Worker verwahrt die Datei nur, gefüllt wird sie im Browser.
CREATE TABLE schadensmeldung_vorlage (
  id TEXT PRIMARY KEY,
  dateiname TEXT NOT NULL,
  inhalt BLOB NOT NULL,
  version INTEGER NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);
