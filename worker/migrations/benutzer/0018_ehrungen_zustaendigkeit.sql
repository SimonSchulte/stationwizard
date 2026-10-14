-- Zuständiger Ortsverband je Person (worker/src/ehrungen.ts, Seite „Offene Ehrungen“).
--
-- Eine Zeile je Person, nicht je Auszeichnung: der Ortsverband gehört zur Person und gilt für
-- alle ihre offenen Ehrungen. `ov` ist einer der festen Schlüssel aus `OV_SCHLUESSEL`
-- (aktuell `bielefeld`, `werther`); „keine Auswahl“ ist keine Zeile. Wie `ehrungen_vorgaenge`
-- ohne Version (idempotenter Einzelwert) und ohne Fremdschlüssel – der Worker räumt beim
-- Entfernen einer Person auf.
CREATE TABLE ehrungen_zustaendigkeit (
  person_id TEXT NOT NULL PRIMARY KEY,
  ov TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);
