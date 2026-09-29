-- Systemkonfiguration (AP-S1). Betriebseinstellungen, die zur Laufzeit in der
-- Oberfläche gesetzt werden und deshalb weder in eine Laufzeitvariable noch in
-- ein Secret gehören: aktuell nur der Empfänger des Kilometerstandsberichts.
--
-- Bewusst ein Schlüssel-Wert-Speicher statt fester Spalten: welche Schlüssel
-- überhaupt existieren und welche Werte erlaubt sind, entscheidet allein die
-- feste Liste in `worker/src/systemkonfiguration.ts` (`EINSTELLUNGEN`). Ein
-- unbekannter Schlüssel wird abgelehnt, nicht gespeichert - die Tabelle ist
-- also kein frei beschreibbarer Ablageort, sondern nur die Persistenz zu
-- diesem geprüften Vertrag. Weitere Einstellungen brauchen damit eine
-- Codeänderung, aber keine Migration.
--
-- Hier stehen keine Zugangsdaten. Absenderadresse und API-Token des
-- Mailversands bleiben Secrets am Worker (siehe CLAUDE.md, "Worker und
-- Zugangsschutz"), weil sie sonst über die API auslesbar wären.
--
-- Ändern ist vorerst jeder geprüften Identität möglich - dieselbe
-- Übergangslösung wie bei der Rollenvergabe und beim Löschen einer Ablesung
-- ("Rechte vorerst alle, Rollen später", docs/konzept-fahrzeuge.md,
-- Abschnitt 8).
CREATE TABLE systemkonfiguration (
  schluessel TEXT PRIMARY KEY,
  wert TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);
