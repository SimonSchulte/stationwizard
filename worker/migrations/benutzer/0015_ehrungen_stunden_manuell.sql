-- Manuell nachgetragene Stunden und Änderungsprotokoll der Stundenzahlen (worker/src/ehrungen.ts).
--
-- `stunden` bleibt die Zahl aus dem Stundenimport; `stunden_manuell` ist ein Nachtrag von Hand.
-- Für alle Berechnungen gilt die größere der beiden Zahlen (`max(stunden, stunden_manuell)`), die
-- Anwendung rechnet das aus – gespeichert wird nur, was tatsächlich eingegeben oder importiert wurde.
ALTER TABLE ehrungen_personen ADD COLUMN stunden_manuell REAL;

-- Jede Änderung einer Stundenzahl (Import oder manueller Nachtrag) – nur der Worker schreibt hier,
-- nie der Anfragekörper: Zeitpunkt und Benutzer stammen aus der geprüften Anmeldung. Name und
-- Person werden festgehalten, damit das Protokoll auch nach dem Entfernen der Person lesbar bleibt.
-- `feld` ist `stunden-import` oder `stunden-manuell`; `alt` ist bei der Erstanlage beziehungsweise dem
-- ersten Nachtrag NULL.
CREATE TABLE ehrungen_aenderungen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  nachname TEXT NOT NULL,
  vorname TEXT NOT NULL,
  zeitpunkt TEXT NOT NULL,
  benutzer TEXT NOT NULL,
  feld TEXT NOT NULL,
  alt REAL,
  neu REAL
);
CREATE INDEX ehrungen_aenderungen_person ON ehrungen_aenderungen (person_id, id);
