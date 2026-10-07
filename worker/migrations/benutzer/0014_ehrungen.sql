-- Ehrungen im Personalmodul (worker/src/ehrungen.ts).
--
-- Eine Zeile je Person mit eigener `version` (If-Match, wie bei den übrigen
-- eigenen D1-Modulen). Liegt in BENUTZER_DB, weil es app-weite, selten
-- geänderte Personaldaten sind und kein eigenes Binding rechtfertigt.
--
-- `schluessel` ist die Vergleichsform aus Nachname und Vorname (Kleinschreibung,
-- Leerraum zusammengezogen) und trägt den Abgleich beim Stundenimport: wer
-- schon vorhanden ist, wird aktualisiert, nie doppelt angelegt. Die
-- Vergleichsform steht in worker/src/ehrungen.ts und in
-- src/app/personal/services/ehrungen-regeln.ts; beide gemeinsam ändern.
--
-- `erhalten` ist ein JSON-Array fester Schlüssel (Leistungsabzeichen,
-- Jubiläumszeichen, Ehrenzeichen), die der Worker gegen eine feste Liste prüft.
-- Was fällig ist, wird nirgends gespeichert, sondern aus `stunden`,
-- `eintrittsdatum` und `besondere_verdienste` berechnet.
CREATE TABLE ehrungen_personen (
  id TEXT PRIMARY KEY,
  nachname TEXT NOT NULL,
  vorname TEXT NOT NULL,
  schluessel TEXT NOT NULL UNIQUE,
  stunden REAL NOT NULL DEFAULT 0,
  eintrittsdatum TEXT,
  besondere_verdienste INTEGER NOT NULL DEFAULT 0,
  erhalten TEXT NOT NULL DEFAULT '[]',
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  version INTEGER NOT NULL
);
