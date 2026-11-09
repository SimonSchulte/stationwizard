import { Injectable, inject } from '@angular/core';
import { heuteIso } from '../../kern/kalender/datum';
import { PdfAusgabe } from '../../kern/pdf/pdf-ausgabe';
import { ladePdfBibliothek } from '../../kern/pdf/pdf-bibliothek';
import { Kiste } from '../models/stammdaten.model';
import {
  baueKistenschildDefinition,
  baueKistenzettelDefinition,
  KistenDruckDaten,
} from './kisten-pdf-definition';
import { LaufzettelLayoutWahl } from './laufzettel-layout-wahl';

/** Dateiname ohne Zeichen, die Betriebssysteme in Dateinamen nicht zulassen. */
export function kistenDateiname(
  art: 'Schild' | 'Zettel',
  kisten: readonly Kiste[],
  datum: string,
): string {
  const bereinigt = (kisten.length === 1 ? kisten[0].name : `${kisten.length} Kisten`)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return `Kiste ${art} ${bereinigt || 'Kiste'} ${datum}.pdf`;
}

/**
 * Druck von Kistenschild und Kistenzettel. `drucken` öffnet direkt den Druckdialog des Browsers
 * (Rückfall: Download, siehe `PdfAusgabe`). Fehler werden geworfen; der Aufrufer meldet sie.
 */
@Injectable({ providedIn: 'root' })
export class KistenDruckDienst {
  private readonly ausgabe = inject(PdfAusgabe);
  private readonly layout = inject(LaufzettelLayoutWahl);

  async schildDrucken(kisten: readonly Kiste[], daten: KistenDruckDaten): Promise<void> {
    if (kisten.length === 0) return;
    const pdfMake = await this.ladeBibliothek();
    const bytes = Uint8Array.from(
      await pdfMake.createPdf(baueKistenschildDefinition(kisten, daten)).getBuffer(),
    );
    await this.ausgabe.drucken(bytes, kistenDateiname('Schild', kisten, heuteIso()));
  }

  async zettelDrucken(kisten: readonly Kiste[], daten: KistenDruckDaten): Promise<void> {
    if (kisten.length === 0) return;
    const pdfMake = await this.ladeBibliothek();
    const definition = baueKistenzettelDefinition(kisten, daten, this.layout.streifenJeSeite());
    const bytes = Uint8Array.from(await pdfMake.createPdf(definition).getBuffer());
    await this.ausgabe.drucken(bytes, kistenDateiname('Zettel', kisten, heuteIso()));
  }

  /** Naht für Tests: Bibliothek und Schriften werden erst beim Drucken geladen. */
  ladeBibliothek(): ReturnType<typeof ladePdfBibliothek> {
    return ladePdfBibliothek();
  }
}
