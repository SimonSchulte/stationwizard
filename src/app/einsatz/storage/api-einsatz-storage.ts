import { Injectable, inject } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import { Einsatz, EinsatzListenEintrag } from '../models/einsatz.model';
import { istEinsatz, istEinsatzListenEintrag } from '../services/vb-pruefung';
import { EinsatzStorage } from './einsatz-storage';
import { EINSATZPLANUNG_BASIS, ladeEinzeln, ladeListe, schreibe } from './einsatzplanung-api';
import { EinsatzplanungAbrufPuffer } from './einsatzplanung-abruf-puffer';
import { MitVersion } from './mit-version';

@Injectable({ providedIn: 'root' })
export class ApiEinsatzStorage implements EinsatzStorage {
  readonly bezeichnung = 'Einsatzplanung (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(EinsatzplanungAbrufPuffer);
  private readonly pfad = `${EINSATZPLANUNG_BASIS}/einsaetze`;

  ladeEinsaetze(): Promise<EinsatzListenEintrag[]> {
    return this.puffer.einsaetze.hole('alle', () =>
      ladeListe(this.worker, this.pfad, 'einsaetze', istEinsatzListenEintrag),
    );
  }

  ladeEinsatz(id: string): Promise<MitVersion<Einsatz> | null> {
    return ladeEinzeln(this.worker, `${this.pfad}/${id}`, istEinsatz, 'den Einsatz');
  }

  async legeEinsatzAn(einsatz: Einsatz): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        this.pfad,
        'POST',
        { ifNoneMatch: true },
        einsatz,
        'Der Einsatz',
      );
    } finally {
      this.puffer.verwerfenEinsaetze();
    }
  }

  async speichereEinsatz(einsatz: Einsatz, version: string): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        `${this.pfad}/${einsatz.id}`,
        'PUT',
        { ifMatch: version },
        einsatz,
        'Der Einsatz',
      );
    } finally {
      this.puffer.verwerfenEinsaetze();
    }
  }
}
