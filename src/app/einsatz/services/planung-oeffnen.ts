import { Injectable } from '@angular/core';
import type { HiorgEintrag } from '../../ausbildung/models/hiorg-kalender.model';
import { HiorgVeranstaltung } from '../models/hiorg-veranstaltung.model';
import { Planung, Posten } from '../models/planung.model';

function zeitraumText(schicht: HiorgEintrag): string {
  if (!schicht.beginnZeit) return 'ganztägig';
  return schicht.endeZeit
    ? `${schicht.beginnZeit}–${schicht.endeZeit}`
    : `ab ${schicht.beginnZeit}`;
}

/**
 * Baut aus einer HiOrg-Veranstaltung eine Planung, ohne sie zu öffnen: Grundlage für die neue
 * PEP eines Einsatzes (`PepEditorOeffnenDienst.anlegen`). Der Kalenderfeed kennt weder
 * Einsatzkräfte noch Einsatzmittel; sie kommen im Editor über „Personal aus HiOrg-Server
 * übernehmen“ oder den Import.
 */
@Injectable({ providedIn: 'root' })
export class PlanungOeffnenDienst {
  /** Je Schicht der Veranstaltung ein Posten, benannt nach seinem Zeitraum; ohne Fahrzeug. */
  planungAusVeranstaltungBauen(veranstaltung: HiorgVeranstaltung): Planung {
    const posten: Posten[] = veranstaltung.schichten.map((schicht) => ({
      id: crypto.randomUUID(),
      label: zeitraumText(schicht),
      fahrzeug: null,
      positions: [],
    }));
    return {
      id: crypto.randomUUID(),
      name: veranstaltung.titel,
      start: veranstaltung.beginn,
      end: veranstaltung.ende,
      beschreibung: null,
      posten,
      einsatzkraefte: [],
      einsatzleiter: null,
      hiorg_einsatz_id: veranstaltung.veranstaltungId,
    };
  }
}
