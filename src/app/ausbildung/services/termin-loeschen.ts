import { Injectable, inject } from '@angular/core';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../kern/zustand/zustand';
import { PlanStore } from './plan-store';

/**
 * Löscht einen Termin oder eine Idee und bietet sofort „Rückgängig“ an. Gemeinsam für
 * Kalender und offene Ideen, damit beide dieselbe Rückmeldung geben.
 */
@Injectable({ providedIn: 'root' })
export class TerminLoeschenDienst {
  private readonly store = inject(PlanStore);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly dialogDienst = inject(DialogDienst);

  loesche(id: string): void {
    const termin = this.store.terminNachId(id);
    this.store.loescheTermin(id);
    const standNachLoeschen = this.store.dokument();
    const name = kurzname(termin?.thema || termin?.hinweis || '');
    this.meldungen.info(`„${name}“ gelöscht.`, {
      aktion: 'Rückgängig',
      dauerMs: 8_000,
      beiAktion: () => {
        // Nur zurücknehmen, wenn seither nichts anderes geändert wurde; sonst würde
        // „Rückgängig“ eine fremde Änderung treffen.
        if (this.store.dokument() === standNachLoeschen) {
          this.store.rueckgaengig();
        } else {
          void this.dialogDienst.hinweis(
            'Seit dem Löschen wurde der Kalender weiter geändert. Mit Strg+Z lassen sich die Schritte einzeln zurücknehmen.',
            'Rückgängig nicht möglich',
          );
        }
      },
    });
  }
}

function kurzname(text: string): string {
  const einzeilig = text.replace(/\s+/g, ' ').trim();
  return einzeilig.length > 42 ? `${einzeilig.slice(0, 40)}…` : einzeilig || 'Eintrag';
}
