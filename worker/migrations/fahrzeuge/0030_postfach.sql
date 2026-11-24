-- Postfach für Angebote (siehe docs/konzept-vorgaenge.md, Abschnitt 7).
--
-- Mails kommen über Cloudflare Email Routing (Catch-all der Hauptdomain) an den `email()`-Handler des
-- Workers. Er legt nur die Rohmail in R2 und eine Zeile hier an; geparst wird im Browser. Nach der
-- Zuordnung zu einem Vorgang oder dem Verwerfen wird die Rohmail gelöscht (R2) und die Zeile
-- geleert, sie bleibt nur als Nachweis gegen eine Doppelzustellung (`message_id`) stehen.
CREATE TABLE postfach_mails (
  id TEXT PRIMARY KEY,
  -- Kopfzeile Message-ID; eindeutig, damit eine doppelt zugestellte Mail nur einmal erscheint.
  message_id TEXT NOT NULL UNIQUE,
  empfangen_am TEXT NOT NULL,
  absender TEXT NOT NULL,
  betreff TEXT NOT NULL,
  -- Adresse, an die die Mail ging (nur der lokale Teil vor dem @ ist fachlich von Bedeutung).
  empfaenger TEXT NOT NULL,
  -- Aus dem lokalen Teil abgeleitet; leer für das Sammelpostfach `angebote@`.
  fahrzeug_id TEXT REFERENCES fahrzeuge (id) ON DELETE SET NULL,
  groesse INTEGER NOT NULL,
  r2_schluessel TEXT,
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'zugeordnet', 'verworfen')),
  vorgang_id TEXT,
  bearbeitet_am TEXT,
  bearbeitet_von TEXT
);

CREATE INDEX idx_postfach_mails_status ON postfach_mails (status, empfangen_am);

-- Adresse je Fahrzeug: der Teil vor dem @ (zum Beispiel `gw-san`). Der Worker legt fehlende Kürzel
-- aus der Bezeichnung an und hält sie eindeutig; die Zugführung kann sie ändern.
CREATE TABLE postfach_adressen (
  kuerzel TEXT PRIMARY KEY,
  fahrzeug_id TEXT NOT NULL UNIQUE REFERENCES fahrzeuge (id) ON DELETE CASCADE,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);
