-- Offene Ideen gehören jetzt zu einem Jahr, wie die KatS-A-Plan-Themen: ein neues
-- Jahr beginnt mit einer eigenen, leeren Ideensammlung. Die Ideen liegen als
-- geprüftes JSON-Array von Terminen ohne Datum in der Jahreszeile und werden mit
-- dem Jahr versioniert und gespeichert.
ALTER TABLE kalender_jahre ADD COLUMN ideen TEXT NOT NULL DEFAULT '[]';

-- Die bisherige jahresübergreifende Sammlung geht an das jüngste vorhandene Jahr –
-- das Jahr, in dem sie zuletzt gepflegt wurde. Ältere Jahre starten leer.
UPDATE kalender_jahre
SET ideen = COALESCE((SELECT termine FROM kalender_ideen WHERE id = 'offene-ideen'), '[]')
WHERE jahr = (SELECT MAX(jahr) FROM kalender_jahre);

-- `kalender_ideen` bleibt als ungenutzte Altlast bestehen (Rückfallebene); der Worker
-- liest und schreibt sie nicht mehr.
