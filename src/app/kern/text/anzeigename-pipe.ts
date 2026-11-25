import { Pipe, PipeTransform, inject } from '@angular/core';
import { Namensverzeichnis } from '../namensverzeichnis';

/**
 * `{{ eintrag.von | anzeigename }}`: stellt eine E-Mail-Adresse mit dem selbst gewählten Namen der
 * Person dar. Unrein, weil sich das Verzeichnis nach dem Rendern füllen oder ändern kann; der Zugriff
 * auf das Signal macht die Vorlage davon abhängig.
 */
@Pipe({ name: 'anzeigename', pure: false })
export class AnzeigenamePipe implements PipeTransform {
  private readonly namen = inject(Namensverzeichnis);

  transform(email: string | null | undefined): string {
    return this.namen.anzeige(email);
  }
}
