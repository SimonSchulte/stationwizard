import { Injectable } from '@angular/core';
import {
  DateiVorlageDienst,
  istDateiVorlageMetadaten,
  type DateiVorlageMetadaten,
} from '../../kern/dateien/datei-vorlage-dienst';

export { DateiVorlageDienst, istDateiVorlageMetadaten, type DateiVorlageMetadaten };

/** Bisheriger Name, für die Führerscheinliste unverändert. */
export type FuehrerscheinVorlageMetadaten = DateiVorlageMetadaten;

export const FUEHRERSCHEIN_VORLAGE_MEDIENTYP =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable({ providedIn: 'root' })
export class FuehrerscheinVorlageService extends DateiVorlageDienst {
  constructor() {
    super(
      '/api/personal/fuehrerschein-vorlage',
      '/api/personal/fuehrerschein-vorlage/datei',
      FUEHRERSCHEIN_VORLAGE_MEDIENTYP,
    );
  }
}

@Injectable({ providedIn: 'root' })
export class EhrungsantragVorlageService extends DateiVorlageDienst {
  constructor() {
    super(
      '/api/personal/ehrungsantrag-vorlage',
      '/api/personal/ehrungsantrag-vorlage/datei',
      'application/pdf',
    );
  }
}
