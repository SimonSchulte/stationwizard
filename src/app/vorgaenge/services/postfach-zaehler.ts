import { Injectable, signal } from '@angular/core';

/**
 * Zahl der Mails im Postfach, die noch einem Vorgang zugeordnet werden müssen. Bewusst eine eigene
 * winzige Klasse: die Kopfleiste der Shell zeigt sie als Marke und darf dafür weder den Speicher
 * noch den Postfach-Store ins Initialbündel ziehen. Gefüllt wird sie von der Aufgabenquelle (ohne
 * zusätzlichen Abruf) und vom Postfach-Store nach jeder Änderung.
 */
@Injectable({ providedIn: 'root' })
export class PostfachZaehler {
  readonly offen = signal(0);
}
