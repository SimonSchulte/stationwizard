import { Injectable, inject, signal } from '@angular/core';
import { WorkerClient, WorkerFehler } from '../../kern/worker-client';
import type { HiorgEintrag } from '../models/hiorg-kalender.model';
import { leseHiorgAntwort } from './hiorg-kalender-parser';

export type HiorgZustand = 'ungeprueft' | 'geladen' | 'nicht-konfiguriert' | 'fehler';

/**
 * Anonymisierter Mitschnitt einer echten HiOrg-Server-Antwort für die manuelle
 * Sichtprüfung im Browser (z. B. Textumbruch/Ellipsen im Wochenraster). Liegt
 * unter `public/`, damit sie ganz ohne Worker-Konfiguration abrufbar ist; die
 * Route ist bewusst kein Teil der geschützten `/api/*`-Oberfläche.
 */
const TESTDATEN_PFAD = 'testdaten/hiorg-kalender-mock.json';

/**
 * Die HiOrg-Termine des Verbands, gelesen über den Worker.
 *
 * Der Feed ist eine reine Anzeige- und Abgleichquelle: er wird **nicht**
 * zwischengespeichert und nie in die Excel-Mappe geschrieben. Die Ebene ist
 * immer eingeblendet, sobald ein Rahmenplan offen ist – keine Ansichtsvorliebe.
 *
 * Ein Fehlschlag ist nie blockierend: der Jahresplan arbeitet ohne die Ebene
 * unverändert weiter, wie bei der Feiertags-Rückfallebene.
 */
@Injectable({ providedIn: 'root' })
export class HiorgKalenderService {
  private readonly worker = inject(WorkerClient);
  private laufend: Promise<void> | null = null;
  private geladenerMonat: string | null = null;

  readonly eintraege = signal<readonly HiorgEintrag[]>([]);
  readonly zustand = signal<HiorgZustand>('ungeprueft');
  readonly fehler = signal('');
  readonly verworfen = signal(0);
  readonly laedt = signal(false);

  /**
   * `monat` ist der im Jahresplan gerade angeschaute Monat als `JJJJ-MM`. Die
   * HiOrg-API kann pro Abruf nur vorwärts oder zurück schauen (siehe Worker);
   * ohne diesen Parameter bleibt es bei der im Secret konfigurierten Richtung.
   * Ein Wechsel des angeschauten Monats lädt automatisch neu, auch ohne
   * `erzwingen`.
   */
  async lade(optionen: { monat?: string; erzwingen?: boolean } = {}): Promise<void> {
    const { monat, erzwingen = false } = optionen;
    if (!erzwingen && this.zustand() === 'geladen' && this.geladenerMonat === (monat ?? null)) {
      return;
    }
    this.laufend ??= this.abrufen(monat).finally(() => {
      this.laufend = null;
    });
    return this.laufend;
  }

  /**
   * Lädt die anonymisierte Testantwort statt des echten Feeds – nur für die
   * manuelle Sichtprüfung im Browser, nicht für automatisierte Tests (dort
   * entstehen Testdaten laut Konvention direkt im Test).
   */
  async ladeTestdaten(): Promise<void> {
    this.laedt.set(true);
    try {
      const antwort = await fetch(TESTDATEN_PFAD);
      if (!antwort.ok) {
        throw new Error(`Testdaten nicht abrufbar (${antwort.status})`);
      }
      const rohdaten = (await antwort.json()) as { success?: boolean; data?: unknown };
      const huelle = { status: 'OK', eintraege: rohdaten.data };
      const { eintraege, verworfen } = leseHiorgAntwort(huelle);
      this.eintraege.set(eintraege);
      this.verworfen.set(verworfen);
      this.zustand.set('geladen');
      this.fehler.set('');
    } catch (ursache) {
      this.eintraege.set([]);
      this.verworfen.set(0);
      this.zustand.set('fehler');
      this.fehler.set(ursache instanceof Error ? ursache.message : String(ursache));
    } finally {
      this.laedt.set(false);
    }
  }

  private async abrufen(monat: string | undefined): Promise<void> {
    this.laedt.set(true);
    try {
      const pfad = monat
        ? `/api/hiorg/kalender?monat=${encodeURIComponent(monat)}`
        : '/api/hiorg/kalender';
      const rohdaten = await this.worker.json<unknown>(pfad);
      const { eintraege, verworfen } = leseHiorgAntwort(rohdaten);
      this.eintraege.set(eintraege);
      this.verworfen.set(verworfen);
      this.geladenerMonat = monat ?? null;
      this.zustand.set('geladen');
      this.fehler.set('');
    } catch (ursache) {
      this.eintraege.set([]);
      this.verworfen.set(0);
      if (ursache instanceof WorkerFehler && ursache.status === 503) {
        // Noch nicht eingerichtet ist kein Fehler des Nutzers – nur ein Hinweis.
        this.zustand.set('nicht-konfiguriert');
        this.fehler.set('');
      } else {
        this.zustand.set('fehler');
        this.fehler.set(ursache instanceof Error ? ursache.message : String(ursache));
      }
    } finally {
      this.laedt.set(false);
    }
  }
}
