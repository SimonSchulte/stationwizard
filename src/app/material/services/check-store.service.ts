import { Injectable, computed, inject, signal } from '@angular/core';
import { VerlassenSchutz } from '../../kern/verlassen-schutz';
import {
  CheckKopf,
  CheckpositionEingabe,
  Checkstand,
  Fahrzeugcheck,
  Pruefauftrag,
} from '../models/check.model';
import { ApiCheckStorage } from '../storage/api-check-storage';
import { CheckStorage, CheckUnschluessigFehler } from '../storage/check-storage';
import { fachStand, fortschritt, heuteBerlin, leererStand, leerePosition } from './check-status';
import { leseEntwurf, merkeEntwurf, vergissEntwurf } from './check-entwurf';

function fehlermeldung(fehler: unknown, ersatz: string): string {
  return fehler instanceof Error ? fehler.message : ersatz;
}

/** Wie lange nach der letzten Änderung der Entwurf auf dem Gerät gesichert wird. */
const ENTPRELLUNG_MS = 2000;

/**
 * Zustand des laufenden Fahrzeugchecks. Der Stand lebt im Speicher und wird
 * entprellt auf dem Gerät gesichert; serverseitig geschrieben wird erst beim
 * Einreichen – ein Schreibvorgang je Änderung wäre gegen das Tageskontingent.
 */
@Injectable({ providedIn: 'root' })
export class CheckStoreService {
  private readonly storage: CheckStorage = inject(ApiCheckStorage);

  readonly auftrag = signal<Pruefauftrag | null>(null);
  readonly stand = signal<Checkstand | null>(null);
  readonly laedt = signal(false);
  readonly ladeFehler = signal('');

  readonly reichtEin = signal(false);
  readonly einreichFehler = signal('');

  readonly historie = signal<CheckKopf[]>([]);
  readonly historieLaedt = signal(false);
  readonly historieFehler = signal('');

  readonly geladenerCheck = signal<Fahrzeugcheck | null>(null);
  readonly checkLaedt = signal(false);
  readonly checkFehler = signal('');

  /** Zeitpunkt eines auf dem Gerät vorgefundenen Entwurfs, für den Hinweis beim Einstieg. */
  readonly entwurfGefundenAm = signal<string | null>(null);

  private entpreller: ReturnType<typeof setTimeout> | null = null;

  /** Heutiger Berliner Kalendertag; einmal je Sitzung, für stabile Statusberechnung. */
  private readonly heute = heuteBerlin();

  readonly fortschritt = computed(() => {
    const stand = this.stand();
    const auftrag = this.auftrag();
    if (!stand || !auftrag) return null;
    return fortschritt(stand, auftrag.vorlage.faecher, this.heute);
  });

  readonly hatUngesicherteAenderungen = computed(() => {
    const kennzahlen = this.fortschritt();
    return kennzahlen !== null && kennzahlen.geprueft > 0;
  });

  /** Ein Check ohne eine einzige geprüfte Position wäre kein Nachweis. */
  readonly einreichbar = computed(() => (this.fortschritt()?.geprueft ?? 0) > 0);

  constructor() {
    inject(VerlassenSchutz).registrieren(() => this.hatUngesicherteAenderungen());
  }

  fachKennzahlen(fachId: string) {
    const stand = this.stand();
    const fach = this.auftrag()?.vorlage.faecher.find((eintrag) => eintrag.id === fachId);
    if (!stand || !fach) return null;
    return fachStand(stand, fach, this.heute);
  }

  get heutigerTag(): string {
    return this.heute;
  }

  async auftragLaden(behaelterId: string): Promise<void> {
    this.laedt.set(true);
    this.ladeFehler.set('');
    this.einreichFehler.set('');
    this.entwurfGefundenAm.set(null);
    try {
      const auftrag = await this.storage.ladePruefauftrag(behaelterId);
      if (!auftrag) {
        this.ladeFehler.set('Behälter nicht gefunden.');
        this.auftrag.set(null);
        this.stand.set(null);
        return;
      }
      this.auftrag.set(auftrag);
      const entwurf = leseEntwurf(behaelterId);
      if (entwurf && this.passtZurVorlage(entwurf.stand, auftrag)) {
        this.stand.set(entwurf.stand);
        this.entwurfGefundenAm.set(entwurf.gespeichertAm);
      } else {
        // Ein Entwurf, der nicht mehr zur Vorlage passt, wird verworfen statt
        // halb übernommen – sonst fehlten oder blieben Positionen übrig.
        if (entwurf) vergissEntwurf(behaelterId);
        this.stand.set(leererStand(behaelterId, auftrag.vorlage.faecher));
      }
    } catch (fehler) {
      this.ladeFehler.set(fehlermeldung(fehler, 'Der Prüfauftrag konnte nicht geladen werden.'));
    } finally {
      this.laedt.set(false);
    }
  }

  private passtZurVorlage(stand: Checkstand, auftrag: Pruefauftrag): boolean {
    const ids = auftrag.vorlage.faecher.flatMap((fach) => fach.artikel.map((a) => a.id));
    if (Object.keys(stand.positionen).length !== ids.length) return false;
    return ids.every((id) => {
      const position = stand.positionen[id];
      const artikel = auftrag.vorlage.faecher
        .flatMap((fach) => fach.artikel)
        .find((eintrag) => eintrag.id === id);
      return Boolean(position && artikel && position.verfallsdaten.length === artikel.sollMenge);
    });
  }

  positionAendern(artikelId: string, aenderung: Partial<CheckpositionEingabe>): void {
    const stand = this.stand();
    if (!stand) return;
    const vorher = stand.positionen[artikelId];
    if (!vorher) return;
    this.stand.set({
      ...stand,
      positionen: { ...stand.positionen, [artikelId]: { ...vorher, ...aenderung } },
    });
    this.entwurfSichern();
  }

  verfallsdatumSetzen(artikelId: string, index: number, monat: string | null): void {
    const position = this.stand()?.positionen[artikelId];
    if (!position || index < 0 || index >= position.verfallsdaten.length) return;
    const verfallsdaten = [...position.verfallsdaten];
    verfallsdaten[index] = monat === '' ? null : monat;
    this.positionAendern(artikelId, { verfallsdaten });
  }

  /** Übernimmt ein Datum für alle Stück eines Artikels. */
  verfallsdatumFuerAlle(artikelId: string, monat: string | null): void {
    const position = this.stand()?.positionen[artikelId];
    if (!position) return;
    this.positionAendern(artikelId, {
      verfallsdaten: position.verfallsdaten.map(() => (monat === '' ? null : monat)),
    });
  }

  verfallsdatumErfassungUmschalten(aktiv: boolean): void {
    const stand = this.stand();
    if (!stand) return;
    this.stand.set({ ...stand, verfallsdatumErfasst: aktiv });
    this.entwurfSichern();
  }

  bemerkungSetzen(bemerkung: string): void {
    const stand = this.stand();
    if (!stand) return;
    this.stand.set({ ...stand, bemerkung });
    this.entwurfSichern();
  }

  /** Setzt alle Positionen auf Soll und hakt sie ab. */
  allesAufSoll(): void {
    const stand = this.stand();
    const auftrag = this.auftrag();
    if (!stand || !auftrag) return;
    const positionen = { ...stand.positionen };
    for (const fach of auftrag.vorlage.faecher) {
      for (const artikel of fach.artikel) {
        const vorher = positionen[artikel.id];
        if (!vorher) continue;
        positionen[artikel.id] = {
          ...vorher,
          geprueft: true,
          istMenge: artikel.sollMenge,
          unbrauchbar: false,
        };
      }
    }
    this.stand.set({ ...stand, positionen });
    this.entwurfSichern();
  }

  zuruecksetzen(): void {
    const stand = this.stand();
    const auftrag = this.auftrag();
    if (!stand || !auftrag) return;
    const positionen: Record<string, CheckpositionEingabe> = {};
    for (const fach of auftrag.vorlage.faecher) {
      for (const artikel of fach.artikel) positionen[artikel.id] = leerePosition(artikel);
    }
    this.stand.set({ ...stand, bemerkung: '', positionen });
    this.entwurfSichern();
  }

  /** Verwirft den auf dem Gerät gesicherten Entwurf und beginnt von vorn. */
  entwurfVerwerfen(): void {
    const auftrag = this.auftrag();
    if (!auftrag) return;
    vergissEntwurf(auftrag.behaelter.id);
    this.entwurfGefundenAm.set(null);
    this.stand.set(leererStand(auftrag.behaelter.id, auftrag.vorlage.faecher));
  }

  private entwurfSichern(): void {
    const stand = this.stand();
    if (!stand) return;
    if (this.entpreller !== null) clearTimeout(this.entpreller);
    this.entpreller = setTimeout(() => merkeEntwurf(stand), ENTPRELLUNG_MS);
  }

  async einreichen(): Promise<Fahrzeugcheck | null> {
    const stand = this.stand();
    const auftrag = this.auftrag();
    if (!stand || !auftrag) return null;
    this.reichtEin.set(true);
    this.einreichFehler.set('');
    try {
      const check = await this.storage.reicheCheckEin(auftrag.behaelter.id, {
        id: crypto.randomUUID(),
        verfallsdatumErfasst: stand.verfallsdatumErfasst,
        bemerkung: stand.bemerkung,
        positionen: Object.values(stand.positionen),
      });
      if (this.entpreller !== null) clearTimeout(this.entpreller);
      vergissEntwurf(auftrag.behaelter.id);
      this.entwurfGefundenAm.set(null);
      this.stand.set(null);
      return check;
    } catch (fehler) {
      this.einreichFehler.set(
        fehler instanceof CheckUnschluessigFehler
          ? fehler.message
          : fehlermeldung(fehler, 'Der Check konnte nicht eingereicht werden.'),
      );
      return null;
    } finally {
      this.reichtEin.set(false);
    }
  }

  async historieLaden(behaelterId: string): Promise<void> {
    this.historieLaedt.set(true);
    this.historieFehler.set('');
    try {
      this.historie.set(await this.storage.ladeHistorie(behaelterId));
    } catch (fehler) {
      this.historieFehler.set(fehlermeldung(fehler, 'Die Historie konnte nicht geladen werden.'));
    } finally {
      this.historieLaedt.set(false);
    }
  }

  async checkLaden(id: string): Promise<void> {
    this.checkLaedt.set(true);
    this.checkFehler.set('');
    try {
      const check = await this.storage.ladeCheck(id);
      if (!check) {
        this.checkFehler.set('Check nicht gefunden.');
        this.geladenerCheck.set(null);
        return;
      }
      this.geladenerCheck.set(check);
    } catch (fehler) {
      this.checkFehler.set(fehlermeldung(fehler, 'Der Check konnte nicht geladen werden.'));
    } finally {
      this.checkLaedt.set(false);
    }
  }
}
