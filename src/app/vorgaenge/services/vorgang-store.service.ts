import { Injectable, computed, inject, signal } from '@angular/core';
import { WorkerFehler } from '../../kern/worker-client';
import {
  MELDUNG_GRENZEN,
  MeldungTextFeld,
  SchadensmeldungInhalt,
} from '../models/schadensmeldung.model';
import {
  Slot,
  VorgangListenEintrag,
  VorgangMitVersion,
  istUnterschrieben,
} from '../models/vorgang.model';
import { ApiVorgangStorage } from '../storage/api-vorgang-storage';

const FEHLERTEXT: Record<string, string> = {
  VORGANG_MELDUNG_GESPERRT:
    'Die Meldung ist unterschrieben und lässt sich nicht mehr ändern. Zuerst die Unterschriften entfernen.',
  VORGANG_UNTERSCHRIFT_FEHLT: 'Zuerst im Benutzermenü eine Unterschrift hinterlegen.',
  VORGANG_UNTERSCHRIFT_VORHANDEN: 'Dieses Feld ist schon unterschrieben.',
  VORGANG_UNTERSCHRIFT_ANGEFRAGT:
    'Dieses Feld ist für eine andere Person angefragt. Zuerst die Anfrage zurückziehen.',
  VORGANG_UNTERSCHRIFT_NICHT_ERLAUBT: 'Eine fremde Unterschrift entfernt nur die Zugführung.',
  VORGANG_MELDUNG_UNVOLLSTAENDIG: 'Zuerst die Pflichtangaben der Schadensmeldung ausfüllen.',
  VORGANG_PERSON_UNBEKANNT: 'Diese Person hat sich noch nicht angemeldet.',
  VORGANG_ANGEBOT_FEHLT: 'Ohne mindestens ein Angebot geht es nicht weiter.',
  VORGANG_GENEHMIGUNG_NICHT_ERLAUBT: 'Genehmigt setzt nur die Zugführung.',
  VORGANG_ZURUECK_NICHT_ERLAUBT: 'Ab „Eingereicht“ nimmt nur die Zugführung eine Stufe zurück.',
  VORGANG_NUR_UEBER_EINREICHEN: 'Eingereicht wird nur durch „Einreichen per E-Mail“.',
};

/** Verständliche Meldung zu einem Fehler; bekannte Diagnosecodes bekommen einen eigenen Text. */
export function vorgangFehlertext(fehler: unknown): string {
  if (fehler instanceof WorkerFehler) {
    if (fehler.diagnose && FEHLERTEXT[fehler.diagnose]) return FEHLERTEXT[fehler.diagnose];
    return fehler.message;
  }
  return 'Die Aktion konnte nicht ausgeführt werden.';
}

/**
 * Zustand der Vorgänge: die Liste über alle Fahrzeuge (ein Aufruf) und der gerade geöffnete
 * Vorgang mit dem Entwurf seiner Schadensmeldung. Gespeichert wird die Meldung ausdrücklich mit
 * „Speichern“ (ein Schreibvorgang je Speichern, nie je Taste); ein 412 bewahrt den Entwurf.
 */
@Injectable({ providedIn: 'root' })
export class VorgangStoreService {
  private readonly storage = inject(ApiVorgangStorage);

  readonly liste = signal<VorgangListenEintrag[]>([]);
  readonly listeLaedt = signal(false);
  readonly listeFehler = signal('');

  readonly aktuell = signal<VorgangMitVersion | null>(null);
  readonly laedt = signal(false);
  readonly ladeFehler = signal('');
  readonly aktionFehler = signal('');
  readonly arbeitet = signal(false);
  /** `true`, wenn ein Speichern wegen eines zwischenzeitlich geänderten Stands abgewiesen wurde. */
  readonly konflikt = signal(false);

  /** Lokaler Stand der Meldung; `null`, solange kein Vorgang geöffnet ist. */
  readonly entwurf = signal<SchadensmeldungInhalt | null>(null);

  readonly meldung = computed(() => this.aktuell()?.daten.meldung ?? null);
  readonly unterschriften = computed(() => this.aktuell()?.daten.unterschriften ?? []);
  readonly unterschrieben = computed(() => istUnterschrieben(this.unterschriften()));

  readonly ungespeichert = computed(() => {
    const entwurf = this.entwurf();
    const basis = this.meldung()?.inhalt;
    return !!entwurf && !!basis && JSON.stringify(entwurf) !== JSON.stringify(basis);
  });

  hatUngesicherteAenderungen(): boolean {
    return this.ungespeichert();
  }

  async listeLaden(): Promise<void> {
    this.listeLaedt.set(true);
    this.listeFehler.set('');
    try {
      this.liste.set(await this.storage.liste());
    } catch (fehler) {
      this.listeFehler.set(vorgangFehlertext(fehler));
    } finally {
      this.listeLaedt.set(false);
    }
  }

  async laden(id: string): Promise<void> {
    this.laedt.set(true);
    this.ladeFehler.set('');
    this.aktionFehler.set('');
    this.konflikt.set(false);
    try {
      this.uebernehmen(await this.storage.lade(id));
    } catch (fehler) {
      this.aktuell.set(null);
      this.entwurf.set(null);
      this.ladeFehler.set(vorgangFehlertext(fehler));
    } finally {
      this.laedt.set(false);
    }
  }

  /** Legt Vorgang und Meldung an; liefert die Id des neuen Vorgangs oder `null`. */
  async anlegen(
    fahrzeugId: string,
    titel: string,
    meldung: SchadensmeldungInhalt,
  ): Promise<string | null> {
    return await this.ausfuehren(async () => {
      const stand = await this.storage.lege(fahrzeugId, titel, meldung);
      this.uebernehmen(stand);
      void this.listeLaden();
      return stand.daten.vorgang.id;
    });
  }

  entwurfAendern(patch: Partial<SchadensmeldungInhalt>): void {
    const aktuell = this.entwurf();
    if (!aktuell || this.meldung()?.gesperrt) return;
    const neu = { ...aktuell, ...patch };
    for (const feld of Object.keys(MELDUNG_GRENZEN) as MeldungTextFeld[]) {
      neu[feld] = neu[feld].slice(0, MELDUNG_GRENZEN[feld]);
    }
    this.entwurf.set(neu);
  }

  verwerfen(): void {
    const basis = this.meldung()?.inhalt;
    if (basis) this.entwurf.set({ ...basis });
    this.konflikt.set(false);
    this.aktionFehler.set('');
  }

  async meldungSpeichern(): Promise<boolean> {
    const stand = this.aktuell();
    const meldung = stand?.daten.meldung;
    const entwurf = this.entwurf();
    if (!stand || !meldung || !entwurf) return false;
    return (
      (await this.ausfuehren(async () => {
        this.uebernehmen(
          await this.storage.speichereMeldung(stand.daten.vorgang.id, entwurf, meldung.version),
        );
        void this.listeLaden();
        return true;
      })) === true
    );
  }

  async unterschreiben(slot: Slot): Promise<boolean> {
    return await this.aktion((id) => this.storage.unterschreibe(id, slot));
  }

  async anfordern(slot: Slot, an: string): Promise<boolean> {
    return await this.aktion((id) => this.storage.fordereAn(id, slot, an));
  }

  async unterschriftEntfernen(slot: Slot): Promise<boolean> {
    return await this.aktion((id) => this.storage.entferneUnterschrift(id, slot));
  }

  async alleUnterschriftenEntfernen(): Promise<boolean> {
    return await this.aktion((id) => this.storage.entferneAlleUnterschriften(id));
  }

  async stufeWechseln(nach: number): Promise<boolean> {
    const stand = this.aktuell();
    if (!stand) return false;
    return await this.aktion((id) => this.storage.wechsleStufe(id, nach, stand.version));
  }

  /** Übernimmt einen vom Server gelieferten Stand, etwa nach dem Einreichen. */
  uebernehmen(stand: VorgangMitVersion): void {
    this.aktuell.set(stand);
    const meldung = stand.daten.meldung;
    this.entwurf.set(meldung ? { ...meldung.inhalt } : null);
    this.konflikt.set(false);
  }

  private async aktion(lauf: (id: string) => Promise<VorgangMitVersion>): Promise<boolean> {
    const id = this.aktuell()?.daten.vorgang.id;
    if (!id) return false;
    return (
      (await this.ausfuehren(async () => {
        const stand = await lauf(id);
        // Ungespeicherte Änderungen am Entwurf bleiben bei Unterschriften und Stufen erhalten.
        const entwurf = this.entwurf();
        const behalten = this.ungespeichert() && !stand.daten.meldung?.gesperrt ? entwurf : null;
        this.aktuell.set(stand);
        this.entwurf.set(
          behalten ?? (stand.daten.meldung ? { ...stand.daten.meldung.inhalt } : null),
        );
        void this.listeLaden();
        return true;
      })) === true
    );
  }

  private async ausfuehren<T>(lauf: () => Promise<T>): Promise<T | null> {
    this.arbeitet.set(true);
    this.aktionFehler.set('');
    this.konflikt.set(false);
    try {
      return await lauf();
    } catch (fehler) {
      if (fehler instanceof WorkerFehler && fehler.status === 412) {
        this.konflikt.set(true);
        this.aktionFehler.set(
          'Der Stand wurde zwischenzeitlich geändert. Dein Entwurf bleibt erhalten; lade den aktuellen Stand neu.',
        );
      } else {
        this.aktionFehler.set(vorgangFehlertext(fehler));
      }
      return null;
    } finally {
      this.arbeitet.set(false);
    }
  }
}
