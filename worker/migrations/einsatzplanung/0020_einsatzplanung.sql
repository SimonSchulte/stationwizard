-- Einsatzplanung mit Vorbereitung (VB, AP-E2): Einsätze, VB-Vorlagen und
-- Vorbereitungen in einer eigenen D1-Datenbank (EINSATZPLANUNG_DB), dokumentartig
-- wie `angebote` und `pruefvorlagen`: eine Zeile je Vorlage bzw. Vorbereitung,
-- Inhalt als vom Worker geprüftes JSON, eigene `version` für die optimistische
-- Sperre (If-Match/If-None-Match). Ein Speichern ist ein Schreibvorgang, nicht
-- einer je Position. Die Kennzahlspalten setzt ausschließlich der Worker, damit
-- Listen kein JSON parsen müssen. Konzept: docs/konzept-einsatzplanung-vb.md.

CREATE TABLE einsaetze (
  id TEXT PRIMARY KEY,
  titel TEXT NOT NULL,
  beginn TEXT, -- YYYY-MM-DDTHH:mm, lokale Berliner Zeit ohne Zone
  ende TEXT,
  ort TEXT,
  hiorg_veranstaltung_id TEXT,
  pep_id TEXT, -- UUID der PEP-Datei in Nextcloud
  version INTEGER NOT NULL DEFAULT 1,
  angelegt_am TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  angelegt_von TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

-- Eine HiOrg-Veranstaltung gehört höchstens zu einem Einsatz; Einsätze ohne HiOrg
-- (NULL) dürfen beliebig oft vorkommen. Verbindlich ist dieser Index, die
-- Vorabprüfung im Worker ist nur die freundliche Antwort davor.
CREATE UNIQUE INDEX idx_einsaetze_veranstaltung_eindeutig
  ON einsaetze (hiorg_veranstaltung_id)
  WHERE hiorg_veranstaltung_id IS NOT NULL;

CREATE INDEX idx_einsaetze_beginn ON einsaetze (beginn);

CREATE TABLE vb_vorlagen (
  id TEXT PRIMARY KEY,
  titel TEXT NOT NULL,
  inhalt TEXT NOT NULL, -- JSON: { anweisungen, abschnitte[] mit laufzettel[] und positionen[] }
  abschnitte INTEGER NOT NULL,
  laufzettel INTEGER NOT NULL,
  positionen INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

CREATE TABLE vorbereitungen (
  einsatz_id TEXT PRIMARY KEY REFERENCES einsaetze (id) ON DELETE CASCADE,
  vorlage_id TEXT, -- nur zur Nachverfolgung, kein Fremdschlüssel: eine Vorlage darf entfallen
  vorlage_version INTEGER,
  inhalt TEXT NOT NULL,
  laufzettel INTEGER NOT NULL,
  positionen INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL
);

-- Startvorlage „Weihnachtsmarkt Ummeln“ (feste Ids, Quelle: docs/vb-startvorlage-weihnachtsmarkt-ummeln.json).
-- 4 Abschnitte (je Transportziel), 14 Laufzettel (je Lagerort), 47 Positionen. Die Quelle enthält nur Material,
-- Lagerorte und Funktionsbezeichnungen, keine Personendaten.
INSERT INTO vb_vorlagen
  (id, titel, inhalt, abschnitte, laufzettel, positionen, version, geaendert_am, geaendert_von)
VALUES
  ('298cd81c-fe2e-4a86-b979-7045591856c3', 'Weihnachtsmarkt Ummeln', '{"anweisungen":"","abschnitte":[{"id":"b630a7fc-c602-4b26-a963-083287d111f8","herkunftId":null,"titel":"Rollwagen","farbe":"abschnitt-1","fachgruppe":null,"laufzettel":[{"id":"dfed961e-1023-460a-8137-6bdba69161e2","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Betreuungsanhänger / Technikanhänger / Material vom WM-Sennestadt","transportMit":"Rollwagen","auftraggeber":"GF Betreuung","fachgruppe":"betreuung","positionen":[{"id":"b1bb9acf-c634-4099-9ba5-0d8930a0642c","herkunftId":null,"anzahl":"2","material":"Propanflaschen"}]},{"id":"cfdf8ee2-5e6d-46a6-8376-5130191edc1f","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"BetrLager","transportMit":"Rollwagen","auftraggeber":"GF Betreuung","fachgruppe":"betreuung","positionen":[{"id":"0f97732c-b1e1-4e8e-b7eb-9e17fb3d6fb3","herkunftId":null,"anzahl":"2","material":"Werbetafeln"}]},{"id":"a82611e4-183d-4e1e-b5a3-5e7a29a83353","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Dachboden / Material vom WM-Sennestadt","transportMit":"Rollwagen","auftraggeber":"GF Betreuung","fachgruppe":"betreuung","positionen":[{"id":"5e3d3a4d-2429-429d-b73e-e265fa6d36b3","herkunftId":null,"anzahl":"1","material":"Alu-Kiste mit LED-Weihnachtsgirlanden, Preisschilder, Keile, Tesa, Fahnen, Rappbändern, Edding, usw."}]},{"id":"882ce5e5-cd97-4596-9b7a-e20059c6774b","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Kaltlager","transportMit":"Rollwagen","auftraggeber":"GF TeSi","fachgruppe":"tesi","positionen":[{"id":"6cada78d-83ad-417e-ba66-cd49526db868","herkunftId":null,"anzahl":"1","material":"Besen, Handfeger, Kehrblech"},{"id":"e3d25650-6cfc-43f5-9047-8f50fcf8a0c9","herkunftId":null,"anzahl":"2","material":"Stehtische"},{"id":"97f602ee-4028-4620-94aa-f900f8abe009","herkunftId":null,"anzahl":"1","material":"Überfahrmatte für E-Leitungen"}]},{"id":"270128f6-8da8-4b06-b277-68bbdd210347","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Küchenlager","transportMit":"Rollwagen","auftraggeber":"GF Verpflegung / GF Betreuung","fachgruppe":null,"positionen":[{"id":"a5b5761e-33cd-49ff-b420-d0938ef0fbd7","herkunftId":null,"anzahl":"","material":"Erbsen- oder Gulaschsuppe, fertige"},{"id":"8b3d044b-431c-490f-89c8-fbdfebd7cade","herkunftId":null,"anzahl":"1","material":"Friteuse, Drehstrom, roter Stecker"},{"id":"db75f46c-6feb-4b55-8005-37ffc2edf2d4","herkunftId":null,"anzahl":"1","material":"Rollwagen für Friteuse"},{"id":"6849e420-3263-45dc-a46d-67e7da5309a0","herkunftId":null,"anzahl":"2","material":"Mülleimer"},{"id":"5952bc05-0c2d-40f2-b31d-c243c48d531f","herkunftId":null,"anzahl":"2","material":"Wäschekörbe oder grüne Klappkästen"},{"id":"b34bc35d-b5cc-49c3-9024-5ff10c8d47a2","herkunftId":null,"anzahl":"1","material":"Wasserkanister"},{"id":"e85e7c88-f75f-4f23-b36c-55944e9271ff","herkunftId":null,"anzahl":"1","material":"DeSi-Alu-Kiste, kleine"}]},{"id":"7000c08a-5e8c-4006-9ad4-e9ba187ba1f0","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Lager OV","transportMit":"Rollwagen","auftraggeber":"GF Betreuung","fachgruppe":"betreuung","positionen":[{"id":"de3463cc-bac7-4dc2-8a4c-215b316e3926","herkunftId":null,"anzahl":"10","material":"Alu-Schalen mit Deckel f. Außerhausverkauf"},{"id":"8a638838-3926-4029-8cda-a8b83c9c4d16","herkunftId":null,"anzahl":"1","material":"Papiertischdecke, weiß -einfach"}]},{"id":"68603394-60f8-49b0-84fd-1b84c6fa8ff5","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Vorraum oben","transportMit":"Rollwagen","auftraggeber":"GF TeSi","fachgruppe":"tesi","positionen":[{"id":"420ae469-ecf2-4141-9782-7bae4cc79d36","herkunftId":null,"anzahl":"1","material":"Feuerlöscher, Fettbrand"}]}]},{"id":"7b0fc2b6-280c-4349-9b85-73163871b132","herkunftId":null,"titel":"blauer Gitterwagen","farbe":"abschnitt-2","fachgruppe":null,"laufzettel":[{"id":"56c8b662-7ab6-4e76-8e9e-843f171fc08d","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"GW-Technik","transportMit":"blauer Gitterwagen","auftraggeber":"GF TeSi","fachgruppe":"tesi","positionen":[{"id":"17e2ccc6-19a6-4f0b-a893-c667630845cd","herkunftId":null,"anzahl":"2","material":"Drehstromkabeltrommel 400V"},{"id":"e8e50eb9-1965-4665-83e4-8ce74f3df247","herkunftId":null,"anzahl":"1","material":"Drehstromverteiler, Metall 400V 16 Amp."},{"id":"e109b555-9ac4-4ac4-9f6d-33f162dfc492","herkunftId":null,"anzahl":"1","material":"Schukokabeltrommel 230V"},{"id":"f14b826d-e551-48d1-ab4c-bb35b84174f2","herkunftId":null,"anzahl":"1","material":"Schuko-Mehrfachverteiler 230V"},{"id":"1157e45d-bfca-4a82-b297-52cfd3908ba3","herkunftId":null,"anzahl":"1","material":"Verlängerungsleitung 230V 10m"}]},{"id":"f68a7afb-6fd3-404a-857e-e8bfdf0da34b","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Kaltlager, Alu-Kiste","transportMit":"blauer Gitterwagen","auftraggeber":"GF TeSi","fachgruppe":"tesi","positionen":[{"id":"5f91dd59-8852-4299-ac83-df0f2849ab5f","herkunftId":null,"anzahl":"1","material":"Hockerkocher in Alu-Kiste"},{"id":"0b27b60e-17d6-49a8-af50-3567ea2c601d","herkunftId":null,"anzahl":"1","material":"Lecksuchspray"},{"id":"f2c15084-09a7-4bea-b064-b5d26694b48d","herkunftId":null,"anzahl":"2","material":"Feuerzeuge, Stabform"}]}]},{"id":"d22dc729-e7a1-4c8d-964c-523b148682a7","herkunftId":null,"titel":"grüne Einkaufskisten","farbe":"abschnitt-3","fachgruppe":null,"laufzettel":[{"id":"fd79cd4c-559f-4d25-925e-76bd330a965e","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Küchenlager","transportMit":"grüne Einkaufskisten","auftraggeber":"GF Betreuung / GF Verpflegung","fachgruppe":null,"positionen":[{"id":"d016efd6-60b2-462c-93fc-5b73481400a7","herkunftId":null,"anzahl":"20","material":"Mülltüten, 240 Liter"},{"id":"c3b4b045-e226-4654-aaa8-55771dcb4263","herkunftId":null,"anzahl":"5","material":"Küchenrollen"},{"id":"8a241eec-1be3-4075-93c5-b0bcc935c1a4","herkunftId":null,"anzahl":"1","material":"Messer- / Löffel-Alu-Kiste"},{"id":"3cda363a-87c7-491d-83ca-7378283ae55b","herkunftId":null,"anzahl":"3","material":"Kellen, unterschiedliche Größe"},{"id":"17effd92-b132-4da0-bfde-b08dbcd6959c","herkunftId":null,"anzahl":"2","material":"Schaumkellen"},{"id":"5a079287-4eae-4c3e-a1a0-558e9a686bac","herkunftId":null,"anzahl":"5","material":"Messer"},{"id":"230e1ae9-ec44-4478-84e1-56e1d0008127","herkunftId":null,"anzahl":"1","material":"Schneidbrett"},{"id":"3189025e-d758-4d05-995c-bc22e72d6187","herkunftId":null,"anzahl":"3","material":"Schüsseln f. Pommes"},{"id":"93454a63-2faa-42cc-a653-5a53f42a9623","herkunftId":null,"anzahl":"1","material":"Topf für Suppe"},{"id":"43b33d0d-621d-4c97-ab18-1ac2336a49a5","herkunftId":null,"anzahl":"1","material":"Frittieröl, 10l"},{"id":"46c3c3d0-607b-47e8-bda7-167d6dbdce3f","herkunftId":null,"anzahl":"1","material":"Pommesgewürz, Dose"}]},{"id":"1f160c44-e045-40fc-9676-de4fc9c63e48","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"BetrLager","transportMit":"grüne Einkaufskisten","auftraggeber":"GF Verpflegung / GF Betreuung","fachgruppe":null,"positionen":[{"id":"7270622b-ecf2-4fcf-964e-a697c35e54a0","herkunftId":null,"anzahl":"","material":"Ketchup, Gewürz-"},{"id":"d8459ca1-6130-4e47-9896-ce488a72d26f","herkunftId":null,"anzahl":"","material":"Ketchup, Tomate"},{"id":"0baecae3-1335-404c-95f7-2e1af9e8f3b0","herkunftId":null,"anzahl":"","material":"Mayonnaise, Salat-"},{"id":"7ffc42f2-a514-48fd-9c98-28badadc74e5","herkunftId":null,"anzahl":"400","material":"Holzpiekser"},{"id":"40534539-733f-4039-969a-cb659c357a14","herkunftId":null,"anzahl":"400","material":"Löffel aus Kunststoff"},{"id":"6bd112a4-5c34-4afa-85d0-b669f3703003","herkunftId":null,"anzahl":"400","material":"Papp-Schalen für Pommes 9x14x3 cm"},{"id":"d346edb4-e116-46ed-8f6f-24f690fa0dca","herkunftId":null,"anzahl":"400","material":"Kunststoff-Schalen für Suppe 0,5l"},{"id":"3ddcf34a-af3a-4020-9f9d-12dede8a5083","herkunftId":null,"anzahl":"400","material":"Servietten"}]},{"id":"dc3fc4b0-deff-4c86-9b57-36d124d00ff9","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Gefriertruhe","transportMit":"grüne Einkaufskisten","auftraggeber":"GF Verpflegung","fachgruppe":"verpflegung","positionen":[{"id":"531c7cb3-6f08-4a5b-971c-9f057b238c19","herkunftId":null,"anzahl":"","material":"Pommes"}]},{"id":"dcc9dfce-6cea-468a-81d1-14ecc24fc47b","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Ratio","transportMit":"grüne Einkaufskisten","auftraggeber":"GF Verpflegung","fachgruppe":"verpflegung","positionen":[{"id":"64db69ae-a8e5-44a3-b5e2-c09d37f1f5dc","herkunftId":null,"anzahl":"3","material":"Toastbrot"}]}]},{"id":"1e8f759c-e9cb-4b7d-bffd-44402d520046","herkunftId":null,"titel":"Iveco Betreuung","farbe":"abschnitt-4","fachgruppe":null,"laufzettel":[{"id":"7eb8bfa6-60ed-4d10-a42d-298f8dc58a96","herkunftId":null,"ueberschrift":"Material verlasten","lagerort":"Kfz-Halle","transportMit":"Iveco Betreuung","auftraggeber":"GF TeSi","fachgruppe":"tesi","positionen":[{"id":"7b421089-5b2f-41ae-adf3-ff33d433d90b","herkunftId":null,"anzahl":"1","material":"Biertischbank"},{"id":"79b01266-fa83-40b2-8282-e15fe037a360","herkunftId":null,"anzahl":"1","material":"Biertisch"}]}]}]}', 4, 14, 47, 1, '2026-01-01T00:00:00.000Z', 'system');
