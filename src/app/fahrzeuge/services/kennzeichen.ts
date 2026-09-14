/**
 * Vergleichsform eines Kennzeichens: Großschreibung ohne Leerzeichen,
 * Bindestriche und Punkte. `me-xx 123`, `ME-XX123` und `ME.XX.123` sind damit
 * dasselbe Kennzeichen; gespeichert und angezeigt wird immer der Rohwert.
 *
 * Verbindlich ist der gleichnamige Ausdruck der Datenbank – der eindeutige
 * Index aus `worker/migrations/0003_kennzeichen_eindeutig.sql` und die
 * Vorabprüfung in `worker/src/fahrzeuge.ts`. Diese Fassung dient der Anzeige
 * und der Importvorschau; wird die Regel geändert, muss sie an allen drei
 * Stellen geändert werden.
 *
 * Kleiner bewusster Unterschied: SQLites `upper()` arbeitet nur auf ASCII,
 * `toUpperCase()` auch darüber hinaus. Diese Fassung erkennt damit höchstens
 * mehr Schreibvarianten als die Datenbank, nie weniger – die Oberfläche warnt
 * also eher zu früh als zu spät.
 */
export function normalisiereKennzeichen(wert: string): string {
  return wert.toUpperCase().replace(/[\s\-.]/g, '');
}
