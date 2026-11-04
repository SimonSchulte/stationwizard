import { Injectable, inject } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import { Vorbereitung } from '../models/vb.model';
import { istVorbereitung } from '../services/vb-pruefung';
import { EINSATZPLANUNG_BASIS, ladeEinzeln, loesche, schreibe } from './einsatzplanung-api';
import { EinsatzplanungAbrufPuffer } from './einsatzplanung-abruf-puffer';
import { MitVersion } from './mit-version';
import { VorbereitungStorage } from './vorbereitung-storage';

@Injectable({ providedIn: 'root' })
export class ApiVorbereitungStorage implements VorbereitungStorage {
  readonly bezeichnung = 'Vorbereitung (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(EinsatzplanungAbrufPuffer);

  private pfad(einsatzId: string): string {
    return `${EINSATZPLANUNG_BASIS}/einsaetze/${einsatzId}/vb`;
  }

  ladeVorbereitung(einsatzId: string): Promise<MitVersion<Vorbereitung> | null> {
    return ladeEinzeln(this.worker, this.pfad(einsatzId), istVorbereitung, 'die Vorbereitung');
  }

  async legeVorbereitungAn(einsatzId: string, vorbereitung: Vorbereitung): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        this.pfad(einsatzId),
        'PUT',
        { ifNoneMatch: true },
        vorbereitung,
        'Die Vorbereitung',
      );
    } finally {
      // Die Einsatzliste trägt die VB-Kennzahlen.
      this.puffer.verwerfenEinsaetze();
    }
  }

  async speichereVorbereitung(
    einsatzId: string,
    vorbereitung: Vorbereitung,
    version: string,
  ): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        this.pfad(einsatzId),
        'PUT',
        { ifMatch: version },
        vorbereitung,
        'Die Vorbereitung',
      );
    } finally {
      this.puffer.verwerfenEinsaetze();
    }
  }

  async loescheVorbereitung(einsatzId: string, version: string): Promise<void> {
    try {
      await loesche(this.worker, this.pfad(einsatzId), version, 'Die Vorbereitung');
    } finally {
      this.puffer.verwerfenEinsaetze();
    }
  }
}
