-- Hinterlegte Unterschrift je Person (siehe docs/konzept-vorgaenge.md, Abschnitt 5).
--
-- Eine Zeile je Person, ohne Version: sie gehört ausschließlich der Person selbst (der Worker
-- liest und schreibt nur die Zeile der geprüften Identität), ein Rennen gibt es nicht.
-- `daten` ist vom Worker streng geprüftes JSON: entweder `{ art: 'schrift', text, font }` oder
-- `{ art: 'zeichnung', striche: [[[x, y], …], …] }` (siehe `worker/src/unterschrift-pruefung.ts`).
-- Unterschriebene Dokumente tragen eine eigene Momentaufnahme, diese Tabelle ändert sie nie.
CREATE TABLE benutzer_unterschriften (
  email TEXT PRIMARY KEY,
  art TEXT NOT NULL CHECK (art IN ('schrift', 'zeichnung')),
  daten TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
);
