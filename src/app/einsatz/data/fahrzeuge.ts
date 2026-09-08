import { Fahrzeug } from '../models/planung.model';

/**
 * Keine organisationsbezogenen Fahrzeugstammdaten im Repository.
 * Die bisher eingebetteten Kennzeichen, Funkrufe und HiOrg-IDs wurden bei der
 * Übernahme entfernt. Fahrzeuge werden im Editor frei eingegeben oder aus EFS geladen.
 */
export const FAHRZEUGE: Fahrzeug[] = [];
