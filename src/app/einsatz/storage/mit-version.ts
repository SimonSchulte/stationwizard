/**
 * Ein gelesener Stand samt Versionskennung. `version` ist für die Fachschicht
 * undurchsichtig (der ETag des Workers) und wird beim Speichern unverändert als
 * `If-Match` zurückgegeben.
 */
export interface MitVersion<T> {
  daten: T;
  version: string;
}
