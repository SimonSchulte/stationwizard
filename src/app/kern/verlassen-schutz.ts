import { Injectable } from '@angular/core';

/** Fachbereiche melden ihren Zustand; die Shell schützt auch inaktive Planungen. */
@Injectable({ providedIn: 'root' })
export class VerlassenSchutz {
  private readonly pruefungen = new Set<() => boolean>();

  registrieren(pruefung: () => boolean): void {
    this.pruefungen.add(pruefung);
  }

  hatUngesicherteAenderungen(): boolean {
    return [...this.pruefungen].some((pruefung) => pruefung());
  }
}
