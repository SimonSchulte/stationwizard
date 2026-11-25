import { Injectable, inject } from '@angular/core';
import { Namensverzeichnis } from '../../kern/namensverzeichnis';
import { WorkerFehler } from '../../kern/worker-client';
import { SchadensmeldungInhalt } from '../models/schadensmeldung.model';
import { UnterschriftStand } from '../models/vorgang.model';
import { UnterschriftFuerPdf, schadensmeldungFuellen } from './schadensmeldung-pdf';
import { SchadensmeldungVorlageService } from './schadensmeldung-vorlage.service';

/**
 * Die gesetzten Unterschriften für das PDF. Als Name gilt der **aktuelle** Anzeigename der
 * unterschreibenden Person; hat sie keinen gesetzt (oder ist er nicht abrufbar), bleibt der beim
 * Unterschreiben festgehaltene Name stehen.
 */
export function unterschriftenFuerPdf(
  unterschriften: readonly UnterschriftStand[],
  eigenerName: (email: string | null) => string | null,
): UnterschriftFuerPdf[] {
  return unterschriften.flatMap((u) => {
    if (u.status !== 'unterschrieben' || !u.signatur || !u.unterschriebenAm) return [];
    const name = eigenerName(u.anEmail) ?? u.name;
    return name ? [{ slot: u.slot, name, datum: u.unterschriebenAm, signatur: u.signatur }] : [];
  });
}

/** Erzeugt das PDF einer Meldung aus der hinterlegten Vorlage und den gesetzten Unterschriften. */
@Injectable({ providedIn: 'root' })
export class SchadensmeldungPdfService {
  private readonly vorlage = inject(SchadensmeldungVorlageService);
  private readonly namen = inject(Namensverzeichnis);

  async erzeuge(
    inhalt: SchadensmeldungInhalt,
    unterschriften: readonly UnterschriftStand[],
  ): Promise<Uint8Array> {
    let vorlage: ArrayBuffer;
    try {
      vorlage = await this.vorlage.datenLaden();
    } catch (fehler) {
      if (fehler instanceof WorkerFehler && fehler.status === 404) {
        throw new Error(
          'Es ist noch keine Vorlage hinterlegt. Bitte im Verwaltungsbereich unter „Schadensmeldung-Vorlage“ hochladen.',
        );
      }
      throw fehler;
    }
    await this.namen.laden();
    const gesetzt = unterschriftenFuerPdf(unterschriften, (email) => this.namen.eigenerName(email));
    return await schadensmeldungFuellen(vorlage, { inhalt, unterschriften: gesetzt });
  }

  /** Dateiname ohne Sonderzeichen, zum Beispiel `schadensmeldung-xx-hs-110-2026-11-12.pdf`. */
  dateiname(inhalt: SchadensmeldungInhalt): string {
    const teil = (text: string) =>
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `schadensmeldung-${teil(inhalt.kennzeichen) || 'fahrzeug'}-${inhalt.datumFeststellung || 'ohne-datum'}.pdf`;
  }
}
