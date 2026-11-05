import { Injectable, inject } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import { PepVorlage, PepVorlageKopf } from '../models/pep.model';
import { istPepVorlage, istPepVorlageKopf } from '../services/pep-pruefung';
import {
  EINSATZPLANUNG_BASIS,
  ladeEinzeln,
  ladeListe,
  loesche,
  schreibe,
} from './einsatzplanung-api';
import { EinsatzplanungAbrufPuffer } from './einsatzplanung-abruf-puffer';
import { MitVersion } from './mit-version';
import { PepVorlagenStorage } from './pep-vorlagen-storage';

@Injectable({ providedIn: 'root' })
export class ApiPepVorlagenStorage implements PepVorlagenStorage {
  readonly bezeichnung = 'PEP-Vorlagen (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(EinsatzplanungAbrufPuffer);
  private readonly pfad = `${EINSATZPLANUNG_BASIS}/pep-vorlagen`;

  ladeVorlagen(): Promise<PepVorlageKopf[]> {
    return this.puffer.pepVorlagen.hole('alle', () =>
      ladeListe(this.worker, this.pfad, 'vorlagen', istPepVorlageKopf),
    );
  }

  ladeVorlage(id: string): Promise<MitVersion<PepVorlage> | null> {
    return ladeEinzeln(this.worker, `${this.pfad}/${id}`, istPepVorlage, 'die Vorlage');
  }

  async legeVorlageAn(vorlage: PepVorlage): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        this.pfad,
        'POST',
        { ifNoneMatch: true },
        vorlage,
        'Die Vorlage',
      );
    } finally {
      this.puffer.verwerfenPepVorlagen();
    }
  }

  async speichereVorlage(vorlage: PepVorlage, version: string): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        `${this.pfad}/${vorlage.id}`,
        'PUT',
        { ifMatch: version },
        vorlage,
        'Die Vorlage',
      );
    } finally {
      this.puffer.verwerfenPepVorlagen();
    }
  }

  async loescheVorlage(id: string, version: string): Promise<void> {
    try {
      await loesche(this.worker, `${this.pfad}/${id}`, version, 'Die Vorlage');
    } finally {
      this.puffer.verwerfenPepVorlagen();
    }
  }
}
