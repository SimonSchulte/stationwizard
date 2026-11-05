-- PEP (Personaleinsatzplanung) in der Datenbank statt in Nextcloud: eine PEP je Einsatz und
-- PEP-Vorlagen, dokumentartig wie `vorbereitungen` und `vb_vorlagen`. Inhalt als vom Worker
-- streng geprüftes JSON (Posten, Positionen, Einsatzkräfte), eigene `version` je Zeile für die
-- optimistische Sperre. Die Kennzahlspalten setzt ausschließlich der Worker, damit die
-- Einsatzliste kein JSON parsen muss. Es gibt keine Übernahme alter Nextcloud-Dateien und
-- keinen Startbestand. Konzept: docs/konzept-einsatzplanung-vb.md, Abschnitt 10.

CREATE TABLE peps (
  einsatz_id TEXT PRIMARY KEY REFERENCES einsaetze (id) ON DELETE CASCADE,
  schema INTEGER NOT NULL DEFAULT 1, -- Schemaversion des Inhalts
  vorlage_id TEXT, -- nur zur Nachverfolgung, kein Fremdschlüssel: eine Vorlage darf entfallen
  inhalt TEXT NOT NULL, -- JSON: { beschreibung, posten[] mit positionen[], einsatzkraefte[], einsatzleiterId }
  posten INTEGER NOT NULL,
  positionen INTEGER NOT NULL,
  besetzt INTEGER NOT NULL, -- Positionen mit einsatzkraftId
  einsatzkraefte INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

CREATE TABLE pep_vorlagen (
  id TEXT PRIMARY KEY,
  titel TEXT NOT NULL,
  inhalt TEXT NOT NULL, -- JSON: { beschreibung, posten[] }, keine Einsatzkräfte, keine Zuordnung
  posten INTEGER NOT NULL,
  positionen INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

-- Der Verweis auf die Nextcloud-Datei entfällt. Auf `pep_id` liegt kein Index
-- (siehe 0020_einsatzplanung.sql), die Spalte lässt sich daher unmittelbar entfernen.
ALTER TABLE einsaetze DROP COLUMN pep_id;
