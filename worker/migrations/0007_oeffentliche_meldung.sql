-- Öffentliche Kilometermeldung per QR-Code (siehe docs/konzept-fahrzeuge.md,
-- Abschnitt 10). Zwei Änderungen in einem Vorgang: ein unerratbares Token je
-- Fahrzeug als Ziel des öffentlichen Codes, und eine eigene Tabelle für noch
-- nicht freigegebene Meldungen.

-- (1) Erfassungstoken. 16 Zufallsbytes als Kleinbuchstaben-Hex, also 32 Zeichen
-- und 128 Bit. Das Token ist das einzige Zugangsmerkmal des öffentlichen
-- Pfades `/e/<token>` und damit ein Geheimnis: es steht bewusst NICHT in der
-- Antwort von `GET /api/fahrzeuge` (siehe `zuFahrzeugJson()` in
-- `worker/src/fahrzeuge.ts`), sondern nur hinter den eigenen
-- Erfassungslink-Endpunkten.
--
-- Der Bestand bekommt sein Token hier und nicht beiläufig beim ersten Lesen:
-- so ist die Erzeugung ein nachvollziehbarer, einmaliger Vorgang, und jedes
-- vorhandene Fahrzeug ist sofort bedruckbar.
ALTER TABLE fahrzeuge ADD COLUMN erfassung_token TEXT;
ALTER TABLE fahrzeuge ADD COLUMN erfassung_token_am TEXT;

UPDATE fahrzeuge
   SET erfassung_token = lower(hex(randomblob(16))),
       erfassung_token_am = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE erfassung_token IS NULL;

-- Partiell wie der Kennzeichenindex aus 0003: ein Fahrzeug ohne Token bleibt
-- möglich (etwa nach einem künftigen Zurückziehen), dasselbe Token zweimal
-- nicht. Die Eindeutigkeit ist die Grundlage dafür, dass das Token allein das
-- Fahrzeug bestimmt und der öffentliche Pfad ohne UUID auskommt.
CREATE UNIQUE INDEX idx_fahrzeuge_erfassung_token
  ON fahrzeuge (erfassung_token)
  WHERE erfassung_token IS NOT NULL;

-- (2) Einreichungen. Bewusst KEINE Vermischung mit `ablesungen`: dort steht
-- ausschließlich, was als echter Kilometerstand gilt. Jede Kennzahl
-- (Jahresbilanz, Ablese-Lücke, Kilometerstandsbericht) liest `ablesungen` – eine
-- offene Meldung darf dort nicht auftauchen, auch nicht mit einem Statusfeld,
-- das eine Abfrage versehentlich übersehen könnte.
--
-- `eingereicht_von_name` ist eine ungeprüfte Selbstauskunft und deshalb
-- ausdrücklich nicht `erfasst_von`-tauglich. `entschieden_von` ist die geprüfte
-- Access-E-Mail der freigebenden Person.
CREATE TABLE ablesung_einreichungen (
  id TEXT PRIMARY KEY,
  fahrzeug_id TEXT NOT NULL REFERENCES fahrzeuge (id),
  abgelesen_am TEXT NOT NULL,
  stand INTEGER NOT NULL,
  eingereicht_am TEXT NOT NULL,
  eingereicht_von_name TEXT NOT NULL,
  bemerkung TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen',
  entschieden_am TEXT,
  entschieden_von TEXT,
  ablehnungsgrund TEXT,
  ablesung_id TEXT REFERENCES ablesungen (id)
);

CREATE INDEX idx_einreichungen_offen ON ablesung_einreichungen (status, eingereicht_am);
CREATE INDEX idx_einreichungen_fahrzeug ON ablesung_einreichungen (fahrzeug_id, eingereicht_am);

-- (3) Der gemeldete Name überlebt die Freigabe, ohne `erfasst_von` zu
-- verwässern: dort steht weiterhin immer eine geprüfte Access-Identität, nach
-- einer Freigabe die der freigebenden Person. Der Freitextname steht daneben,
-- nie darin. NULL bei allen anderen Erfassungswegen.
ALTER TABLE ablesungen ADD COLUMN gemeldet_von_name TEXT;
