import { inject, Injectable } from '@angular/core';
import type { Aufgabe, Aufgabenquelle } from '../../kern/aufgaben/aufgabenquelle';
import { ApiEinreichungStorage } from '../storage/api-einreichung-storage';
import { pruefeAblesungPlausibilitaet } from './ablesung-pruefung';

/**
 * Meldet offene öffentliche Kilometermeldungen als Aufgaben an.
 *
 * Bewusst schlank: der Dienst wird in `app.config.ts` angemeldet und liegt
 * damit im Initialbündel. Er zieht nur den `WorkerClient` und zwei reine
 * Funktionen nach – keine Seite, kein `pdfmake`, kein `qrcode`.
 */
@Injectable({ providedIn: 'root' })
export class FahrzeugAufgabenquelle implements Aufgabenquelle {
  readonly kennung = 'fahrzeug-kilometermeldung';
  readonly bezeichnung = 'Kilometermeldungen';

  private readonly storage = inject(ApiEinreichungStorage);

  async ladeAufgaben(): Promise<Aufgabe[]> {
    const offene = await this.storage.ladeOffene();
    return offene.map((einreichung) => {
      // Derselbe Hinweis wie in der internen Erfassung; er warnt, blockiert
      // aber nicht – entscheiden soll die Führungskraft mit vollem Kontext.
      const hinweis =
        einreichung.letzterStand === null
          ? null
          : pruefeAblesungPlausibilitaet(einreichung.stand, { stand: einreichung.letzterStand });
      const fahrzeug = [einreichung.bezeichnung, einreichung.kennzeichen]
        .filter(Boolean)
        .join(' · ');
      return {
        id: `${this.kennung}:${einreichung.id}`,
        quelle: this.kennung,
        titel: `Kilometermeldung ${fahrzeug}`,
        beschreibung:
          `${einreichung.stand.toLocaleString('de-DE')} km, gemeldet von „${einreichung.gemeldetVonName}"` +
          (hinweis ? ' — Wert prüfen' : ''),
        eingegangenAm: einreichung.eingereichtAm,
        routerLink: ['/aufgaben', 'kilometermeldungen'],
        dringlichkeit: hinweis ? 'hinweis' : 'normal',
      };
    });
  }
}
