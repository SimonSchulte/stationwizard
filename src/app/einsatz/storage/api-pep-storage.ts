import { Injectable, inject } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import { Pep } from '../models/pep.model';
import { istPep } from '../services/pep-pruefung';
import { EINSATZPLANUNG_BASIS, ladeEinzeln, loesche, schreibe } from './einsatzplanung-api';
import { EinsatzplanungAbrufPuffer } from './einsatzplanung-abruf-puffer';
import { MitVersion } from './mit-version';
import { PepStorage } from './pep-storage';

@Injectable({ providedIn: 'root' })
export class ApiPepStorage implements PepStorage {
  readonly bezeichnung = 'PEP (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(EinsatzplanungAbrufPuffer);

  private pfad(einsatzId: string): string {
    return `${EINSATZPLANUNG_BASIS}/einsaetze/${einsatzId}/pep`;
  }

  ladePep(einsatzId: string): Promise<MitVersion<Pep> | null> {
    return ladeEinzeln(this.worker, this.pfad(einsatzId), istPep, 'die PEP');
  }

  async legePepAn(einsatzId: string, pep: Pep): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        this.pfad(einsatzId),
        'PUT',
        { ifNoneMatch: true },
        pep,
        'Die PEP',
      );
    } finally {
      // Die Einsatzliste trägt die PEP-Kennzahlen.
      this.puffer.verwerfenEinsaetze();
    }
  }

  async speicherePep(einsatzId: string, pep: Pep, version: string): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        this.pfad(einsatzId),
        'PUT',
        { ifMatch: version },
        pep,
        'Die PEP',
      );
    } finally {
      this.puffer.verwerfenEinsaetze();
    }
  }

  async loeschePep(einsatzId: string, version: string): Promise<void> {
    try {
      await loesche(this.worker, this.pfad(einsatzId), version, 'Die PEP');
    } finally {
      this.puffer.verwerfenEinsaetze();
    }
  }
}
