import { Injectable, inject } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import type { EfsEinsatz, EfsEinsatzGruppe, EfsEinsatzkraft } from '../models/efs.model';
import { MEDIZINISCHE_BEZEICHNUNGEN, TAKTISCHE_BEZEICHNUNGEN } from './qualifikation-zuordnung';

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

function text(wert: unknown): string | undefined {
  if (typeof wert === 'string') return wert;
  if (typeof wert === 'number' && Number.isFinite(wert)) return String(wert);
  return undefined;
}

/** EFS nennt Zeitpunkte als Text oder als Unix-Sekunden. */
function zeitpunkt(wert: unknown): string {
  if (typeof wert === 'number' && Number.isFinite(wert)) {
    return new Date(wert * 1000).toISOString();
  }
  return typeof wert === 'string' ? wert : '';
}

/**
 * Gibt die Antwort nur weiter, wenn EFS `status: 'OK'` meldet; sonst die Fehlermeldung von EFS
 * oder einen allgemeinen Text.
 */
function ok(antwort: unknown): Record<string, unknown> {
  if (!istObjekt(antwort) || antwort['status'] !== 'OK') {
    const fehler = istObjekt(antwort) ? text(antwort['fehler']) : undefined;
    throw new Error(fehler || 'EFS hat die Anfrage nicht erfolgreich beantwortet.');
  }
  return antwort;
}

function einsatzAus(roh: unknown): EfsEinsatz | null {
  if (!istObjekt(roh)) return null;
  const id = text(roh['id']);
  if (!id) return null;
  const veranstaltung = text(roh['veranstaltung_id']);
  const ort = text(roh['ort']);
  return {
    id,
    titel: text(roh['titel']) ?? text(roh['stichwort']) ?? '',
    datum_von:
      text(roh['datum_von']) || zeitpunkt(roh['beginn']) || zeitpunkt(roh['zeitpunkt']) || '',
    datum_bis: text(roh['datum_bis']) || zeitpunkt(roh['end']) || '',
    ...(ort ? { ort } : {}),
    ...(veranstaltung ? { veranstaltung_id: veranstaltung } : {}),
  };
}

/** Qualifikationsbezeichnungen einer EFS-Einsatzkraft; bekannte Namen laufen über das Mapping. */
function ausbildungen(roh: Record<string, unknown>): string[] {
  const med = text(roh['med_qual']);
  const fuehr = text(roh['fuehr_qual']);
  const fw = text(roh['fw_qual']);
  const bes = text(roh['bes_ausbild']);
  return [
    med ? (MEDIZINISCHE_BEZEICHNUNGEN[med] ?? med) : '',
    fuehr ? (TAKTISCHE_BEZEICHNUNGEN[fuehr] ?? fuehr) : '',
    fw ?? '',
    bes ? (MEDIZINISCHE_BEZEICHNUNGEN[bes] ?? bes) : '',
  ].filter((eintrag) => eintrag.trim() !== '');
}

/**
 * Gruppiert EFS-Einsätze zu Veranstaltungen (gleiche `veranstaltung_id`, sonst gleicher Titel).
 * Ergebnis nach Beginn.
 */
export function gruppiereEfsEinsaetze(einsaetze: readonly EfsEinsatz[]): EfsEinsatzGruppe[] {
  const jeSchluessel = new Map<string, EfsEinsatz[]>();
  for (const einsatz of einsaetze) {
    const schluessel = einsatz.veranstaltung_id ?? `titel:${einsatz.titel}`;
    const liste = jeSchluessel.get(schluessel);
    if (liste) liste.push(einsatz);
    else jeSchluessel.set(schluessel, [einsatz]);
  }
  const gruppen: EfsEinsatzGruppe[] = [];
  for (const [schluessel, schichten] of jeSchluessel) {
    schichten.sort((a, b) => a.datum_von.localeCompare(b.datum_von));
    const ende = schichten.reduce((a, b) => (b.datum_bis > a ? b.datum_bis : a), '');
    gruppen.push({
      veranstaltung_id: schluessel,
      titel: schichten[0].titel,
      datum_von: schichten[0].datum_von,
      datum_bis: ende,
      ...(schichten[0].ort ? { ort: schichten[0].ort } : {}),
      schichten,
    });
  }
  return gruppen.sort((a, b) => a.datum_von.localeCompare(b.datum_von));
}

/**
 * Lesender Zugriff auf EFS über den Worker (`/api/efs/getveranstaltungen` und
 * `/api/efs/getveranstaltung`). Der Worker setzt Ziel, Schlüssel und Version selbst und filtert
 * die Antwort auf eine feste Feldauswahl; hier wird sie zusätzlich auf ihre Form geprüft.
 */
@Injectable({ providedIn: 'root' })
export class EfsApiService {
  private readonly worker = inject(WorkerClient);

  private async anfragen(
    aktion: 'getveranstaltungen' | 'getveranstaltung',
    daten: { id?: string } = {},
  ): Promise<Record<string, unknown>> {
    const antwort = await this.worker.json<unknown>(`/api/efs/${aktion}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(daten),
    });
    return ok(antwort);
  }

  /** Alle Einsätze (Schichten) der Veranstaltungsliste – ein Aufruf für die ganze Übersicht. */
  async veranstaltungenLaden(): Promise<EfsEinsatz[]> {
    const antwort = await this.anfragen('getveranstaltungen');
    const liste = antwort['einsaetze'];
    if (!Array.isArray(liste)) {
      throw new Error('EFS hat keine gültige Veranstaltungsliste geliefert.');
    }
    return liste.map(einsatzAus).filter((einsatz): einsatz is EfsEinsatz => einsatz !== null);
  }

  /** Einsatzkräfte eines EFS-Einsatzes; ein Aufruf je Einsatz, nur bei Bedarf. */
  async einsatzkraefteLaden(id: string): Promise<EfsEinsatzkraft[]> {
    const antwort = await this.anfragen('getveranstaltung', { id });
    const roh = antwort['einsatzkraefte_imeinsatz'] ?? {};
    if (!istObjekt(roh)) {
      throw new Error('EFS hat eine ungültige Einsatzkräfteliste geliefert.');
    }
    const kraefte: EfsEinsatzkraft[] = [];
    for (const eintrag of Object.values(roh)) {
      if (!istObjekt(eintrag)) {
        throw new Error('EFS hat eine ungültige Einsatzkräfteliste geliefert.');
      }
      const nachname = text(eintrag['nachname']) ?? '';
      const vorname = text(eintrag['vorname']) ?? '';
      if (!nachname.trim() && !vorname.trim()) continue;
      const telefon = text(eintrag['tel_mobil']);
      kraefte.push({
        hiorg_org_id: text(eintrag['hiorg_ek_id']) ?? text(eintrag['hiorg_org_id']) ?? '',
        vorname,
        nachname,
        ausbildungen: ausbildungen(eintrag),
        ...(telefon ? { telefonnummer: telefon } : {}),
      });
    }
    return kraefte;
  }
}
