import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CheckSeite } from './check-seite';
import { MeldungSeite } from './meldung-seite';
import { checkTokenAusPfad } from './pfad';

/**
 * Hülle des zweiten Build-Ziels: entscheidet anhand des Pfades, welche der
 * beiden öffentlichen Seiten erscheint.
 *
 * Bewusst **kein** Router und kein `import()`-Splitting. Das Ziel läuft mit
 * `outputHashing: none`, damit die Dateinamen feststehen und der Worker sie
 * über eine feste Erlaubnisliste ausliefern kann; ein Lazy-Chunk bekäme einen
 * Namen, den diese Liste nicht kennt, und liefe in die SPA-Rückfallebene.
 * Preis dafür ist, dass jede Seite den Code der anderen mitlädt – bei zwei
 * kleinen Seiten ohne Angular Material ist das der bessere Handel als eine
 * zweite Erlaubnisliste.
 */
@Component({
  selector: 'oeff-seite',
  imports: [CheckSeite, MeldungSeite],
  template: `
    @if (istCheck) {
      <oeff-check />
    } @else {
      <oeff-meldung />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OeffentlicheSeite {
  readonly istCheck = checkTokenAusPfad(location.pathname) !== null;

  constructor() {
    document.title = this.istCheck ? 'Material prüfen' : 'Kilometerstand melden';
  }
}
