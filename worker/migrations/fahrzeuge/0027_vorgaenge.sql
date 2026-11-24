-- Vorgänge und Schadens- und Verlustmeldung (siehe docs/konzept-vorgaenge.md, Abschnitt 5).
--
-- Dokumentartig wie `angebote`/`materialchecks`: ein Vorgang je Zeile, die Meldung als eigene Zeile
-- mit streng geprüftem JSON, jeweils mit eigener `version` (optimistische Sperre, `If-Match`).
-- Der Vorgang hängt an genau einem Fahrzeug (Fremdschlüssel), deshalb liegt er in dieser
-- Datenbank und nicht in einer eigenen.

CREATE TABLE vorgaenge (
  id TEXT PRIMARY KEY,
  -- Bisher genau eine feste Art; weitere kommen später und erweitern diese Bedingung.
  art TEXT NOT NULL CHECK (art IN ('fahrzeug-material-defekt')),
  fahrzeug_id TEXT NOT NULL REFERENCES fahrzeuge (id),
  titel TEXT NOT NULL,
  -- -1 = Meldung noch nicht vollständig; 0 bis 5 = Stufen laut `VORGANG_STUFEN` im Worker.
  stufe INTEGER NOT NULL DEFAULT -1 CHECK (stufe BETWEEN -1 AND 5),
  geplant_am TEXT,
  abgeschlossen_am TEXT,
  angelegt_am TEXT NOT NULL,
  angelegt_von TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_vorgaenge_fahrzeug ON vorgaenge (fahrzeug_id);

CREATE TABLE schadensmeldungen (
  id TEXT PRIMARY KEY,
  vorgang_id TEXT NOT NULL UNIQUE REFERENCES vorgaenge (id) ON DELETE CASCADE,
  -- Streng geprüftes JSON der Formularfelder (`pruefeSchadensmeldung()`).
  inhalt TEXT NOT NULL,
  -- Kennzahl, nur vom Worker gesetzt: alle Pflichtangaben ausgefüllt.
  vollstaendig INTEGER NOT NULL DEFAULT 0,
  -- Gesetzt mit der ersten Unterschrift: der Inhalt lässt sich dann nicht mehr ändern.
  gesperrt INTEGER NOT NULL DEFAULT 0,
  -- Versand per Mail (Einreichen); nur der Worker setzt diese Felder.
  versendet_am TEXT,
  versendet_von TEXT,
  versendet_an TEXT,
  pdf_schluessel TEXT,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE meldung_unterschriften (
  meldung_id TEXT NOT NULL REFERENCES schadensmeldungen (id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('fest', 'leitung', 'verantw')),
  status TEXT NOT NULL CHECK (status IN ('angefragt', 'unterschrieben')),
  an_email TEXT,
  angefragt_von TEXT,
  angefragt_am TEXT,
  name TEXT,
  unterschrieben_am TEXT,
  -- Unveränderliche Momentaufnahme der Unterschrift der unterzeichnenden Person.
  signatur TEXT,
  PRIMARY KEY (meldung_id, slot)
);

-- „Aufgaben für mich“: offene Anfragen an eine Person.
CREATE INDEX idx_meldung_unterschriften_an ON meldung_unterschriften (an_email, status);

CREATE TABLE vorgang_angebote (
  id TEXT PRIMARY KEY,
  vorgang_id TEXT NOT NULL REFERENCES vorgaenge (id) ON DELETE CASCADE,
  dateiname TEXT NOT NULL,
  groesse INTEGER NOT NULL,
  r2_schluessel TEXT NOT NULL,
  quelle TEXT NOT NULL CHECK (quelle IN ('upload', 'email')),
  -- Bei `email` die Notiz zur ursprünglichen Mail; die Rohmail selbst wird nach der Zuordnung gelöscht.
  mail_betreff TEXT,
  mail_absender TEXT,
  mail_datum TEXT,
  mail_text TEXT,
  hochgeladen_am TEXT NOT NULL,
  hochgeladen_von TEXT NOT NULL
);

CREATE INDEX idx_vorgang_angebote_vorgang ON vorgang_angebote (vorgang_id);

CREATE TABLE vorgang_ereignisse (
  id TEXT PRIMARY KEY,
  vorgang_id TEXT NOT NULL REFERENCES vorgaenge (id) ON DELETE CASCADE,
  zeitpunkt TEXT NOT NULL,
  von TEXT NOT NULL,
  beschreibung TEXT NOT NULL
);

CREATE INDEX idx_vorgang_ereignisse_vorgang_zeit ON vorgang_ereignisse (vorgang_id, zeitpunkt);
