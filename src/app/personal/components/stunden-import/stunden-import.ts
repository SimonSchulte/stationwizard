import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  personSchluessel,
  stundenTextLesen,
  type EhrungPerson,
  type StundenEintrag,
} from '../../services/ehrungen-regeln';

/** Vorschau eines eingefügten Stundentexts gegen den geladenen Bestand. */
export function stundenImportVorschau(text: string, bestand: readonly EhrungPerson[]) {
  const { eintraege, fehler } = stundenTextLesen(text);
  const vorhanden = new Map(
    bestand.map((person) => [personSchluessel(person.nachname, person.vorname), person]),
  );
  const gesehen = new Set<string>();
  let neu = 0;
  let geaendert = 0;
  let unveraendert = 0;
  let doppelt = 0;
  for (const eintrag of eintraege) {
    const schluessel = personSchluessel(eintrag.nachname, eintrag.vorname);
    if (gesehen.has(schluessel)) {
      doppelt++;
      continue;
    }
    gesehen.add(schluessel);
    const person = vorhanden.get(schluessel);
    if (!person) neu++;
    else if (person.stunden === eintrag.stunden) unveraendert++;
    else geaendert++;
  }
  return { eintraege, fehler, neu, geaendert, unveraendert, doppelt };
}

/**
 * Eingabe und Vorschau des Stundenimports. Schreibt selbst nichts: „Übernehmen“ meldet die
 * gelesenen Einträge an die Seite, die den Sammelimport ausführt.
 */
@Component({
  selector: 'app-stunden-import',
  imports: [MatButtonModule, MatCardModule, MatChipsModule, MatFormFieldModule, MatInputModule],
  templateUrl: './stunden-import.html',
  styleUrl: './stunden-import.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StundenImport {
  readonly personen = input.required<readonly EhrungPerson[]>();
  readonly arbeitet = input(false);

  readonly uebernehmen = output<readonly StundenEintrag[]>();
  readonly schliessen = output<void>();

  protected readonly text = signal('');
  protected readonly vorschau = computed(() => stundenImportVorschau(this.text(), this.personen()));
}
