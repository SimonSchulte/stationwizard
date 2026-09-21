import { Injectable, inject } from '@angular/core';
import { Aufgabe, Aufgabenquelle } from '../../kern/aufgaben/aufgabenquelle';
import { ApiEinreichungStorage } from '../storage/api-einreichung-storage';

/**
 * Meldet offene Fahrzeugcheck-Einreichungen an „Offene Aufgaben".
 *
 * Bewusst schlank: die Quelle zieht nur den Speicheradapter nach, keine Seite –
 * sie wird beim Start der Anwendung mitgeladen.
 */
@Injectable({ providedIn: 'root' })
export class CheckAufgabenquelle implements Aufgabenquelle {
  readonly kennung = 'material-fahrzeugcheck';
  readonly bezeichnung = 'Fahrzeugchecks';

  private readonly storage = inject(ApiEinreichungStorage);

  async ladeAufgaben(): Promise<Aufgabe[]> {
    const offene = await this.storage.ladeOffene();
    return offene.map((eintrag) => {
      const befunde = [
        eintrag.fehlmengen ? `${eintrag.fehlmengen} Fehlmengen` : '',
        eintrag.unbrauchbar ? `${eintrag.unbrauchbar} unbrauchbar` : '',
        eintrag.abgelaufen ? `${eintrag.abgelaufen} abgelaufen` : '',
      ].filter(Boolean);
      return {
        id: `${this.kennung}:${eintrag.id}`,
        quelle: this.kennung,
        titel: `${eintrag.behaelterBezeichnung} · ${eintrag.fahrzeugBezeichnung}`,
        beschreibung:
          `${eintrag.positionenGeprueft} von ${eintrag.positionenGesamt} Positionen geprüft` +
          (befunde.length ? ` · ${befunde.join(' · ')}` : '') +
          ` · gemeldet von ${eintrag.eingereichtVonName}`,
        eingegangenAm: eintrag.eingereichtAm,
        routerLink: ['/aufgaben/fahrzeugchecks'],
        // Abweichungen verdienen eine genauere Durchsicht vor der Freigabe.
        dringlichkeit: befunde.length > 0 ? 'hinweis' : 'normal',
      };
    });
  }
}
