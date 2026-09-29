-- Word-Vorlage der Führerscheinliste (worker/src/fuehrerschein-vorlage.ts).
--
-- Genau eine Zeile mit fester id 'fuehrerscheinliste': die Vorlage ist ein
-- Singleton, kein Bestand wie bei den Prüfvorlagen oder Fahrzeugen. `version`
-- trägt dieselbe optimistische Sperre (If-Match/If-None-Match) wie die
-- übrigen eigenen D1-Module, siehe worker/src/etag.ts. Liegt in BENUTZER_DB,
-- weil es dieselbe Art app-weiter, seltener geänderter Konfiguration ist wie
-- systemkonfiguration und hiorg_verbindungen – keine eigene Datenbank für
-- eine einzelne Zeile.
CREATE TABLE fuehrerschein_vorlage (
  id TEXT PRIMARY KEY,
  dateiname TEXT NOT NULL,
  inhalt BLOB NOT NULL,
  version INTEGER NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);
