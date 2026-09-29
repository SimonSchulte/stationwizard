-- Kalender (früher Ausbildungsplanung) in einer eigenen D1-Datenbank
-- (KALENDER_DB). Löst die Excel-Arbeitsmappe in der NextCloud-Freigabe ab;
-- deren Inhalt wird einmalig über POST /api/kalender/migration übernommen.
--
-- Dokumentartig wie `angebote`: eine Zeile je Jahresblatt mit Terminen und
-- KatS-A-Plan-Themen als geprüftem JSON, dazu genau eine Zeile für die
-- jahresübergreifenden "Offenen Ideen". `version` ist ein reiner Zähler für
-- die optimistische Sperre über If-Match/If-None-Match.

CREATE TABLE kalender_jahre (
  jahr INTEGER PRIMARY KEY,
  titel TEXT NOT NULL,
  termine TEXT NOT NULL,     -- JSON-Array von Terminen mit Datum
  kats_themen TEXT NOT NULL, -- JSON-Array der KatS-A-Plan-Themen dieses Jahres
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE kalender_ideen (
  id TEXT PRIMARY KEY CHECK (id = 'offene-ideen'),
  termine TEXT NOT NULL,     -- JSON-Array von Terminen ohne Datum
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
