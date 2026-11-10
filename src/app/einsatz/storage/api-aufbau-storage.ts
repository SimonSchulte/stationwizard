import { Injectable, inject } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import { Aufbau, AufbauVorlage, AufbauVorlageKopf } from '../models/aufbau.model';
import { istAufbau, istAufbauVorlage, istAufbauVorlageKopf } from '../services/aufbau-pruefung';
import { AufbauStorage, AufbauVorlagenStorage } from './aufbau-storage';
import { EinsatzplanungAbrufPuffer } from './einsatzplanung-abruf-puffer';
import {
  EINSATZPLANUNG_BASIS,
  ladeEinzeln,
  ladeListe,
  loesche,
  schreibe,
} from './einsatzplanung-api';
import { MitVersion } from './mit-version';

@Injectable({ providedIn: 'root' })
export class ApiAufbauStorage implements AufbauStorage {
  readonly bezeichnung = 'Aufbau (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(EinsatzplanungAbrufPuffer);

  private pfad(einsatzId: string): string {
    return `${EINSATZPLANUNG_BASIS}/einsaetze/${einsatzId}/aufbau`;
  }

  ladeAufbau(einsatzId: string): Promise<MitVersion<Aufbau> | null> {
    return ladeEinzeln(this.worker, this.pfad(einsatzId), istAufbau, 'den Aufbau');
  }

  async legeAufbauAn(einsatzId: string, aufbau: Aufbau): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        this.pfad(einsatzId),
        'PUT',
        { ifNoneMatch: true },
        aufbau,
        'Der Aufbau',
      );
    } finally {
      // Die Einsatzliste trägt die Kennzahlen des Aufbaus.
      this.puffer.verwerfenEinsaetze();
    }
  }

  async speichereAufbau(einsatzId: string, aufbau: Aufbau, version: string): Promise<string> {
    try {
      return await schreibe(
        this.worker,
        this.pfad(einsatzId),
        'PUT',
        { ifMatch: version },
        aufbau,
        'Der Aufbau',
      );
    } finally {
      this.puffer.verwerfenEinsaetze();
    }
  }

  async loescheAufbau(einsatzId: string, version: string): Promise<void> {
    try {
      await loesche(this.worker, this.pfad(einsatzId), version, 'Der Aufbau');
    } finally {
      this.puffer.verwerfenEinsaetze();
    }
  }
}

@Injectable({ providedIn: 'root' })
export class ApiAufbauVorlagenStorage implements AufbauVorlagenStorage {
  readonly bezeichnung = 'Aufbau-Vorlagen (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(EinsatzplanungAbrufPuffer);
  private readonly pfad = `${EINSATZPLANUNG_BASIS}/aufbau-vorlagen`;

  ladeVorlagen(): Promise<AufbauVorlageKopf[]> {
    return this.puffer.aufbauVorlagen.hole('alle', () =>
      ladeListe(this.worker, this.pfad, 'vorlagen', istAufbauVorlageKopf),
    );
  }

  ladeVorlage(id: string): Promise<MitVersion<AufbauVorlage> | null> {
    return ladeEinzeln(this.worker, `${this.pfad}/${id}`, istAufbauVorlage, 'die Vorlage');
  }

  async legeVorlageAn(vorlage: AufbauVorlage): Promise<string> {
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
      this.puffer.verwerfenAufbauVorlagen();
    }
  }

  async speichereVorlage(vorlage: AufbauVorlage, version: string): Promise<string> {
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
      this.puffer.verwerfenAufbauVorlagen();
    }
  }

  async loescheVorlage(id: string, version: string): Promise<void> {
    try {
      await loesche(this.worker, `${this.pfad}/${id}`, version, 'Die Vorlage');
    } finally {
      this.puffer.verwerfenAufbauVorlagen();
    }
  }
}
