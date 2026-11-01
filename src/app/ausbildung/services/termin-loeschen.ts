import { Injectable, inject } from '@angular/core';
import { PlanStore } from './plan-store';
import { RueckgaengigDienst } from './rueckgaengig-dienst';

/**
 * Löscht einen Termin oder eine Idee und bietet sofort „Rückgängig“ an. Gemeinsam für
 * Kalender und offene Ideen, damit beide dieselbe Rückmeldung geben.
 */
@Injectable({ providedIn: 'root' })
export class TerminLoeschenDienst {
  private readonly store = inject(PlanStore);
  private readonly rueckgaengig = inject(RueckgaengigDienst);

  loesche(id: string): void {
    const termin = this.store.terminNachId(id);
    this.store.loescheTermin(id);
    this.rueckgaengig.melde(`„${kurzname(termin?.thema || termin?.hinweis || '')}“ gelöscht.`);
  }
}

function kurzname(text: string): string {
  const einzeilig = text.replace(/\s+/g, ' ').trim();
  return einzeilig.length > 42 ? `${einzeilig.slice(0, 40)}…` : einzeilig || 'Eintrag';
}
