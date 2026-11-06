import { Injectable, inject } from '@angular/core';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../kern/zustand/zustand';
import { PlanStore } from './plan-store';

/**
 * Meldet eine soeben ausgeführte Änderung des Kalenders und bietet in derselben Snackbar
 * „Rückgängig“ an – auch dort erreichbar, wo es kein Strg+Z gibt (Touch).
 */
@Injectable({ providedIn: 'root' })
export class RueckgaengigDienst {
  private readonly store = inject(PlanStore);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly dialogDienst = inject(DialogDienst);

  /** Muss direkt nach der Änderung gerufen werden: der Stand darin gilt als „letzte Änderung“. */
  melde(text: string): void {
    const standNachAenderung = this.store.dokument();
    this.meldungen.info(text, {
      aktion: 'Rückgängig',
      dauerMs: 8_000,
      beiAktion: () => {
        // Nur zurücknehmen, wenn seither nichts anderes geändert wurde; sonst würde
        // „Rückgängig“ eine fremde Änderung treffen.
        if (this.store.dokument() === standNachAenderung) {
          this.store.rueckgaengig();
        } else {
          void this.dialogDienst.hinweis(
            'Seit dieser Änderung wurde der Kalender weiter geändert. Mit Strg+Z lassen sich die Schritte einzeln zurücknehmen.',
            'Rückgängig nicht möglich',
          );
        }
      },
    });
  }
}
