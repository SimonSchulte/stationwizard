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

/** Wie lange der unsichtbare Druckrahmen höchstens bleibt, falls `afterprint` ausbleibt. */
const RAHMEN_LEBENSDAUER_MS = 5 * 60_000;

/**
 * Druck der Vorbereitung: optional die Seite „Allgemeine Anweisungen“, danach 3 bis 6
 * Laufzettelstreifen je A4-Querseite (siehe `docs/konzept-einsatzplanung-vb.md`, Abschnitt 6).
 * `drucken()` öffnet direkt den Druckdialog des Browsers, `herunterladen()` speichert das PDF.
 * Fehler werden geworfen; der Aufrufer meldet sie.
 */
@Injectable({ providedIn: 'root' })
export class VbDruckDienst {
  private readonly meldungen = inject(MeldungsDienst);
  private readonly layout = inject(LaufzettelLayoutWahl);

  /** Öffnet den Druckdialog des Browsers; ohne direkten Druck (z. B. am Handy) wird das PDF geladen. */
  async drucken(kopf: VbDruckKopf, inhalt: VbInhalt): Promise<void> {
    const { daten, dateiname } = await this.erzeugen(kopf, inhalt);
    try {
      await this.direktdrucken(daten);
    } catch {
      this.speichern(daten, dateiname);
      this.meldungen.info(
        'Der Browser konnte nicht direkt drucken. Das PDF wurde heruntergeladen.',
      );
    }
  }

  async herunterladen(kopf: VbDruckKopf, inhalt: VbInhalt): Promise<void> {
    const { daten, dateiname } = await this.erzeugen(kopf, inhalt);
    this.speichern(daten, dateiname);
  }

  private async erzeugen(
    kopf: VbDruckKopf,
    inhalt: VbInhalt,
  ): Promise<{ daten: Uint8Array<ArrayBuffer>; dateiname: string }> {
    const laufzettel = inhalt.abschnitte.reduce((summe, a) => summe + a.laufzettel.length, 0);
    if (laufzettel === 0 && !inhalt.anweisungen.trim()) {
      throw new Error('Die Vorbereitung enthält weder Anweisungen noch Laufzettel.');
    }
    const streifenJeSeite = this.layout.streifenJeSeite();
    const streifen = baueLaufzettelStreifen(inhalt, streifenJeSeite);
    const definition = baueVbPdfDefinition(kopf, inhalt, streifen, new Date(), streifenJeSeite);
    const pdfMake = await this.ladeBibliothek();
    const daten = Uint8Array.from(await pdfMake.createPdf(definition).getBuffer());

    const zuVoll = zuVolleLaufzettel(inhalt, streifenJeSeite).length;
    if (zuVoll > 0) {
      this.meldungen.warnung(
        zuVoll === 1
          ? 'Ein Laufzettel passt nicht auf einen Streifen und wurde mit einem Fortsetzungsstreifen gedruckt.'
          : `${zuVoll} Laufzettel passen nicht auf einen Streifen und wurden mit Fortsetzungsstreifen gedruckt.`,
      );
    }
    return { daten, dateiname: vbDateiname(kopf.titel, heuteIso()) };
  }

  /** Naht für Tests: Bibliothek und Schriften werden erst beim Drucken geladen. */
  ladeBibliothek(): ReturnType<typeof ladePdfBibliothek> {
    return ladePdfBibliothek();
  }

  /** Naht für Tests: der Browser-Download. */
  speichern(daten: Uint8Array<ArrayBuffer>, dateiname: string): void {
    dateiHerunterladen(daten, dateiname, 'application/pdf');
  }

  /**
   * Naht für Tests: lädt das PDF in einen unsichtbaren Rahmen derselben Seite und öffnet dessen
   * Druckdialog. Wirft, wenn der Rahmen nicht lädt oder der Browser `print()` verweigert.
   */
  direktdrucken(daten: Uint8Array<ArrayBuffer>): Promise<void> {
    const url = URL.createObjectURL(new Blob([daten], { type: 'application/pdf' }));
    const rahmen = document.createElement('iframe');
    rahmen.setAttribute('aria-hidden', 'true');
    rahmen.tabIndex = -1;
    rahmen.style.position = 'fixed';
    rahmen.style.visibility = 'hidden';
    rahmen.style.right = '0';
    rahmen.style.bottom = '0';
    const aufraeumen = () => {
      rahmen.remove();
      URL.revokeObjectURL(url);
    };
    return new Promise<void>((resolve, reject) => {
      rahmen.onload = () => {
        const fenster = rahmen.contentWindow;
        if (!fenster) {
          aufraeumen();
          reject(new Error('Kein Druckfenster'));
          return;
        }
        try {
          fenster.addEventListener('afterprint', aufraeumen, { once: true });
          fenster.focus();
          fenster.print();
          setTimeout(aufraeumen, RAHMEN_LEBENSDAUER_MS);
          resolve();
        } catch (fehler) {
          aufraeumen();
          reject(fehler instanceof Error ? fehler : new Error('Druck fehlgeschlagen'));
        }
      };
      rahmen.onerror = () => {
        aufraeumen();
        reject(new Error('Das PDF konnte nicht geladen werden.'));
      };
      rahmen.src = url;
      document.body.appendChild(rahmen);
    });
  }
}
