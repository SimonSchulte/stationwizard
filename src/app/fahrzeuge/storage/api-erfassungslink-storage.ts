import { inject, Injectable } from '@angular/core';
import { istObjekt, istText } from '../../kern/text/pruefung';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { FreigabeVerweigertFehler } from './einreichung-storage';
import {
  Erfassungslink,
  ErfassungslinkMitFahrzeug,
  ErfassungslinkStorage,
} from './erfassungslink-storage';

interface LinkListenAntwort {
  links: unknown[];
}

function istLink(wert: unknown): wert is Erfassungslink {
  if (!istObjekt(wert)) return false;
  return (
    istText(wert['fahrzeugId']) &&
    (wert['token'] === null || (istText(wert['token']) && wert['token'].length > 0))
  );
}

function istLinkMitFahrzeug(wert: unknown): wert is ErfassungslinkMitFahrzeug {
  return (
    istLink(wert) &&
    istObjekt(wert) &&
    istText(wert['bezeichnung']) &&
    istText(wert['funkrufname']) &&
    istText(wert['kennzeichen'])
  );
}

/** Adapter gegen die Erfassungslink-Endpunkte. */
@Injectable({ providedIn: 'root' })
export class ApiErfassungslinkStorage implements ErfassungslinkStorage {
  private readonly worker = inject(WorkerClient);

  async ladeLink(fahrzeugId: string): Promise<Erfassungslink> {
    const antwort = await this.worker.json<unknown>(`/api/fahrzeuge/${fahrzeugId}/erfassungslink`);
    if (!istLink(antwort)) {
      throw new WorkerFehler('Der Server hat einen ungültigen Erfassungslink geliefert.', 502);
    }
    return antwort;
  }

  async ladeLinks(): Promise<ErfassungslinkMitFahrzeug[]> {
    const antwort = await this.worker.json<LinkListenAntwort>('/api/fahrzeuge/erfassungslinks');
    return antwort.links.filter(istLinkMitFahrzeug);
  }

  async erneuere(fahrzeugId: string): Promise<Erfassungslink> {
    try {
      const antwort = await this.worker.json<unknown>(
        `/api/fahrzeuge/${fahrzeugId}/erfassungslink`,
        { method: 'POST' },
      );
      if (!istLink(antwort)) {
        throw new WorkerFehler('Der Server hat einen ungültigen Erfassungslink geliefert.', 502);
      }
      return antwort;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 403) {
        throw new FreigabeVerweigertFehler(
          'Den QR-Code darf nur die Zugführung oder die Gruppenführung des Fahrzeugs erneuern.',
        );
      }
      throw ursache;
    }
  }
}
