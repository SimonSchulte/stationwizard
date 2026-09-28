import { Injectable, inject } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import { CheckKopf, Checkstand, Fahrzeugcheck, Pruefauftrag } from '../models/check.model';
import { istCheckKopf, istFahrzeugcheck, istPruefauftrag } from '../services/check-pruefung';
import {
  Berichtsart,
  CheckEingabe,
  CheckStorage,
  CheckUnschluessigFehler,
  EmpfaengerFehltFehler,
  Versandbestaetigung,
} from './check-storage';
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

  async speichereEntwurf(behaelterId: string, stand: Checkstand): Promise<string> {
    // `behaelterId` steht im Pfad und ist der Schlüssel der Zeile; im Körper
    // wäre sie eine zweite, abweichbare Wahrheit.
    const antwort = await this.worker.json<{ gespeichertAm?: unknown }>(
      `/api/material/behaelter/${behaelterId}/entwurf`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verfallsdatumErfasst: stand.verfallsdatumErfasst,
          bemerkung: stand.bemerkung,
          positionen: stand.positionen,
        }),
      },
    );
    if (typeof antwort.gespeichertAm !== 'string') {
      throw new WorkerFehler('Der Server hat den Zwischenstand nicht bestätigt.', 502);
    }
    return antwort.gespeichertAm;
  }

  async loescheEntwurf(behaelterId: string): Promise<void> {
    await this.worker.anfragen(`/api/material/behaelter/${behaelterId}/entwurf`, {
      method: 'DELETE',
    });
  }

  async ladeBericht(checkId: string, art: Berichtsart): Promise<string> {
    const antwort = await this.worker.json<{ text?: unknown }>(
      `/api/material/checks/${checkId}/bericht/${art}`,
    );
    if (typeof antwort.text !== 'string') {
      throw new WorkerFehler('Der Server hat keinen gültigen Bericht geliefert.', 502);
    }
    return antwort.text;
  }

  async sendeBericht(
    checkId: string,
    art: Berichtsart,
    empfaenger: string,
  ): Promise<Versandbestaetigung> {
    try {
      const antwort = await this.worker.anfragen(
        `/api/material/checks/${checkId}/bericht/${art}/senden`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empfaenger }),
        },
      );
      return (await antwort.json()) as Versandbestaetigung;
    } catch (ursache) {
      // 409 hat an diesem Endpunkt genau eine Ursache; sie verdient einen
      // eigenen, handlungsleitenden Text statt der rohen Serverantwort.
      if (ursache instanceof WorkerFehler && ursache.status === 409) {
        throw new EmpfaengerFehltFehler();
      }
      throw ursache;
    }
  }
}
