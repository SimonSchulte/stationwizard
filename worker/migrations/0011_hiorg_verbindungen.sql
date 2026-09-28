-- HiOrg-Server-API (OAuth2 Authorization Code), siehe worker/src/hiorg-api.ts.
--
-- Je geprüfter Access-Identität höchstens eine Verbindung zu genau dem
-- HiOrg-Konto, mit dem diese Person sich bei HiOrg angemeldet hat. Zugriffs-
-- und Refresh-Token stehen nie im Klartext hier: `token_daten` ist ein
-- AES-GCM-Chiffrat (`v1.<iv>.<chiffrat>`), dessen Schlüssel der Worker aus dem
-- Secret HIORG_SERVER_CLIENTSECRET ableitet und das an die E-Mail gebunden ist.
-- Ein neues Client-Secret macht alle Einträge unlesbar; sie werden dann beim
-- nächsten Abruf verworfen und neu hergestellt.
--
-- Liegt in BENUTZER_DB, weil der Schlüssel dieselbe geprüfte E-Mail ist wie in
-- `benutzer`; eine eigene Datenbank für eine Tabelle wäre kein Gewinn.
-- Geschrieben wird nur beim Verbinden, beim Erneuern eines abgelaufenen Tokens
-- und beim Trennen – nicht bei jedem Abruf.
CREATE TABLE hiorg_verbindungen (
  email TEXT PRIMARY KEY,
  token_daten TEXT NOT NULL,
  verbunden_am TEXT NOT NULL,
  aktualisiert_am TEXT NOT NULL
);
