import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { CheckKopf, Fahrzeugcheck, Pruefauftrag } from '../models/check.model';
import { istCheckKopf, istFahrzeugcheck, istPruefauftrag } from '../services/check-pruefung';
import { CheckEingabe, CheckStorage, CheckUnschluessigFehler } from './check-storage';
import { MaterialAbrufPuffer } from './material-abruf-puffer';

@Injectable({ providedIn: 'root' })
export class ApiCheckStorage implements CheckStorage {
  readonly bezeichnung = 'Fahrzeugchecks (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(MaterialAbrufPuffer);

  async ladePruefauftrag(behaelterId: string): Promise<Pruefauftrag | null> {
    try {
      const inhalt = await this.worker.json<unknown>(
        `/api/material/behaelter/${behaelterId}/pruefauftrag`,
      );
      if (!istPruefauftrag(inhalt)) {
        throw new WorkerFehler('Der Server hat einen ungültigen Prüfauftrag geliefert.', 502);
      }
      return inhalt;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 404) return null;
      throw ursache;
    }
  }

  async ladeHistorie(behaelterId: string): Promise<CheckKopf[]> {
    const antwort = await this.worker.json<{ checks: unknown[] }>(
      `/api/material/behaelter/${behaelterId}/checks`,
    );
    return antwort.checks.filter(istCheckKopf);
  }

  async ladeCheck(id: string): Promise<Fahrzeugcheck | null> {
    try {
      const inhalt = await this.worker.json<unknown>(`/api/material/checks/${id}`);
      if (!istFahrzeugcheck(inhalt)) {
        throw new WorkerFehler('Der Server hat einen ungültigen Check geliefert.', 502);
      }
      return inhalt;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 404) return null;
      throw ursache;
    }
  }

  async reicheCheckEin(behaelterId: string, check: CheckEingabe): Promise<Fahrzeugcheck> {
    let antwort: Response;
    try {
      antwort = await this.worker.anfragen(`/api/material/behaelter/${behaelterId}/checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
        body: JSON.stringify(check),
      });
    } catch (ursache) {
      // 400 hat an diesem Endpunkt genau zwei Ursachen, und beide lassen sich
      // durch erneutes Senden nicht beheben.
      if (ursache instanceof WorkerFehler && ursache.status === 400) {
        throw new CheckUnschluessigFehler(ursache.message);
      }
      throw ursache;
    }
    const inhalt: unknown = await antwort.json();
    if (!istFahrzeugcheck(inhalt)) {
      throw new WorkerFehler('Der Server hat einen ungültigen Check geliefert.', 502);
    }
    // Ein neuer Check ändert auch die Behälterübersicht.
    this.puffer.verwerfen();
    return inhalt;
  }
}
