-- Plätze je Lager (z. B. „Regal“, „Spinde“): feste, in der Oberfläche gepflegte Liste je Lager.
-- `lager.plaetze` ist ein vom Worker streng geprüftes JSON-Array [{ "id", "name" }] (Name je Lager eindeutig
-- in der Vergleichsform, höchstens 40 Plätze). Artikel und Kisten verweisen optional mit `platz_id` auf einen
-- Platz ihres Heimatlagers; das ist bewusst kein Fremdschlüssel (der Platz steckt im JSON), der Worker prüft
-- beim Schreiben und sperrt das Entfernen eines Platzes, solange etwas darauf verweist. Im Aufbau steht
-- `platzId` im Inhalts-JSON neben `lagerId`.
ALTER TABLE lager ADD COLUMN plaetze TEXT NOT NULL DEFAULT '[]';
ALTER TABLE artikel ADD COLUMN platz_id TEXT;
ALTER TABLE kisten ADD COLUMN platz_id TEXT;
