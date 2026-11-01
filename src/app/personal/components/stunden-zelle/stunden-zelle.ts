import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  VERGABEJAHR_MAXIMUM,
  VERGABEJAHR_MINIMUM,
  stundenLesen,
} from '../../services/ehrungen-regeln';

/** Stundenzahl mit zwei Nachkommastellen, deutsch formatiert. */
export function stundenAnzeige(stunden: number): string {
  return stunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Stunden einer Person: Importwert, wirksame Zahl, manueller Nachtrag und dessen Stand (Jahr).
 * Die größere der beiden Zahlen zählt (`wirksameStunden()`); die Zelle zeigt, welche. Unlesbare
 * Eingaben werden verworfen und als `fehler` gemeldet, die alte Anzeige bleibt stehen.
 */
@Component({
  selector: 'app-stunden-zelle',
  imports: [MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule],
  templateUrl: './stunden-zelle.html',
  styleUrl: './stunden-zelle.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StundenZelle {
  /** Für die Lesehilfe, etwa der Nachname. */
  readonly person = input.required<string>();
  readonly importiert = input.required<number>();
  readonly wirksam = input.required<number>();
  readonly manuell = input.required<number | null>();
  readonly stand = input.required<number | null>();

  readonly manuellGeaendert = output<number | null>();
  readonly standGeaendert = output<number | null>();
  /** Fehlertext für die Seite; leer, wenn eine Eingabe gültig war. */
  readonly fehler = output<string>();

  protected readonly jahrMinimum = VERGABEJAHR_MINIMUM;
  protected readonly jahrMaximum = VERGABEJAHR_MAXIMUM;
  protected readonly anzeige = stundenAnzeige;

  /** Welche der beiden Zahlen für die Berechnung zählt. */
  protected readonly zaehltManuell = computed(() => (this.manuell() ?? 0) > this.importiert());
  /** Ein manueller Nachtrag ohne Stand kann nicht gespeichert werden. */
  protected readonly standFehlt = computed(() => this.manuell() !== null && this.stand() === null);
  protected readonly manuellText = computed(() => {
    const manuell = this.manuell();
    return manuell === null ? '' : stundenAnzeige(manuell);
  });

  protected readonly importHinweis = computed(() => {
    const zahl = `${stundenAnzeige(this.importiert())} Stunden aus dem Import`;
    return this.zaehltManuell()
      ? `${zahl} – zählt nicht, der manuelle Nachtrag ist größer`
      : `${zahl} – diese Zahl zählt`;
  });

  protected readonly manuellHinweis = computed(() => {
    if (this.manuell() === null)
      return 'Stunden manuell nachtragen (die größere Zahl zählt, Stand/Jahr ist Pflicht)';
    const stand = this.stand() ? `Stand ${this.stand()}` : 'Stand fehlt';
    return this.zaehltManuell()
      ? `Manuell nachgetragen (${stand}) – diese Zahl zählt`
      : `Manuell nachgetragen (${stand}) – zählt nicht, der Import ist größer oder gleich`;
  });

  /** Nachtrag von Hand; leer entfernt ihn, Unlesbares wird verworfen und die alte Anzeige bleibt. */
  protected manuellUebernehmen(ereignis: Event): void {
    const feld = ereignis.target as HTMLInputElement;
    const text = feld.value.trim();
    const manuell = text === '' ? null : stundenLesen(text);
    if (text !== '' && manuell === null) {
      feld.value = this.manuellText();
      this.fehler.emit('Die Stundenzahl ist nicht lesbar. Erwartet wird zum Beispiel 1.250,5.');
      return;
    }
    this.fehler.emit('');
    this.manuellGeaendert.emit(manuell);
  }

  /** Pflichtangabe zum Nachtrag: das Jahr, für das die Stundenzahl gilt. */
  protected standUebernehmen(ereignis: Event): void {
    const feld = ereignis.target as HTMLInputElement;
    const text = feld.value.trim();
    const jahr = Number(text);
    const gueltig =
      text !== '' &&
      Number.isInteger(jahr) &&
      jahr >= VERGABEJAHR_MINIMUM &&
      jahr <= VERGABEJAHR_MAXIMUM;
    if (text !== '' && !gueltig) {
      feld.value = this.stand()?.toString() ?? '';
      this.fehler.emit(
        `Der Stand muss ein Jahr zwischen ${VERGABEJAHR_MINIMUM} und ${VERGABEJAHR_MAXIMUM} sein.`,
      );
      return;
    }
    this.fehler.emit('');
    this.standGeaendert.emit(gueltig ? jahr : null);
  }
}
