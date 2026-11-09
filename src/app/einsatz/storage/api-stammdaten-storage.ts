import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import {
  Artikel,
  ArtikelEingabe,
  Kiste,
  KisteEingabe,
  Lager,
  LagerEingabe,
} from '../models/stammdaten.model';
import { istArtikel, istKiste, istLager } from '../services/stammdaten-pruefung';
import { StammdatenAbrufPuffer } from './stammdaten-abruf-puffer';
import {
  StammdatenInNutzungFehler,
  StammdatenKonfliktFehler,
  StammdatenNameVergebenFehler,
  StammdatenStorage,
} from './stammdaten-storage';

const LAGER_PFAD = '/api/einsatzplanung/lager';
const ARTIKEL_PFAD = '/api/einsatzplanung/artikel';
const KISTEN_PFAD = '/api/einsatzplanung/kisten';

/**
 * Adapter gegen die Stammdaten-Endpunkte der Einsatzplanung. Prüft jede Antwort, bevor sie an die
 * Fachschicht geht, und übersetzt 412, `EINSATZPLANUNG_NAME_VERGEBEN` und
 * `EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG` in eigene Fehlertypen. Listen kommen in einem Aufruf
 * und werden gepuffert, jeder eigene Schreibzugriff verwirft den Puffer.
 */
@Injectable({ providedIn: 'root' })
export class ApiStammdatenStorage implements StammdatenStorage {
  readonly bezeichnung = 'Stammdaten (Worker/D1)';

  private readonly worker = inject(WorkerClient);
  private readonly puffer = inject(StammdatenAbrufPuffer);

  async ladeLager(): Promise<Lager[]> {
    return this.puffer.lager.hole('alle', async () => {
      const antwort = await this.worker.json<{ lager?: unknown }>(LAGER_PFAD);
      return Array.isArray(antwort.lager) ? antwort.lager.filter(istLager) : [];
    });
  }

  async speichereLager(eingabe: LagerEingabe, version: number | null): Promise<Lager> {
    const antwort = await this.schreiben(
      version === null ? LAGER_PFAD : `${LAGER_PFAD}/${eingabe.id}`,
      eingabe,
      version,
      'lager',
    );
    if (!istLager(antwort)) throw ungueltigeAntwort('Lager');
    return antwort;
  }

  async loescheLager(id: string, version: number): Promise<void> {
    await this.loeschen(`${LAGER_PFAD}/${id}`, version, 'lager');
  }

  async setzeLagerReihenfolge(ids: readonly string[]): Promise<Lager[]> {
    try {
      const antwort = await this.worker.json<{ lager?: unknown }>(`${LAGER_PFAD}/reihenfolge`, {
        method: 'PUT',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ids }),
      });
      this.puffer.verwerfen();
      return Array.isArray(antwort.lager) ? antwort.lager.filter(istLager) : [];
    } catch (ursache) {
      throw uebersetze(ursache, 'lager');
    }
  }

  async ladeArtikel(): Promise<Artikel[]> {
    return this.puffer.artikel.hole('alle', async () => {
      const antwort = await this.worker.json<{ artikel?: unknown }>(ARTIKEL_PFAD);
      return Array.isArray(antwort.artikel) ? antwort.artikel.filter(istArtikel) : [];
    });
  }

  async speichereArtikel(eingabe: ArtikelEingabe, version: number | null): Promise<Artikel> {
    const antwort = await this.schreiben(
      version === null ? ARTIKEL_PFAD : `${ARTIKEL_PFAD}/${eingabe.id}`,
      eingabe,
      version,
      'artikel',
    );
    if (!istArtikel(antwort)) throw ungueltigeAntwort('Artikel');
    return antwort;
  }

  async loescheArtikel(id: string, version: number): Promise<void> {
    await this.loeschen(`${ARTIKEL_PFAD}/${id}`, version, 'artikel');
  }

  async ladeKisten(): Promise<Kiste[]> {
    return this.puffer.kisten.hole('alle', async () => {
      const antwort = await this.worker.json<{ kisten?: unknown }>(KISTEN_PFAD);
      return Array.isArray(antwort.kisten) ? antwort.kisten.filter(istKiste) : [];
    });
  }

  async speichereKiste(eingabe: KisteEingabe, version: number | null): Promise<Kiste> {
    const antwort = await this.schreiben(
      version === null ? KISTEN_PFAD : `${KISTEN_PFAD}/${eingabe.id}`,
      eingabe,
      version,
      'kiste',
    );
    if (!istKiste(antwort)) throw ungueltigeAntwort('Kiste');
    return antwort;
  }

  async loescheKiste(id: string, version: number): Promise<void> {
    await this.loeschen(`${KISTEN_PFAD}/${id}`, version, 'kiste');
  }

  private async schreiben(
    pfad: string,
    eingabe: LagerEingabe | ArtikelEingabe | KisteEingabe,
    version: number | null,
    art: 'lager' | 'artikel' | 'kiste',
  ): Promise<unknown> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (version === null) headers.set('If-None-Match', '*');
    else headers.set('If-Match', `"${version}"`);
    try {
      const antwort = await this.worker.json<unknown>(pfad, {
        method: version === null ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(eingabe),
      });
      this.puffer.verwerfen();
      return antwort;
    } catch (ursache) {
      throw uebersetze(ursache, art);
    }
  }

  private async loeschen(
    pfad: string,
    version: number,
    art: 'lager' | 'artikel' | 'kiste',
  ): Promise<void> {
    try {
      await this.worker.anfragen(pfad, {
        method: 'DELETE',
        headers: new Headers({ 'If-Match': `"${version}"` }),
      });
      this.puffer.verwerfen();
    } catch (ursache) {
      throw uebersetze(ursache, art);
    }
  }
}

function ungueltigeAntwort(was: string): WorkerFehler {
  return new WorkerFehler(`Der Server hat ein ungültiges ${was} geliefert.`, 502);
}

function uebersetze(ursache: unknown, art: 'lager' | 'artikel' | 'kiste'): unknown {
  if (!(ursache instanceof WorkerFehler)) return ursache;
  if (ursache.status === 412) return new StammdatenKonfliktFehler();
  if (ursache.diagnose === 'EINSATZPLANUNG_NAME_VERGEBEN') {
    return new StammdatenNameVergebenFehler(art);
  }
  if (ursache.diagnose === 'EINSATZPLANUNG_STAMMDATEN_IN_NUTZUNG') {
    return new StammdatenInNutzungFehler(art === 'artikel' ? 'artikel' : 'lager');
  }
  return ursache;
}
