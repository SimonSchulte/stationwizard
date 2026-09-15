import { Gruppe } from '../models/fahrzeug.model';

/** Deutsche Anzeigetexte für die Gruppenzugehörigkeit, an einer Stelle gepflegt. */
export const GRUPPE_LABEL: Readonly<Record<Gruppe, string>> = {
  betreuung: 'Betreuung',
  tesi: 'TeSi',
  fuehrung: 'Führung',
  sanitaet: 'Sanität',
};
