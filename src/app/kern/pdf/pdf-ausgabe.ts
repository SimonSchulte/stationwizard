import { Injectable, inject } from '@angular/core';
import { dateiHerunterladen } from '../storage/datei-storage';
import { MeldungsDienst } from '../zustand/meldungs-dienst';

/** Wohin ein erzeugtes PDF geht: direkt in den Druckdialog oder als Datei auf die Platte. */
export type PdfAusgabeWeg = 'drucken' | 'herunterladen';

/** Wie lange der unsichtbare Druckrahmen höchstens bleibt, falls `afterprint` ausbleibt. */
const RAHMEN_LEBENSDAUER_MS = 5 * 60_000;

/**
 * Gemeinsame Ausgabe aller PDF-Exporte: `drucken()` öffnet direkt den Druckdialog des
 * Browsers, `herunterladen()` speichert die Datei. Verweigert der Browser den Druck (etwa am
 * Handy), wird das PDF stattdessen heruntergeladen und das gemeldet. Jeder PDF-Export ruft
 * diesen Dienst, statt eigene Download- oder Druckwege zu bauen.
 */
@Injectable({ providedIn: 'root' })
export class PdfAusgabe {
  private readonly meldungen = inject(MeldungsDienst);

  /** Führt den gewählten Weg aus; Standard ist das direkte Drucken. */
  async ausgeben(
    daten: Uint8Array<ArrayBuffer>,
    dateiname: string,
    weg: PdfAusgabeWeg = 'drucken',
  ): Promise<void> {
    if (weg === 'herunterladen') {
      this.herunterladen(daten, dateiname);
      return;
    }
    await this.drucken(daten, dateiname);
  }

  async drucken(daten: Uint8Array<ArrayBuffer>, dateiname: string): Promise<void> {
    try {
      await this.direktdrucken(daten);
    } catch {
      this.herunterladen(daten, dateiname);
      this.meldungen.info(
        'Der Browser konnte nicht direkt drucken. Das PDF wurde heruntergeladen.',
      );
    }
  }

  herunterladen(daten: Uint8Array<ArrayBuffer>, dateiname: string): void {
    this.speichern(daten, dateiname);
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
