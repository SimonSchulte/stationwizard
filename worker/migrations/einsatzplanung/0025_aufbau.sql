-- Aufbau, Stufe 3 der Packeinheiten (Konzept: docs/konzept-packeinheiten.md): die Packliste eines Einsatzes
-- (Fahrzeuge, Wagen, Kisten, lose Artikel) und Aufbau-Vorlagen. Muster wie `vorbereitungen`/`vb_vorlagen`:
-- eine Zeile je Einsatz beziehungsweise Vorlage, Inhalt als vom Worker streng geprüftes JSON, eigene
-- `version`. Die Kennzahlspalten setzt ausschließlich der Worker. Verweise im Inhalt (artikelId, lagerId)
-- sind keine Fremdschlüssel; der Worker prüft sie beim Schreiben und sperrt das Löschen eines Artikels
-- oder Lagers, solange ein Aufbau darauf verweist. Eine Kiste im Aufbau ist eine Momentaufnahme.

CREATE TABLE aufbauten (
  einsatz_id TEXT PRIMARY KEY REFERENCES einsaetze (id) ON DELETE CASCADE,
  vorlage_id TEXT, -- nur zur Nachverfolgung, kein Fremdschlüssel
  vorlage_version INTEGER,
  inhalt TEXT NOT NULL, -- JSON: { anweisungen, einheiten[] }
  einheiten INTEGER NOT NULL,
  kisten INTEGER NOT NULL,
  positionen INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

CREATE TABLE aufbau_vorlagen (
  id TEXT PRIMARY KEY,
  titel TEXT NOT NULL,
  inhalt TEXT NOT NULL,
  einheiten INTEGER NOT NULL,
  kisten INTEGER NOT NULL,
  positionen INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);
