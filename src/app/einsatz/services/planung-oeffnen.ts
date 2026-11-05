import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { EfsEinsatz, EfsEinsatzGruppe } from '../models/planung.model';
import { EfsApiService } from './efs-api.service';
import { ImportService } from './import.service';
import { PlanungCloudService } from './planung-cloud.service';
import { PlanungStoreService } from './planung-store.service';

/** Ergebnis von `cloudOeffnen()`: `fehler` ist nur bei einem Fehler gesetzt, nie beim Abbruch. */
export interface CloudOeffnenErgebnis {
  geoeffnet: boolean;
  fehler: string;
}

function uhrzeit(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Öffnet eine Planung im PEP-Editor: aus Nextcloud, aus einer HiOrg-Veranstaltung oder als
 * leere Planung. Gemeinsame Logik der Einsatzliste und des `EinsatzAktionenDienst`. `beiPlanung` wird
 * mit der Planungs-Id aufgerufen, kurz bevor der Editor geöffnet wird.
 */
@Injectable({ providedIn: 'root' })
export class PlanungOeffnenDienst {
  private readonly store = inject(PlanungStoreService);
  private readonly router = inject(Router);
  private readonly cloud = inject(PlanungCloudService);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly efsApi = inject(EfsApiService);
  private readonly importService = inject(ImportService);

  async cloudOeffnen(
    id: string,
    beiPlanung?: (planungId: string) => void,
  ): Promise<CloudOeffnenErgebnis> {
    const kontextId = this.store.active()?.id;
    const lokalerStand = () => {
      const planung = this.store.planungen().find((eintrag) => eintrag.id === id);
      return planung ? JSON.stringify(planung) : null;
    };
    const kontextUnveraendert = () => this.store.active()?.id === kontextId;
    const abbruch: CloudOeffnenErgebnis = { geoeffnet: false, fehler: '' };
    let bestaetigterStand = lokalerStand();
    try {
      const lokal = this.store.planungen().find((planung) => planung.id === id);
      if (lokal && this.cloud.hatLokaleAenderungen(lokal)) {
        if (
          !(await this.dialogDienst.bestaetigen(
            'Diese Planung enthält lokale Änderungen. Den gespeicherten Stand laden und die lokalen Änderungen ersetzen? Zur Sicherung kannst du zuerst im Editor JSON herunterladen.',
            'Lokale Änderungen ersetzen',
            'Gespeicherten Stand laden',
          ))
        )
          return abbruch;
        if (!kontextUnveraendert()) return abbruch;
        if (lokalerStand() !== bestaetigterStand)
          throw new Error(
            'Die Planung wurde während der Bestätigung geändert. Bitte erneut laden.',
          );
      }
      const ergebnis = await this.cloud.laden(id);
      if (!kontextUnveraendert()) return abbruch;
      if (lokalerStand() !== bestaetigterStand) {
        bestaetigterStand = lokalerStand();
        if (
          !(await this.dialogDienst.bestaetigen(
            'Die lokale Planung wurde während des Ladens geändert. Trotzdem durch den gespeicherten Stand ersetzen?',
            'Geänderte Planung ersetzen',
            'Ersetzen',
          ))
        )
          return abbruch;
        if (!kontextUnveraendert()) return abbruch;
        if (lokalerStand() !== bestaetigterStand)
          throw new Error('Die Planung wurde erneut geändert. Bitte erneut laden.');
      }
      if (ergebnis.versionWarning) {
        if (
          !(await this.dialogDienst.bestaetigen(
            'Der Einsatzplan wurde mit einer anderen Dateiversion gespeichert. Trotzdem laden?',
            'Versionswarnung',
            'Laden',
          ))
        )
          return abbruch;
      }
      if (!kontextUnveraendert()) return abbruch;
      if (lokalerStand() !== bestaetigterStand)
        throw new Error('Die Planung wurde inzwischen geändert. Bitte erneut laden.');
      this.store.importPlanung(ergebnis.planung);
      this.store.openPlanung(ergebnis.planung.id);
      this.cloud.uebernahmeMerken(ergebnis);
      beiPlanung?.(ergebnis.planung.id);
      await this.router.navigate(['/einsatzplanung/editor']);
      return { geoeffnet: true, fehler: '' };
    } catch (fehler) {
      return { geoeffnet: false, fehler: this.cloud.fehlermeldung(fehler) };
    }
  }

  /** Öffnet die Planung zur HiOrg-Veranstaltung und lädt die Schichtdetails im Hintergrund. */
  async efsGruppeOeffnen(
    gruppe: EfsEinsatzGruppe,
    beiPlanung?: (planungId: string) => void,
  ): Promise<void> {
    const zielId = this.store.openEfsGruppe(gruppe).id;
    beiPlanung?.(zielId);
    void this.router.navigate(['/einsatzplanung/editor']);

    try {
      const results = await Promise.all(
        gruppe.schichten.map((s) => this.efsApi.getVeranstaltungDetail(s.id)),
      );
      if (this.store.active()?.id !== zielId) return;
      for (let i = 0; i < gruppe.schichten.length; i++) {
        const schicht = gruppe.schichten[i];
        const detail = results[i];
        if (!detail) continue;
        const label = detail.zeitraum_bemerk ?? this.zeitraumText(schicht);
        const fahrzeug =
          detail.einsatzmittel.length === 1
            ? this.efsApi.matchFahrzeug(detail.einsatzmittel[0])
            : null;
        this.store.addEfsSchichtPosten(schicht.id, label, fahrzeug);
        const mapped = detail.einsatzkraefte.map((ek) => this.importService.mapEfsEinsatzkraft(ek));
        this.store.mergeEfsEinsatzkraefte(mapped);
      }
    } catch (fehler) {
      this.efsApi.fehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Einsatzdetails konnten nicht geladen werden. Bitte im Editor erneut aktualisieren.',
      );
    }
  }

  /**
   * Legt eine neue lokale Planung mit Titel und Zeitraum des Einsatzes an und öffnet den
   * Editor. Die lokalen Zeiten (`YYYY-MM-DDTHH:mm`, Berliner Ortszeit) werden als Zeitpunkt
   * der Planung übernommen; fehlende oder unlesbare Werte lassen den Vorgabewert stehen.
   */
  async leerePlanungOeffnen(
    titel: string,
    beginn: string | null,
    ende: string | null,
    beiPlanung?: (planungId: string) => void,
  ): Promise<void> {
    const planung = this.store.createPlanung(titel);
    const start = zeitpunkt(beginn);
    const stop = zeitpunkt(ende);
    if (start || stop) {
      this.store.updateActive({
        ...planung,
        start: start ?? planung.start,
        end: stop ?? planung.end,
      });
      this.store.openPlanung(planung.id);
    }
    beiPlanung?.(planung.id);
    await this.router.navigate(['/einsatzplanung/editor']);
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

function zeitpunkt(lokal: string | null): string | null {
  if (!lokal) return null;
  const datum = new Date(lokal);
  return Number.isNaN(datum.getTime()) ? null : datum.toISOString();
}
