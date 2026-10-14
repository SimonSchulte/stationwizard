-- Antrag auf Verleihung einer Auszeichnung (Seite „Offene Ehrungen“).
--
-- 1. Begründung und Zeitpunkt des zuletzt erstellten Antrags je Person und Auszeichnung. Beides
--    gehört zum Bearbeitungsstand aus 0017 und liegt deshalb in derselben Zeile. `begruendung` ist
--    Freitext für das gleichnamige Feld des Formulars; `antrag_erstellt_am` setzt ausschließlich
--    der Worker beim Herunterladen eines Antrags, nie der Anfragekörper. Ein erstellter Antrag
--    setzt zugleich `beantragt`, damit der Filter „Beantragt“ der Seite weiter gilt.
ALTER TABLE ehrungen_vorgaenge ADD COLUMN begruendung TEXT;
ALTER TABLE ehrungen_vorgaenge ADD COLUMN antrag_erstellt_am TEXT;

-- 2. PDF-Formularvorlage des Antrags, gleiches Muster wie `fuehrerschein_vorlage` (0012): genau
--    eine Zeile mit fester id 'ehrungsantrag'. Der Worker verwahrt die Datei nur, gefüllt wird sie
--    im Browser.
CREATE TABLE ehrungsantrag_vorlage (
  id TEXT PRIMARY KEY,
  dateiname TEXT NOT NULL,
  inhalt BLOB NOT NULL,
  version INTEGER NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

-- 3. Organisationsstammdaten (Systemkonfiguration, `worker/src/systemkonfiguration.ts`) mit dem
--    vom Betreiber genannten Startbestand. Danach nur noch über die Oberfläche (Zugführung).
INSERT OR IGNORE INTO systemkonfiguration (schluessel, wert, geaendert_am, geaendert_von)
VALUES
  ('organisation_landesverband', 'Nordrhein-Westfalen', '2026-10-13T00:00:00.000Z', 'migration'),
  ('organisation_regionalverband', 'Ostwestfalen', '2026-10-13T00:00:00.000Z', 'migration');
