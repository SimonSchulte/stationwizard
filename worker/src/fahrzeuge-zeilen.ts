/** D1-Zeilen und ihre JSON-Form; Token stehen in keiner dieser Antworten. */

export interface FahrzeugZeile {
  id: string;
  bezeichnung: string;
  funkrufname: string;
  kennzeichen: string;
  fahrgestellnummer: string | null;
  eigentuemer: string;
  gruppe: string;
  bemerkung: string;
  wartungstermine: string;
  geaendert_am: string;
  geaendert_von: string;
  version: number;
  /**
   * Geheimnis: Ziel des öffentlichen QR-Codes. Steht hier, weil `SELECT *`
   * die Spalte mitliest – wird von `zuFahrzeugJson()` aber bewusst NICHT
   * übernommen, damit es nicht über die Fahrzeugliste bis in den
   * Einsatzplaner reicht. Auslesbar allein über die
   * Erfassungslink-Endpunkte. Ein Test sichert das ab.
   */
  erfassung_token: string | null;
  erfassung_token_am: string | null;
}

export function zuFahrzeugJson(zeile: FahrzeugZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    bezeichnung: zeile.bezeichnung,
    funkrufname: zeile.funkrufname,
    kennzeichen: zeile.kennzeichen,
    fahrgestellnummer: zeile.fahrgestellnummer,
    eigentuemer: zeile.eigentuemer,
    gruppe: zeile.gruppe,
    bemerkung: zeile.bemerkung,
    // In der Spalte liegt bereits geprüftes JSON aus einem früheren Schreibvorgang.
    wartungstermine: JSON.parse(zeile.wartungstermine),
    geaendertAm: zeile.geaendert_am,
    geaendertVon: zeile.geaendert_von,
  };
}

export interface AblesungZeile {
  id: string;
  fahrzeug_id: string;
  abgelesen_am: string;
  stand: number;
  erfasst_am: string;
  erfasst_von: string;
  quelle: string;
  korrigiert: string | null;
  bemerkung: string;
  gemeldet_von_name: string | null;
}

export function zuAblesungJson(zeile: AblesungZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    fahrzeugId: zeile.fahrzeug_id,
    abgelesenAm: zeile.abgelesen_am,
    stand: zeile.stand,
    erfasstAm: zeile.erfasst_am,
    erfasstVon: zeile.erfasst_von,
    quelle: zeile.quelle,
    korrigiert: zeile.korrigiert,
    bemerkung: zeile.bemerkung,
    // Immer vorhanden, damit die Fachschicht das Feld nicht ungeprüft
    // durchreichen muss: bei allen anderen Erfassungswegen ist es leer.
    gemeldetVonName: zeile.gemeldet_von_name ?? '',
  };
}

export interface AenderungZeile {
  id: string;
  fahrzeug_id: string;
  zeitpunkt: string;
  von: string;
  beschreibung: string;
}

export function zuAenderungJson(zeile: AenderungZeile): Record<string, unknown> {
  return {
    id: zeile.id,
    fahrzeugId: zeile.fahrzeug_id,
    zeitpunkt: zeile.zeitpunkt,
    von: zeile.von,
    beschreibung: zeile.beschreibung,
  };
}
