import { Injectable } from '@angular/core';
import { Planung, PepFile } from '../models/planung.model';
import { formatTaktischeZeit } from '../utils/taktische-zeit';
import { dateiHerunterladen } from '../../kern/storage/datei-storage';
import { JsonDateiStorage } from './json-datei-storage';

const CURRENT_VERSION = '1.0';

@Injectable({ providedIn: 'root' })
export class SaveLoadService {
  save(planung: Planung): void {
    const pepFile: PepFile = {
      version: CURRENT_VERSION,
      meta: {
        exportedAt: new Date().toISOString(),
        taktischeZeit: formatTaktischeZeit(new Date()),
        locale: 'de-DE',
      },
      planung,
    };
    const json = JSON.stringify(pepFile, null, 2);
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
          const pepFile: PepFile = JSON.parse(new TextDecoder().decode(inhalt.daten));
          const versionWarning = pepFile.version !== CURRENT_VERSION;
          resolve({ planung: pepFile.planung, versionWarning });
        } catch {
          resolve(null);
        }
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
}
