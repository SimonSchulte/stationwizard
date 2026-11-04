import { Injectable } from '@angular/core';
import { VbInhalt } from '../models/vb.model';

/**
 * Platzhalter: der Druck (Anweisungsblatt und Laufzettelstreifen, pdfmake) wird später
 * umgesetzt. Die Signatur ist verbindlich.
 */
@Injectable({ providedIn: 'root' })
export class VbDruckDienst {
  async drucken(
    kopf: { titel: string; beginn: string | null; ende: string | null; ort: string | null },
    inhalt: VbInhalt,
  ): Promise<void> {
    void kopf;
    void inhalt;
    throw new Error('noch nicht umgesetzt');
  }
}
