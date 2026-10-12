-- Bearbeitungsstand offener Ehrungen (worker/src/ehrungen.ts, Seite „Offene Ehrungen“).
--
-- Je Person und Auszeichnung zwei unabhängige Haken: „Abgestimmt OB“ (mit dem Ortsbeauftragten
-- abgestimmt) und „Beantragt“. Gespeichert wird nur, was Menschen abhaken; ob eine Ehrung offen
-- ist, wird weiterhin im Client berechnet. Eine Zeile entsteht beim ersten Haken, `auszeichnung`
-- ist einer der festen Schlüssel aus `EHRUNG_SCHLUESSEL`.
--
-- Keine Version: die Haken sind unabhängige, idempotente Werte, und jede Anfrage setzt nur das
-- genannte Feld; zwei Personen, die verschiedene Haken setzen, überschreiben einander nicht.
-- Kein Fremdschlüssel (wie `ehrungen_aenderungen`); der Worker räumt beim Entfernen einer Person auf.
CREATE TABLE ehrungen_vorgaenge (
  person_id TEXT NOT NULL,
  auszeichnung TEXT NOT NULL,
  abgestimmt_ob INTEGER NOT NULL DEFAULT 0,
  beantragt INTEGER NOT NULL DEFAULT 0,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  PRIMARY KEY (person_id, auszeichnung)
);
