-- Benutzerverwaltung (AP-B1). Cloudflare Access entscheidet weiterhin allein,
-- wer sich überhaupt anmelden darf (feste Zugriffsliste in Zero Trust) - diese
-- Tabelle ist keine Nutzerverwaltung im Sinne von Anlegen/Löschen von
-- Zugängen und kein Zugriffsschutz. Sie hält nur, wer sich bereits
-- mindestens einmal geprüft angemeldet hat, und ordnet dieser Person optional
-- eine Rolle zu (siehe worker/src/benutzer.ts).
--
-- `rolle` ist die fachliche Hauptrolle, höchstens eine, oder NULL ohne
-- Zuordnung. `sonderrollen` ist ein JSON-Array unabhängiger Zusatzrollen
-- (aktuell nur "verwaltungshelfer"), analog zu `wartungstermine` in
-- `fahrzeuge` - bewusst als Array, damit künftige weitere Sonderrollen ohne
-- Schemaänderung dazukommen.
--
-- Rollenvergabe ist vorerst jeder geprüften Identität möglich, weil noch
-- keine Rolle selbst eine Berechtigung dafür prüfen kann (kein Henne-Ei-
-- Startproblem lösbar ohne diesen Schritt) - siehe auch die bestehende
-- Entscheidung "Rechte vorerst alle, Rollen später" im Fahrzeugmodul
-- (docs/konzept-fahrzeuge.md, Abschnitt 8).
CREATE TABLE benutzer (
  email TEXT PRIMARY KEY,
  rolle TEXT,
  sonderrollen TEXT NOT NULL DEFAULT '[]',
  erster_zugriff_am TEXT NOT NULL,
  letzter_zugriff_am TEXT NOT NULL,
  rolle_geaendert_am TEXT,
  rolle_geaendert_von TEXT
);
