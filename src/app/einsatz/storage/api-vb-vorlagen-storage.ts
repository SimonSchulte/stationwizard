import { Injectable, inject } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import { VbVorlage, VbVorlageKopf } from '../models/vb.model';
import { istVbVorlage, istVbVorlageKopf } from '../services/vb-pruefung';
import {
  EINSATZPLANUNG_BASIS,
  ladeEinzeln,
  ladeListe,
  loesche,
  schreibe,
} from './einsatzplanung-api';
import { EinsatzplanungAbrufPuffer } from './einsatzplanung-abruf-puffer';
import { MitVersion } from './mit-version';
import { VbVorlagenStorage } from './vb-vorlagen-storage';

@Injectable({ providedIn: 'root' })
export class ApiVbVorlagenStorage implements VbVorlagenStorage {
  readonly bezeichnung = 'VB-Vorlagen (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(EinsatzplanungAbrufPuffer);
  private readonly pfad = `${EINSATZPLANUNG_BASIS}/vb-vorlagen`;

  ladeVorlagen(): Promise<VbVorlageKopf[]> {
    return this.puffer.vorlagen.hole('alle', () =>
      ladeListe(this.worker, this.pfad, 'vorlagen', istVbVorlageKopf),
    );
  }

  ladeVorlage(id: string): Promise<MitVersion<VbVorlage> | null> {
    return ladeEinzeln(this.worker, `${this.pfad}/${id}`, istVbVorlage, 'die Vorlage');
  }

  async legeVorlageAn(vorlage: VbVorlage): Promise<string> {
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
      this.puffer.verwerfenVorlagen();
    }
  }

  async speichereVorlage(vorlage: VbVorlage, version: string): Promise<string> {
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
      this.puffer.verwerfenVorlagen();
    }
  }

  async loescheVorlage(id: string, version: string): Promise<void> {
    try {
      await loesche(this.worker, `${this.pfad}/${id}`, version, 'Die Vorlage');
    } finally {
      this.puffer.verwerfenVorlagen();
    }
  }
}
