-- Jedes Kennzeichen darf es nur einmal geben (siehe docs/konzept-fahrzeuge.md,
-- Abschnitt „Verwaltungsbereich und Stammdatenimport"). Bis hierher galt die
-- Regel nur im Import; damit blieb sie über die manuelle Anlage und bei
-- gleichzeitigen Sitzungen umgehbar. Der eindeutige Index macht sie zur Zusage
-- der Datenbank.
--
-- Verglichen wird eine Vergleichsform statt des Rohwerts: Großschreibung ohne
-- Leerzeichen, Bindestriche und Punkte, damit „ME-XX 123", „me xx123" und
-- „ME.XX.123" als dasselbe Kennzeichen gelten. Gespeichert und angezeigt wird
-- weiterhin die eingegebene Schreibweise. Dieselbe Vergleichsform verwendet der
-- Worker in `kennzeichenVergeben()` (`worker/src/fahrzeuge.ts`); wird sie hier
-- geändert, muss sie dort mitgeändert werden.
--
-- Der Index ist bewusst partiell: ein leeres Kennzeichen ist weiterhin erlaubt
-- und mehrfach möglich, weil `kennzeichen` im Datenmodell leer sein darf.
--
-- Vor dem Anwenden prüfen, ob der Bestand bereits Doubletten enthält – sonst
-- scheitert diese Migration:
--
--   SELECT upper(replace(replace(replace(kennzeichen, ' ', ''), '-', ''), '.', ''))
--            AS vergleichsform,
--          count(*) AS anzahl,
--          group_concat(id) AS ids
--     FROM fahrzeuge
--    WHERE upper(replace(replace(replace(kennzeichen, ' ', ''), '-', ''), '.', '')) <> ''
--    GROUP BY vergleichsform
--   HAVING anzahl > 1;
--
-- Liefert die Abfrage Zeilen, zuerst fachlich klären, welcher Datensatz bleibt.

CREATE UNIQUE INDEX idx_fahrzeuge_kennzeichen_eindeutig
  ON fahrzeuge (upper(replace(replace(replace(kennzeichen, ' ', ''), '-', ''), '.', '')))
  WHERE upper(replace(replace(replace(kennzeichen, ' ', ''), '-', ''), '.', '')) <> '';
