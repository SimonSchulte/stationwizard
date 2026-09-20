import { Injectable, inject } from '@angular/core';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';

/**
 * Kopieren als formatierte Tabelle nach Word: es existiert bisher kein
 * Zwischenablage-Code im Projekt. Angular CDKs `Clipboard.copy()` unterstützt
 * nur Klartext; für eine von Word als echte Tabelle erkannte Einfügung ist die
 * asynchrone Clipboard-API mit einem `text/html`-Eintrag nötig, mit
 * `text/plain` als Rückfallebene im selben `ClipboardItem`.
 */
@Injectable({ providedIn: 'root' })
export class TabellenZwischenablageService {
  private readonly dialogDienst = inject(DialogDienst);

  async kopieren(html: string, klartext: string): Promise<boolean> {
    try {
      const dokument = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([dokument], { type: 'text/html' }),
          'text/plain': new Blob([klartext], { type: 'text/plain' }),
        }),
      ]);
      return true;
    } catch {
      // Unsicherer Kontext, verweigerte Berechtigung oder fehlende Unterstützung
      // – kein stilles Scheitern, sondern ein sichtbarer Hinweis mit Alternative.
      await this.dialogDienst.hinweis(
        'Kopieren war nicht möglich. Bitte die Tabelle manuell markieren und mit Strg+C bzw. Cmd+C kopieren.',
        'Tabelle kopieren',
      );
      return false;
    }
  }
}
