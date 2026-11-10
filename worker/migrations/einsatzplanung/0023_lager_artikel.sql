-- Stammdaten der Packeinheiten, Stufe 1 (Konzept: docs/konzept-packeinheiten.md):
-- Lager (feste Liste mit Reihenfolge für den Laufweg) und der Artikelkatalog mit Heimatlager.
-- Je Zeile eine eigene `version`. `name_vergleich` setzt ausschließlich der Worker (Groß-/Kleinschreibung
-- und überzählige Leerzeichen ignoriert) und ist eindeutig: dieselbe Vergleichsform steht in
-- `worker/src/einsatzplanung-stammdaten.ts` und `src/app/einsatz/services/lager.ts` – gemeinsam ändern.

CREATE TABLE lager (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_vergleich TEXT NOT NULL,
  reihenfolge INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

CREATE UNIQUE INDEX lager_name_vergleich ON lager (name_vergleich);

CREATE TABLE artikel (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_vergleich TEXT NOT NULL,
  einheit TEXT NOT NULL,
  -- Heimatlager; leer, solange noch keines gewählt ist. Ein Lager mit Artikeln lässt sich nicht löschen.
  lager_id TEXT REFERENCES lager (id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

CREATE UNIQUE INDEX artikel_name_vergleich ON artikel (name_vergleich);
CREATE INDEX artikel_lager ON artikel (lager_id);
