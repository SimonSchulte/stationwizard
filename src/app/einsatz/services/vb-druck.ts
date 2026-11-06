import { Injectable, inject } from '@angular/core';
import { heuteIso } from '../../kern/kalender/datum';
import { ladePdfBibliothek } from '../../kern/pdf/pdf-bibliothek';
import { dateiHerunterladen } from '../../kern/storage/datei-storage';
import { MeldungsDienst } from '../../kern/zustand/meldungs-dienst';
import { VbInhalt } from '../models/vb.model';
import { baueLaufzettelStreifen } from './laufzettel-layout';
import { LaufzettelLayoutWahl } from './laufzettel-layout-wahl';
import { zuVolleLaufzettel } from './laufzettel-platz';
import { baueVbPdfDefinition, VbDruckKopf } from './vb-pdf-definition';

/** Dateiname ohne Zeichen, die Betriebssysteme in Dateinamen nicht zulassen. */
export function vbDateiname(titel: string, datum: string): string {
  const bereinigt = titel
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return `VB ${bereinigt || 'Vorbereitung'} ${datum}.pdf`;
}

/**
 * Druck der Vorbereitung: optional die Seite „Allgemeine Anweisungen“, danach 3 bis 6
 * Laufzettelstreifen je A4-Querseite (siehe `docs/konzept-einsatzplanung-vb.md`, Abschnitt 6).
 * Fehler werden geworfen; der Aufrufer meldet sie.
 */
@Injectable({ providedIn: 'root' })
export class VbDruckDienst {
  private readonly meldungen = inject(MeldungsDienst);
  private readonly layout = inject(LaufzettelLayoutWahl);

  async drucken(kopf: VbDruckKopf, inhalt: VbInhalt): Promise<void> {
    const laufzettel = inhalt.abschnitte.reduce((summe, a) => summe + a.laufzettel.length, 0);
    if (laufzettel === 0 && !inhalt.anweisungen.trim()) {
      throw new Error('Die Vorbereitung enthält weder Anweisungen noch Laufzettel.');
    }
    const streifenJeSeite = this.layout.streifenJeSeite();
    const streifen = baueLaufzettelStreifen(inhalt, streifenJeSeite);
    const definition = baueVbPdfDefinition(kopf, inhalt, streifen, new Date(), streifenJeSeite);
    const pdfMake = await this.ladeBibliothek();
    const daten = await pdfMake.createPdf(definition).getBuffer();
    this.speichern(Uint8Array.from(daten), vbDateiname(kopf.titel, heuteIso()));

    const zuVoll = zuVolleLaufzettel(inhalt, streifenJeSeite).length;
    if (zuVoll > 0) {
      this.meldungen.warnung(
        zuVoll === 1
          ? 'Ein Laufzettel passt nicht auf einen Streifen und wurde mit einem Fortsetzungsstreifen gedruckt.'
          : `${zuVoll} Laufzettel passen nicht auf einen Streifen und wurden mit Fortsetzungsstreifen gedruckt.`,
      );
    }
  }

  /** Naht für Tests: Bibliothek und Schriften werden erst beim Drucken geladen. */
  ladeBibliothek(): ReturnType<typeof ladePdfBibliothek> {
    return ladePdfBibliothek();
  }

  /** Naht für Tests: der Browser-Download. */
  speichern(daten: Uint8Array<ArrayBuffer>, dateiname: string): void {
    dateiHerunterladen(daten, dateiname, 'application/pdf');
  }
}
