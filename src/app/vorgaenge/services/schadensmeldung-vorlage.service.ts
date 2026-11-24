import { Injectable } from '@angular/core';
import { DateiVorlageDienst } from '../../kern/dateien/datei-vorlage-dienst';
import { SCHADENSMELDUNG_MEDIENTYP } from './schadensmeldung-pdf';

/** Ablage des PDF-Formulars der Schadens- und Verlustmeldung (Anlage 5) am Worker. */
@Injectable({ providedIn: 'root' })
export class SchadensmeldungVorlageService extends DateiVorlageDienst {
  constructor() {
    super(
      '/api/vorlagen/schadensmeldung',
      '/api/vorlagen/schadensmeldung/datei',
      SCHADENSMELDUNG_MEDIENTYP,
    );
  }
}
