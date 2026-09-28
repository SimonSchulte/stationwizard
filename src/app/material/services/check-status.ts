import { PruefArtikel, PruefFach } from '../models/pruefvorlage.model';
import { CheckpositionEingabe, Checkstand } from '../models/check.model';

/**
 * Reine Statuslogik des laufenden Checks – ohne Angular-Import, damit sie auch
 * das zweite, sehr kleine Build-Ziel der öffentlichen Meldeseite verwenden
 * kann, ohne die geschützte Anwendung hereinzuziehen.
 *
 * Verbindlich ist immer `worker/src/material-check.ts`: dort entstehen die
 * gespeicherten Kennzahlen. Diese Fassung dient allein der sofortigen Rückmeldung
 * beim Ausfüllen. Beide sind gemeinsam zu ändern.
 */

const MONAT_MUSTER = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Ab wann ein Verfallsdatum als "läuft bald ab" gilt – wie im Worker. */
export const WARNFRIST_TAGE = 90;

export type VerfallsdatumStatus = 'keines' | 'ok' | 'laeuft-ab' | 'abgelaufen';

/** Heutiger Berliner Kalendertag als `YYYY-MM-DD`; nie über eine UTC-Umrechnung. */
export function heuteBerlin(jetzt = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(jetzt);
}

/** Ein Monatsdatum gilt bis zum letzten Tag des Monats. */
export function verfallsdatumStatus(monat: string | null, heute: string): VerfallsdatumStatus {
  if (monat === null || monat === '') return 'keines';
  const treffer = MONAT_MUSTER.exec(monat);
  if (!treffer) return 'keines';
  const monatsende = Date.UTC(Number(treffer[1]), Number(treffer[2]), 0);
  const [jahr, monatszahl, tag] = heute.split('-').map(Number);
  const heuteZahl = Date.UTC(jahr ?? 0, (monatszahl ?? 1) - 1, tag ?? 1);
  const tage = Math.round((monatsende - heuteZahl) / 86_400_000);
  if (tage < 0) return 'abgelaufen';
  if (tage <= WARNFRIST_TAGE) return 'laeuft-ab';
  return 'ok';
}

/** Schlechtester Status über alle erfassten Stücke eines Artikels. */
export function artikelVerfallsstatus(
  verfallsdaten: readonly (string | null)[],
  heute: string,
): VerfallsdatumStatus {
  let bester: VerfallsdatumStatus = 'keines';
  for (const datum of verfallsdaten) {
    const status = verfallsdatumStatus(datum, heute);
    if (status === 'abgelaufen') return 'abgelaufen';
    if (status === 'laeuft-ab') bester = 'laeuft-ab';
    else if (status === 'ok' && bester === 'keines') bester = 'ok';
  }
  return bester;
}

/** Anfangsstand: Istmenge auf Soll vorbelegt, aber nichts abgehakt. */
export function leerePosition(artikel: PruefArtikel): CheckpositionEingabe {
  return {
    artikelId: artikel.id,
    geprueft: false,
    // Vorbelegung mit dem Soll spart auf dem Telefon hunderte Eingaben. Der
    // Haken muss trotzdem einzeln gesetzt werden – sonst wäre die Vorbelegung
    // ein stiller Freibrief statt einer Tipperleichterung.
    istMenge: artikel.sollMenge,
    unbrauchbar: false,
    verfallsdaten: Array.from({ length: artikel.sollMenge }, () => null),
  };
}

export function leererStand(
  behaelterId: string,
  faecher: readonly PruefFach[],
  verfallsdatumErfasst = true,
): Checkstand {
  const positionen: Record<string, CheckpositionEingabe> = {};
  for (const fach of faecher) {
    for (const artikel of fach.artikel) positionen[artikel.id] = leerePosition(artikel);
  }
  return { behaelterId, verfallsdatumErfasst, bemerkung: '', positionen };
}

export interface Fortschritt {
  gesamt: number;
  geprueft: number;
  prozent: number;
  fehlmengen: number;
  unbrauchbar: number;
  abgelaufen: number;
  laeuftAb: number;
  /** Wie viele Verfallsdaten erwartet werden und wie viele davon erfasst sind. */
  verfallsdatenGesamt: number;
  verfallsdatenErfasst: number;
}

export function fortschritt(
  stand: Checkstand,
  faecher: readonly PruefFach[],
  heute: string,
): Fortschritt {
  let gesamt = 0;
  let geprueft = 0;
  let fehlmengen = 0;
  let unbrauchbar = 0;
  let abgelaufen = 0;
  let laeuftAb = 0;
  let verfallsdatenGesamt = 0;
  let verfallsdatenErfasst = 0;
  for (const fach of faecher) {
    for (const artikel of fach.artikel) {
      const position = stand.positionen[artikel.id];
      if (!position) continue;
      gesamt += 1;
      if (position.geprueft) geprueft += 1;
      if (position.istMenge < artikel.sollMenge) fehlmengen += 1;
      if (position.unbrauchbar) unbrauchbar += 1;
      if (stand.verfallsdatumErfasst && artikel.verfallsdatumPflicht) {
        for (const datum of position.verfallsdaten) {
          verfallsdatenGesamt += 1;
          const status = verfallsdatumStatus(datum, heute);
          if (status === 'keines') continue;
          verfallsdatenErfasst += 1;
          if (status === 'abgelaufen') abgelaufen += 1;
          else if (status === 'laeuft-ab') laeuftAb += 1;
        }
      }
    }
  }
  return {
    gesamt,
    geprueft,
    prozent: gesamt === 0 ? 0 : Math.round((geprueft / gesamt) * 100),
    fehlmengen,
    unbrauchbar,
    abgelaufen,
    laeuftAb,
    verfallsdatenGesamt,
    verfallsdatenErfasst,
  };
}

export interface FachStand {
  gesamt: number;
  geprueft: number;
  unvollstaendig: number;
  verfallshinweise: number;
  vollstaendigGeprueft: boolean;
}

/** Kopfzeile eines Fachs: „x/y geprüft · n unvollständig · n mit Verfallsdatum-Hinweis". */
export function fachStand(stand: Checkstand, fach: PruefFach, heute: string): FachStand {
  let geprueft = 0;
  let unvollstaendig = 0;
  let verfallshinweise = 0;
  for (const artikel of fach.artikel) {
    const position = stand.positionen[artikel.id];
    if (!position) continue;
    if (position.geprueft) geprueft += 1;
    if (position.istMenge < artikel.sollMenge || position.unbrauchbar) unvollstaendig += 1;
    if (stand.verfallsdatumErfasst && artikel.verfallsdatumPflicht) {
      const status = artikelVerfallsstatus(position.verfallsdaten, heute);
      if (status === 'abgelaufen' || status === 'laeuft-ab') verfallshinweise += 1;
    }
  }
  return {
    gesamt: fach.artikel.length,
    geprueft,
    unvollstaendig,
    verfallshinweise,
    vollstaendigGeprueft: fach.artikel.length > 0 && geprueft === fach.artikel.length,
  };
}
