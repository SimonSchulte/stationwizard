/**
 * Merkt den selbst angegebenen Namen auf dem Gerät des Meldenden.
 *
 * Bewusste, eng gefasste Ausnahme von der Projektregel "fachlich erforderliche
 * Daten nicht in localStorage persistieren" (CLAUDE.md): gespeichert wird
 * ausschließlich eine Selbstauskunft des Geräteinhabers über sich selbst, keine
 * Fachdaten – die führende Fassung jeder Meldung liegt in der Datenbank. Die
 * Seite liegt außerdem außerhalb der Angular-App und hält keinerlei
 * Fahrzeugdaten. Der Name ist über einen sichtbaren Knopf jederzeit löschbar.
 *
 * Jeder Zugriff ist gekapselt: in privaten Fenstern oder bei gesperrtem
 * Seitenspeicher wirft der Zugriff, und die Seite muss trotzdem funktionieren.
 */
const SCHLUESSEL = 'stationwizard.erfassung.name';

export function leseGemerktenNamen(): string {
  try {
    return localStorage.getItem(SCHLUESSEL) ?? '';
  } catch {
    return '';
  }
}

export function merkeNamen(name: string): void {
  try {
    localStorage.setItem(SCHLUESSEL, name);
  } catch {
    // Ohne Seitenspeicher entfällt nur die Vorbelegung beim nächsten Mal.
  }
}

export function vergissNamen(): void {
  try {
    localStorage.removeItem(SCHLUESSEL);
  } catch {
    // Nichts zu vergessen, wenn schon das Lesen nicht möglich war.
  }
}
