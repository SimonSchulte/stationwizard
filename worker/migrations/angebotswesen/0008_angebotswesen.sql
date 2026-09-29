-- Angebotswesen (AP-A1): Preiskatalog und Angebote in einer eigenen
-- D1-Datenbank (ANGEBOTSWESEN_DB), getrennt von FAHRZEUGE_DB/BENUTZER_DB
-- (eigene Fachdomäne, eigene Datenbank, analog zur Benutzerverwaltung).
-- `version` ist wie im Fahrzeugmodul ein reiner Zähler für die
-- optimistische Sperre über If-Match/If-None-Match, keine fachliche
-- Information.

CREATE TABLE preiskatalog_eintraege (
  id TEXT PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  art TEXT NOT NULL, -- 'einsatzkraft' | 'fahrzeug'
  einzelpreis_cent INTEGER NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- Anfänglicher Preiskatalog (fachlich vorgegebene Startwerte aus der
-- Anfrage). Frei änderbar/löschbar/erweiterbar über die Oberfläche – kein
-- fester Vertrag wie bei TAKTISCH_ORDER/MEDIZINISCH_ORDER.
INSERT INTO preiskatalog_eintraege
  (id, bezeichnung, art, einzelpreis_cent, geaendert_am, geaendert_von, version)
VALUES
  ('7a8e6f0e-1a1a-4a8a-8a0a-000000000001', 'Sanitätshelfer', 'einsatzkraft', 1200, '2026-01-01T00:00:00.000Z', 'system', 1),
  ('7a8e6f0e-1a1a-4a8a-8a0a-000000000002', 'RH/RS', 'einsatzkraft', 2500, '2026-01-01T00:00:00.000Z', 'system', 1),
  ('7a8e6f0e-1a1a-4a8a-8a0a-000000000003', 'RS/NFS/Einsatzleiter', 'einsatzkraft', 3500, '2026-01-01T00:00:00.000Z', 'system', 1),
  ('7a8e6f0e-1a1a-4a8a-8a0a-000000000004', 'Notarzt', 'einsatzkraft', 5000, '2026-01-01T00:00:00.000Z', 'system', 1),
  ('7a8e6f0e-1a1a-4a8a-8a0a-000000000005', 'KTW/RTW', 'fahrzeug', 5000, '2026-01-01T00:00:00.000Z', 'system', 1),
  ('7a8e6f0e-1a1a-4a8a-8a0a-000000000006', 'MTW', 'fahrzeug', 3000, '2026-01-01T00:00:00.000Z', 'system', 1),
  ('7a8e6f0e-1a1a-4a8a-8a0a-000000000007', 'GW-San', 'fahrzeug', 5000, '2026-01-01T00:00:00.000Z', 'system', 1);

-- Angebote: Schichten inkl. verschachtelter Positionen liegen als
-- JSON-Array in einer Spalte, analog zu `wartungstermine` in
-- `worker/migrations/0001_fahrzeuge.sql` – ein Angebot wird immer als eine
-- Einheit geladen und gespeichert (der Editor schreibt stets das ganze
-- Angebot neu). Normalisierte Kindtabellen brächten hier nur zusätzliche
-- Joins und eine zweite Versionsverwaltung ohne fachlichen Nutzen.
CREATE TABLE angebote (
  id TEXT PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  auftraggeber TEXT NOT NULL,
  bemerkung TEXT NOT NULL,
  schichten TEXT NOT NULL, -- JSON-Array von Schicht-Objekten inkl. positionen[]
  pauschalpreis_aktiv INTEGER NOT NULL DEFAULT 0,
  pauschalpreis_cent INTEGER,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_angebote_bezeichnung ON angebote (bezeichnung);
