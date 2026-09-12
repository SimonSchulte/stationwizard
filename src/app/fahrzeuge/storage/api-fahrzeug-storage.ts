import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { AblesungEingabe, Fahrzeugstamm, Kilometerstand } from '../models/fahrzeug.model';
import { istFahrzeugstamm, istKilometerstand } from '../services/fahrzeug-pruefung';
import { FahrzeugKonfliktFehler, FahrzeugMitVersion, FahrzeugStorage } from './fahrzeug-storage';

interface FahrzeugListenAntwort {
  fahrzeuge: unknown[];
}

interface AblesungListenAntwort {
  ablesungen: unknown[];
}

/**
 * Adapter gegen die Worker-Routen aus AP-F2 (`/api/fahrzeuge`). Übersetzt
 * zwischen der Worker-JSON-Form und den Domänentypen an genau dieser Stelle;
 * die Fachschicht sieht nur `FahrzeugStorage`. `version` ist hier ein
 * HTTP-ETag als Zeichenkette – für die Fachschicht bleibt sie undurchsichtig.
 */
@Injectable({ providedIn: 'root' })
export class ApiFahrzeugStorage implements FahrzeugStorage {
  readonly bezeichnung = 'Fahrzeugverwaltung (Worker/D1)';

  private readonly worker = inject(WorkerClient);

  async ladeFahrzeuge(): Promise<Fahrzeugstamm[]> {
    const antwort = await this.worker.json<FahrzeugListenAntwort>('/api/fahrzeuge');
    return antwort.fahrzeuge.filter(istFahrzeugstamm);
  }

  async ladeFahrzeug(id: string): Promise<FahrzeugMitVersion | null> {
    try {
      const antwort = await this.worker.anfragen(`/api/fahrzeuge/${id}`);
      if (!antwort.headers.get('Content-Type')?.includes('application/json')) {
        throw new WorkerFehler('Der Server hat keine gültige API-Antwort geliefert.', 502);
      }
      let inhalt: unknown;
      try {
        inhalt = await antwort.json();
      } catch {
        throw new WorkerFehler('Die Serverantwort konnte nicht gelesen werden.', 502);
      }
      const version = antwort.headers.get('ETag');
      if (!istFahrzeugstamm(inhalt) || !version) {
        throw new WorkerFehler('Der Server hat ein ungültiges Fahrzeug geliefert.', 502);
      }
      return { daten: inhalt, version };
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 404) return null;
      throw ursache;
    }
  }

  async speichereFahrzeug(fahrzeug: Fahrzeugstamm, version: string | null): Promise<string> {
    const pfad = version === null ? '/api/fahrzeuge' : `/api/fahrzeuge/${fahrzeug.id}`;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (version === null) headers.set('If-None-Match', '*');
    else headers.set('If-Match', version);
    try {
      const antwort = await this.worker.anfragen(pfad, {
        method: version === null ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(fahrzeug),
      });
      const neueVersion = antwort.headers.get('ETag');
      if (!neueVersion) {
        throw new WorkerFehler('Der Server hat keine gültige Version geliefert.', 502);
      }
      return neueVersion;
    } catch (ursache) {
      if (ursache instanceof WorkerFehler && ursache.status === 412) {
        throw new FahrzeugKonfliktFehler(fahrzeug.id);
      }
      throw ursache;
    }
  }

  async ladeAblesungen(fahrzeugId: string, vonJahr?: number): Promise<Kilometerstand[]> {
    const antwort = await this.worker.json<AblesungListenAntwort>(
      `/api/fahrzeuge/${fahrzeugId}/ablesungen`,
    );
    const alle = antwort.ablesungen.filter(istKilometerstand);
    return vonJahr === undefined
      ? alle
      : alle.filter((a) => Number(a.abgelesenAm.slice(0, 4)) >= vonJahr);
  }

  async ergaenzeAblesung(eingabe: AblesungEingabe): Promise<Kilometerstand> {
    const antwort = await this.worker.json<unknown>(
      `/api/fahrzeuge/${eingabe.fahrzeugId}/ablesungen`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eingabe),
      },
    );
    if (!istKilometerstand(antwort)) {
      throw new WorkerFehler('Der Server hat eine ungültige Ablesung geliefert.', 502);
    }
    return antwort;
  }
}
