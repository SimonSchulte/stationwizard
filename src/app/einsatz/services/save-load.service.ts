import { Injectable, inject } from '@angular/core';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { Planung } from '../models/planung.model';
import { formatiereTaktischeZeit } from '../../kern/kalender/taktische-zeit';
import { dateiHerunterladen } from '../../kern/storage/datei-storage';
import { JsonDateiStorage } from './json-datei-storage';

import { lesePepDatei, serialisierePepDatei } from './pep-datei';

@Injectable({ providedIn: 'root' })
export class SaveLoadService {
  private readonly dialogDienst = inject(DialogDienst);
  save(planung: Planung): void {
    const json = serialisierePepDatei(planung);
    dateiHerunterladen(
      json,
      `${planung.name}_${formatiereTaktischeZeit(new Date())}.pep.json`,
      'application/json',
    );
  }

  load(): Promise<{ planung: Planung; versionWarning: boolean } | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.pep.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const inhalt = await new JsonDateiStorage(file).laden();
          resolve(lesePepDatei(new TextDecoder().decode(inhalt.daten)));
        } catch (fehler) {
          await this.dialogDienst.hinweis(
            fehler instanceof Error ? fehler.message : 'Die Datei konnte nicht gelesen werden.',
          );
          resolve(null);
        }
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
}
