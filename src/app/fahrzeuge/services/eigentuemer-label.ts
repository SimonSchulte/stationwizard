import { Eigentuemer } from '../models/fahrzeug.model';

/** Deutsche Anzeigetexte für den Eigentümer, an einer Stelle gepflegt. */
export const EIGENTUEMER_LABEL: Readonly<Record<Eigentuemer, string>> = {
  'land-nrw': 'Land NRW',
  bund: 'Bund',
  organisation: 'Organisation',
};
