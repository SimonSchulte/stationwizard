/**
 * Behälter: ein physisch eigenständiges Stück Material mit eigener Identität,
 * das an genau einem Fahrzeug hängt – ein GW SAN trägt zehn Notfallrucksäcke,
 * jeder davon wird einzeln geprüft ("NFR 3").
 *
 * Das Prüftoken des öffentlichen QR-Wegs gehört bewusst nicht in dieses
 * Modell: es ist ein Geheimnis und wird ausschließlich über den eigenen
 * Prüfcode-Endpunkt abgerufen.
 */
export interface Behaelter {
  id: string;
  fahrzeugId: string;
  vorlageId: string;
  bezeichnung: string;
  bemerkung: string;
  geaendertAm: string;
  geaendertVon: string;
}

/**
 * Zeile der Übersicht: Behälter samt Fahrzeug, Vorlage und letztem Check. Der
 * Worker liefert das in einem Aufruf über den ganzen Bestand – die Oberfläche
 * lädt nie je Behälter nach.
 */
export interface BehaelterUebersicht extends Behaelter {
  fahrzeugBezeichnung: string;
  fahrzeugFunkrufname: string;
  fahrzeugGruppe: string;
  vorlageBezeichnung: string;
  /** Kalendertag des jüngsten Checks, oder `null`, wenn noch nie geprüft wurde. */
  zuletztGeprueftAm: string | null;
  letzterCheckId: string | null;
  letzteFehlmengen: number | null;
  letzteUnbrauchbar: number | null;
  letzteAbgelaufen: number | null;
}
