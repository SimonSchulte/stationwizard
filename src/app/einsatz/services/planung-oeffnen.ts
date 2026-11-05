import { Injectable, inject } from '@angular/core';
import {
  EfsEinsatz,
  EfsEinsatzGruppe,
  Einsatzkraft,
  Planung,
  Posten,
} from '../models/planung.model';
import { EfsApiService } from './efs-api.service';
import { ImportService } from './import.service';

function uhrzeit(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Baut aus HiOrg-Daten eine Planung, ohne sie zu öffnen: Grundlage für die neue PEP eines
 * Einsatzes (`PepEditorOeffnenDienst.anlegen`). Das Öffnen im Editor übernimmt dieser Dienst
 * nicht mehr; Planungen entstehen am Einsatz.
 */
@Injectable({ providedIn: 'root' })
export class PlanungOeffnenDienst {
  private readonly efsApi = inject(EfsApiService);
  private readonly importService = inject(ImportService);

  /**
   * Baut die Planung zur HiOrg-Veranstaltung: je Schicht ein Posten (mit Fahrzeug, wenn die
   * Schicht genau eines hat) und die Einsatzkräfte aller Schichten ohne Doppelte. Wirft, wenn
   * der Abruf der Schichtdetails scheitert; es wird nichts gespeichert oder geöffnet.
   */
  async planungAusEfsBauen(gruppe: EfsEinsatzGruppe): Promise<Planung> {
    const ergebnisse = await Promise.all(
      gruppe.schichten.map((s) => this.efsApi.getVeranstaltungDetail(s.id)),
    );
    const posten: Posten[] = [];
    const einsatzkraefte: Einsatzkraft[] = [];
    gruppe.schichten.forEach((schicht, index) => {
      const detail = ergebnisse[index];
      if (!detail) return;
      const fahrzeug =
        detail.einsatzmittel.length === 1
          ? this.efsApi.matchFahrzeug(detail.einsatzmittel[0])
          : null;
      posten.push({
        id: crypto.randomUUID(),
        label: detail.zeitraum_bemerk ?? this.zeitraumText(schicht),
        fahrzeug,
        positions: [],
        hiorg_schicht_id: schicht.id,
      });
      const hiorgIds = new Set(einsatzkraefte.map((e) => e.hiorg_org_id).filter(Boolean));
      const namen = new Set(einsatzkraefte.map((e) => e.name));
      for (const kraft of detail.einsatzkraefte.map((ek) =>
        this.importService.mapEfsEinsatzkraft(ek),
      )) {
        if (kraft.hiorg_org_id && hiorgIds.has(kraft.hiorg_org_id)) continue;
        if (namen.has(kraft.name)) continue;
        einsatzkraefte.push(kraft);
        namen.add(kraft.name);
        if (kraft.hiorg_org_id) hiorgIds.add(kraft.hiorg_org_id);
      }
    });
    return {
      id: crypto.randomUUID(),
      name: gruppe.titel,
      start: gruppe.datum_von,
      end: gruppe.datum_bis,
      beschreibung: null,
      posten,
      einsatzkraefte,
      einsatzleiter: null,
      hiorg_einsatz_id: gruppe.veranstaltung_id,
    };
  }

  /** Veranstaltungen der HiOrg-Server-API als Gruppe; `null`, wenn die Veranstaltung fehlt. */
  async gruppeFuerVeranstaltung(veranstaltungId: string): Promise<EfsEinsatzGruppe | null> {
    const einsaetze: EfsEinsatz[] = await this.efsApi.getVeranstaltungen();
    return (
      this.efsApi
        .groupEinsaetze(einsaetze)
        .find((gruppe) => gruppe.veranstaltung_id === veranstaltungId) ?? null
    );
  }

  private zeitraumText(schicht: EfsEinsatz): string {
    return `${uhrzeit(schicht.datum_von)}–${uhrzeit(schicht.datum_bis)}`;
  }
}
