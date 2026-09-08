import { Injectable } from '@angular/core';
import { Planung } from '../models/planung.model';
import { formatTaktischeZeit } from '../utils/taktische-zeit';
import { dateiHerunterladen } from '../../kern/storage/datei-storage';
import { JsonDateiStorage } from './json-datei-storage';

import { lesePepDatei, serialisierePepDatei } from './pep-datei';

@Injectable({ providedIn: 'root' })
export class SaveLoadService {
  save(planung: Planung): void {
    const json = serialisierePepDatei(planung);
    dateiHerunterladen(
      json,
      `${planung.name}_${formatTaktischeZeit(new Date())}.pep.json`,
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
          window.alert(
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
