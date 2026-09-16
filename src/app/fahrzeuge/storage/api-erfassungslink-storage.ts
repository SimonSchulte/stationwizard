import { inject, Injectable } from '@angular/core';
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

function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

function istLink(wert: unknown): wert is Erfassungslink {
  if (typeof wert !== 'object' || wert === null) return false;
  const daten = wert as Record<string, unknown>;
  return (
    istText(daten['fahrzeugId']) &&
    (daten['token'] === null || (istText(daten['token']) && daten['token'].length > 0))
  );
}

function istLinkMitFahrzeug(wert: unknown): wert is ErfassungslinkMitFahrzeug {
  if (!istLink(wert)) return false;
  const daten = wert as unknown as Record<string, unknown>;
  return (
    istText(daten['bezeichnung']) && istText(daten['funkrufname']) && istText(daten['kennzeichen'])
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
