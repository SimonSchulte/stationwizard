-- Gruppenzugehörigkeit je Fahrzeug, entsprechend den bekannten
-- Gruppenführungen Betreuung, TeSi, Führung und Sanität (siehe
-- `benutzerverwaltung/models/benutzerkonto.model.ts`, `Hauptrolle`; ohne
-- Verpflegung, da dafür fachlich keine Fahrzeuge vorgesehen sind).
--
-- `DEFAULT 'fuehrung'` gilt nur für bestehende Zeilen dieser Migration; der
-- Worker schreibt den Vorgabewert für neue Fahrzeuge ebenfalls explizit
-- (`GRUPPE_STANDARD` in `src/app/fahrzeuge/models/fahrzeug.model.ts`).
ALTER TABLE fahrzeuge ADD COLUMN gruppe TEXT NOT NULL DEFAULT 'fuehrung';
