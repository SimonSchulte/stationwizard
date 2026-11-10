-- Kisten, Stufe 2 der Packeinheiten (Konzept: docs/konzept-packeinheiten.md): Stammdaten mit Name,
-- Heimatlager und Inhalt aus Artikeln. Der Inhalt liegt als vom Worker streng geprüftes JSON in einer
-- Zeile je Kiste (`[{ "artikelId", "menge", "bemerkung" }]`), die Kennzahl `positionen` setzt nur der
-- Worker. `name_vergleich` wie bei Lager und Artikel (Vergleichsform nur vom Worker gesetzt).

CREATE TABLE kisten (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_vergleich TEXT NOT NULL,
  -- Heimatlager; leer möglich. Ein Lager mit Kisten lässt sich nicht löschen.
  lager_id TEXT REFERENCES lager (id) ON DELETE RESTRICT,
  inhalt TEXT NOT NULL,
  positionen INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

CREATE UNIQUE INDEX kisten_name_vergleich ON kisten (name_vergleich);
CREATE INDEX kisten_lager ON kisten (lager_id);
