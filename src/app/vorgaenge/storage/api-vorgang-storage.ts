import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { SchadensmeldungInhalt } from '../models/schadensmeldung.model';
import {
  AufgabeUnterschrift,
  Slot,
  VorgangListenEintrag,
  VorgangMitVersion,
  istVorgangListenEintrag,
  leseAufgabeUnterschrift,
  leseVorgangsdarstellung,
} from '../models/vorgang.model';

const PFAD = '/api/vorgaenge';

/** Die API der Vorgänge; prüft jede Antwort, bevor sie an die Fachschicht geht. */
@Injectable({ providedIn: 'root' })
export class ApiVorgangStorage {
  private readonly worker = inject(WorkerClient);

  async liste(): Promise<VorgangListenEintrag[]> {
    const antwort = await this.worker.json<{ vorgaenge?: unknown }>(PFAD);
    if (!Array.isArray(antwort.vorgaenge)) throw ungueltigeAntwort();
    return antwort.vorgaenge.filter(istVorgangListenEintrag);
  }

  async lade(id: string): Promise<VorgangMitVersion> {
    return this.mitVersion(await this.worker.anfragen(`${PFAD}/${encodeURIComponent(id)}`));
  }

  async lege(
    fahrzeugId: string,
    titel: string,
    meldung: SchadensmeldungInhalt,
  ): Promise<VorgangMitVersion> {
    return this.mitVersion(
      await this.worker.anfragen(PFAD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
        body: JSON.stringify({ fahrzeugId, titel, meldung }),
      }),
    );
  }

  async speichereMeldung(
    id: string,
    inhalt: SchadensmeldungInhalt,
    meldungVersion: number,
  ): Promise<VorgangMitVersion> {
    return this.mitVersion(
      await this.worker.anfragen(`${PFAD}/${encodeURIComponent(id)}/meldung`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': `"${meldungVersion}"` },
        body: JSON.stringify(inhalt),
      }),
    );
  }

  async unterschreibe(id: string, slot: Slot): Promise<VorgangMitVersion> {
    return this.slotAnfrage(id, slot, { aktion: 'unterschreiben' });
  }

  async fordereAn(id: string, slot: Slot, an: string): Promise<VorgangMitVersion> {
    return this.slotAnfrage(id, slot, { aktion: 'anfordern', an });
  }

  async entferneUnterschrift(id: string, slot: Slot): Promise<VorgangMitVersion> {
    return this.mitVersion(
      await this.worker.anfragen(
        `${PFAD}/${encodeURIComponent(id)}/meldung/unterschriften/${slot}`,
        {
          method: 'DELETE',
        },
      ),
    );
  }

  async entferneAlleUnterschriften(id: string): Promise<VorgangMitVersion> {
    return this.mitVersion(
      await this.worker.anfragen(`${PFAD}/${encodeURIComponent(id)}/meldung/unterschriften`, {
        method: 'DELETE',
      }),
    );
  }

  async wechsleStufe(id: string, nach: number, version: string): Promise<VorgangMitVersion> {
    return this.mitVersion(
      await this.worker.anfragen(`${PFAD}/${encodeURIComponent(id)}/stufe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-Match': version },
        body: JSON.stringify({ nach }),
      }),
    );
  }

  async aufgaben(): Promise<AufgabeUnterschrift[]> {
    const antwort = await this.worker.json<{ unterschriften?: unknown }>(`${PFAD}/aufgaben`);
    if (!Array.isArray(antwort.unterschriften)) throw ungueltigeAntwort();
    return antwort.unterschriften
      .map(leseAufgabeUnterschrift)
      .filter((a): a is AufgabeUnterschrift => a !== null);
  }

  private async slotAnfrage(id: string, slot: Slot, koerper: unknown): Promise<VorgangMitVersion> {
    return this.mitVersion(
      await this.worker.anfragen(
        `${PFAD}/${encodeURIComponent(id)}/meldung/unterschriften/${slot}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(koerper),
        },
      ),
    );
  }

  private async mitVersion(antwort: Response): Promise<VorgangMitVersion> {
    if (!antwort.headers.get('Content-Type')?.includes('application/json'))
      throw ungueltigeAntwort();
    const daten = leseVorgangsdarstellung(await antwort.json().catch(() => null));
    const version = antwort.headers.get('ETag');
    if (!daten || !version) throw ungueltigeAntwort();
    return { daten, version };
  }
}

function ungueltigeAntwort(): WorkerFehler {
  return new WorkerFehler('Der Server hat keine gültige Antwort zu den Vorgängen geliefert.', 502);
}
