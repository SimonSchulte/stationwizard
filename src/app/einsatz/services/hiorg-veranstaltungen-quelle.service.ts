import { Injectable, computed, inject, signal } from '@angular/core';
import type { HiorgEintrag } from '../../ausbildung/models/hiorg-kalender.model';
import { leseHiorgAntwort } from '../../ausbildung/services/hiorg-kalender-parser';
import { heuteIso } from '../../kern/kalender/datum';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import type { HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';
import {
  VORAUS_MONATE,
  ZURUECK_MONATE,
  gruppiereVeranstaltungen,
  monatMitAbstand,
} from './hiorg-veranstaltungen';

export type VeranstaltungenZustand = 'ungeprueft' | 'geladen' | 'nicht-konfiguriert' | 'fehler';

const KEIN_FEED = 'Der HiOrg-Kalenderfeed ist noch nicht eingerichtet.';

/**
 * Dienste und Veranstaltungen für die Einsatzübersicht, gelesen aus dem HiOrg-Kalenderfeed
 * (`GET /api/hiorg/kalender`). Der Feed schaut je Abruf nur in eine Richtung; geladen werden
 * deshalb zwei Fenster – zwölf Monate voraus und sechs zurück – in zwei Aufrufen. Nichts wird
 * gespeichert; ein Einsatz entsteht erst, wenn PEP oder VB angelegt werden.
 *
 * Ein Fehlschlag ist nie blockierend: gespeicherte Einsätze erscheinen in der Liste weiter.
 */
@Injectable({ providedIn: 'root' })
export class HiorgVeranstaltungenQuelle {
  private readonly worker = inject(WorkerClient);
  private laufend: Promise<void> | null = null;

  readonly veranstaltungen = signal<readonly HiorgVeranstaltung[]>([]);
  readonly zustand = signal<VeranstaltungenZustand>('ungeprueft');
  readonly fehler = signal('');
  readonly laedt = signal(false);
  readonly erreichbar = computed(
    () => this.worker.zustand() === 'erreichbar' && this.zustand() === 'geladen',
  );

  /** Lädt neu; ein bereits laufender Abruf wird mitbenutzt. */
  laden(): Promise<void> {
    this.laufend ??= this.abrufen().finally(() => {
      this.laufend = null;
    });
    return this.laufend;
  }

  /** Lädt nur, wenn noch nie erfolgreich geladen wurde. */
  async sicherstellenGeladen(): Promise<void> {
    if (this.zustand() !== 'geladen') await this.laden();
  }

  /** Die Veranstaltung zu einer gespeicherten Veranstaltungs-Id, sonst `null`. */
  veranstaltung(veranstaltungId: string): HiorgVeranstaltung | null {
    return this.veranstaltungen().find((v) => v.veranstaltungId === veranstaltungId) ?? null;
  }

  private async abrufen(): Promise<void> {
    this.laedt.set(true);
    try {
      const heute = heuteIso();
      const monate = [
        monatMitAbstand(heute, VORAUS_MONATE),
        monatMitAbstand(heute, -ZURUECK_MONATE),
      ];
      const ergebnisse = await Promise.allSettled(monate.map((monat) => this.fenster(monat)));
      const eintraege = ergebnisse.flatMap((e) => (e.status === 'fulfilled' ? e.value : []));
      const abgelehnt = ergebnisse.find((e) => e.status === 'rejected');

      this.veranstaltungen.set(gruppiereVeranstaltungen(eintraege));
      if (!abgelehnt) {
        this.zustand.set('geladen');
        this.fehler.set('');
      } else if (abgelehnt.reason instanceof WorkerFehler && abgelehnt.reason.status === 503) {
        // Noch nicht eingerichtet ist kein Fehler der Person – nur ein Hinweis.
        this.zustand.set('nicht-konfiguriert');
        this.fehler.set(KEIN_FEED);
      } else {
        // Ein halbes Ergebnis (ein Fenster fehlt) gilt als Fehler: sonst fehlte still ein Teil.
        this.zustand.set('fehler');
        this.fehler.set(
          abgelehnt.reason instanceof Error
            ? abgelehnt.reason.message
            : 'Die HiOrg-Veranstaltungen konnten nicht geladen werden.',
        );
      }
    } finally {
      this.laedt.set(false);
    }
  }

  private async fenster(monat: string): Promise<HiorgEintrag[]> {
    const rohdaten = await this.worker.json<unknown>(
      `/api/hiorg/kalender?monat=${encodeURIComponent(monat)}`,
    );
    return leseHiorgAntwort(rohdaten).eintraege;
  }
}
