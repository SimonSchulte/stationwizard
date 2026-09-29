-- Angebotswesen: Materialpauschale pro Dienst (nicht je Schicht). Eine
-- zusätzliche, immer in die rechnerische Summe einfließende Position, anders
-- als der bestehende Pauschalpreis, der nur die Gesamtsumme ersetzt (siehe
-- CLAUDE.md-Absatz zum Modul). Gleiche Spaltenform wie
-- pauschalpreis_aktiv/pauschalpreis_cent aus 0008_angebotswesen.sql.
ALTER TABLE angebote ADD COLUMN materialpauschale_aktiv INTEGER NOT NULL DEFAULT 0;
ALTER TABLE angebote ADD COLUMN materialpauschale_cent INTEGER;
