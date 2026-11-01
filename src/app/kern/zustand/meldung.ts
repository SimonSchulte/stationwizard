import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterEveryRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { MeldungArt } from './meldung-art';
import { MeldungsDienst, type MeldungsGriff } from './meldungs-dienst';

function einzeilig(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Deklarative Brücke zur Snackbar: steht `<app-meldung>` im Template, gibt der
 * `MeldungsDienst` ihren Text als Material-Snackbar aus; verschwindet sie (Zustand behoben,
 * Seite verlassen), schließt sich die Snackbar, ändert sich der Text, wird sie ersetzt. Selbst
 * zeigt die Komponente nichts an.
 *
 * Eine mit `meldungAktion` markierte Schaltfläche wird zur Aktion der Snackbar; deren
 * Beschriftung übernimmt die Snackbar, ein Klick löst die Schaltfläche aus. `geschlossen`
 * meldet, dass die Person die Meldung selbst geschlossen hat (etwa um eine Rückmeldung zu
 * verwerfen).
 */
@Component({
  selector: 'app-meldung',
  templateUrl: './meldung.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { hidden: '' },
})
export class Meldung {
  private readonly dienst = inject(MeldungsDienst);
  private readonly inhalt = viewChild.required<ElementRef<HTMLElement>>('inhalt');
  private readonly aktion = viewChild.required<ElementRef<HTMLElement>>('aktion');

  readonly art = input<MeldungArt>('info');
  readonly geschlossen = output<void>();

  private griff: MeldungsGriff | null = null;
  private zuletzt = '';

  constructor() {
    afterEveryRender({ read: () => this.abgleichen() });
    inject(DestroyRef).onDestroy(() => this.griff?.schliessen());
  }

  private abgleichen(): void {
    const text = einzeilig(this.inhalt().nativeElement.textContent);
    const knopf = this.aktion().nativeElement.querySelector<HTMLElement>('button, a');
    const aktionText = knopf ? einzeilig(knopf.textContent) : '';
    const schluessel = `${this.art()}|${text}|${aktionText}`;
    if (!text || schluessel === this.zuletzt) return;
    this.zuletzt = schluessel;
    this.griff?.schliessen();
    this.griff = this.dienst.zeige(this.art(), text, {
      aktion: aktionText || undefined,
      // Nach der Aktion darf derselbe Text erneut erscheinen, etwa wenn ein zweiter Versuch
      // mit demselben Fehler scheitert.
      beiAktion: knopf
        ? () => {
            this.zuletzt = '';
            knopf.click();
          }
        : undefined,
      beiSchliessen: () => this.geschlossen.emit(),
    });
  }
}
