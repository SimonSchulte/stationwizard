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
  VORGANG_UNTERSCHRIFT_FEHLT_ZUM_SENDEN:
    'Zum Senden müssen die Pflichtangaben ausgefüllt und beide Pflichtunterschriften gesetzt sein.',
  VORGANG_BEREITS_EINGEREICHT: 'Der Vorgang ist schon eingereicht.',
  VORGANG_ANGEBOT_GESPERRT: 'Nach dem Einreichen lassen sich keine Angebote mehr ändern.',
  VORGANG_ANGEBOTE_GRENZE: 'Höchstens 10 Angebote je Vorgang.',
  VORGANG_ANGEBOT_TYP_UNGUELTIG:
    'Angebote nehmen wir als PDF, PNG oder JPEG an; Dateiendung und Inhalt müssen übereinstimmen.',
  VORGANG_DATEI_ZU_GROSS: 'Die Datei ist größer als 10 MB.',
  VORGANG_STUFE_FEHLT: 'Zuerst die Stufe „Angebote eingeholt“ erreichen, dann einreichen.',
  VORGANG_EMPFAENGER_FEHLT:
    'Es sind keine Empfänger festgelegt. Die Zugführung legt sie in der Systemkonfiguration fest.',
  VORGANG_ANHANG_ZU_GROSS: 'Die gewählten Angebote sind zusammen zu groß für eine Mail.',
  VORGANG_DATEIEN_KONFIGURATION_FEHLT:
    'Der Dateispeicher der Vorgänge ist noch nicht eingerichtet. Angebote lassen sich so noch nicht anhängen.',
  MAIL_VERSANDWEG_NICHT_EINGERICHTET:
    'Der Versandweg für E-Mails ist noch nicht eingerichtet (Systemkonfiguration, Reiter „Vorgänge“, und Secrets am Worker).',
  MAIL_VERSAND_ANHANG_NICHT_UNTERSTUETZT:
    'Der gewählte Versandweg kann keine Anhänge senden. Die Zugführung stellt ihn in der Systemkonfiguration auf „Mail-API“.',
  MAIL_VERSAND_ZUGANG_ABGELEHNT:
    'Der Mailanbieter hat Token oder Absenderadresse nicht akzeptiert. Nichts wurde gesendet.',
  MAIL_VERSAND_ABGELEHNT: 'Der Mailanbieter hat den Versand abgelehnt. Nichts wurde gesendet.',
  MAIL_VERSAND_NICHT_ERREICHBAR: 'Der Mailanbieter war nicht erreichbar. Nichts wurde gesendet.',
  MAIL_VERSAND_ZEITLIMIT:
    'Der Mailanbieter hat nicht rechtzeitig geantwortet. Ob die Mail angekommen ist, ist unklar: nicht erneut senden, sondern erst beim Empfänger nachfragen.',
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

  /** Sendet die unterschriebene Meldung (mit dem im Browser erzeugten PDF) und reicht sie bei Bedarf ein. */
  async senden(eingabe: {
    modus: 'einreichen' | 'senden';
    pdf: string;
    empfaenger: string[];
    angebote: string[];
    nachricht: string;
  }): Promise<boolean> {
    const stand = this.aktuell();
    if (!stand) return false;
    return (
      (await this.ausfuehren(async () => {
        this.uebernehmen(await this.storage.sende(stand.daten.vorgang.id, stand.version, eingabe));
        void this.listeLaden();
        return true;
      })) === true
    );
  }

  /** Legt Angebote ab; bei einem Fehler stehen die bis dahin abgelegten schon am Vorgang. */
  async angeboteHochladen(
    dateien: readonly {
      datei: Blob;
      name: string;
      notiz?: { betreff: string; absender: string; datum: string; text: string };
    }[],
  ): Promise<boolean> {
    return await this.aktion(async (id) => {
      let stand: VorgangMitVersion | null = null;
      for (const eintrag of dateien) {
        stand = await this.storage.angebotHochladen(id, eintrag.datei, eintrag.name, eintrag.notiz);
        this.aktuell.update(() => stand);
      }
      return stand ?? (await this.storage.lade(id));
    });
  }

  async angebotEntfernen(angebotId: string): Promise<boolean> {
    return await this.aktion((id) => this.storage.angebotEntfernen(id, angebotId));
  }

  /** Die Datei eines Angebots als Blob, zum Herunterladen. */
  async angebotDatei(angebotId: string): Promise<Blob | null> {
    const id = this.aktuell()?.daten.vorgang.id;
    if (!id) return null;
    try {
      return await this.storage.angebotDatei(id, angebotId);
    } catch (fehler) {
      this.aktionFehler.set(vorgangFehlertext(fehler));
      return null;
    }
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
