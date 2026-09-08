import { Injectable, computed, inject, signal } from '@angular/core';
import { WorkerClient } from '../../kern/worker-client';
import {
  EfsEinsatz,
  EfsEinsatzGruppe,
  EfsEinsatzkraft,
  EfsEinsatzmittel,
  FahrzeugRef,
} from '../models/planung.model';
import { FAHRZEUGE } from '../data/fahrzeuge';

// Raw response shapes from the HiOrg EFS-API
interface EfsApiEnvelope {
  status: string;
  fehler?: string;
}

interface EfsVerbindungsAntwort extends EfsApiEnvelope {
  orga?: string;
  hiorg_org_id?: string;
}

export interface EfsVerbindungsErgebnis {
  orga: string;
  hiorg_org_id: string;
}

interface EfsApiVeranstaltungenResponse extends EfsApiEnvelope {
  einsaetze?: EfsApiEinsatz[];
}

interface EfsApiEinsatz {
  id: string | number;
  titel?: string;
  stichwort?: string;
  datum_von?: string;
  datum_bis?: string;
  beginn?: string | number;
  end?: string | number;
  zeitpunkt?: string | number;
  ort?: string;
  veranstaltung_id?: string | number;
}

interface EfsApiEinsatzkraft {
  hiorg_ek_id?: string | number;
  hiorg_org_id?: string | number;
  vorname?: string;
  nachname?: string;
  fw_qual?: string;
  med_qual?: string;
  fuehr_qual?: string;
  bes_ausbild?: string;
  tel_mobil?: string;
}

interface EfsApiDetailResponse extends EfsApiEnvelope {
  id?: string | number;
  titel?: string;
  stichwort?: string;
  datum_von?: string;
  datum_bis?: string;
  beginn?: string | number;
  end?: string | number;
  zeitpunkt?: string | number;
  ort?: string;
  zeitraum_bemerk?: string;
  einsatzkraefte_imeinsatz?: Record<string, EfsApiEinsatzkraft>;
  einsatzmittel_imeinsatz?: Record<string, unknown>[];
}

export interface EfsDetailResult {
  einsatz?: EfsEinsatz;
  einsatzkraefte: EfsEinsatzkraft[];
  einsatzmittel: EfsEinsatzmittel[];
  zeitraum_bemerk?: string;
}

@Injectable({ providedIn: 'root' })
export class EfsApiService {
  readonly worker = inject(WorkerClient);
  readonly verbindung = signal<'ungeprueft' | 'verbunden' | 'gestoert'>('ungeprueft');
  readonly fehler = signal('');
  readonly erreichbar = computed(
    () => this.worker.zustand() === 'erreichbar' && this.verbindung() === 'verbunden',
  );

  private async anfragen<T extends EfsApiEnvelope>(
    aktion: 'checkapikey' | 'getveranstaltungen' | 'getveranstaltung',
    daten: { id?: string } = {},
  ): Promise<T> {
    try {
      const antwort = await this.worker.json<T>(`/api/efs/${aktion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(daten),
      });
      if (!antwort || antwort.status !== 'OK') {
        throw new Error(
          antwort?.fehler || 'HiOrg-Server hat die Anfrage nicht erfolgreich beantwortet.',
        );
      }
      this.verbindung.set('verbunden');
      this.fehler.set('');
      return antwort;
    } catch (fehler) {
      this.verbindung.set('gestoert');
      this.fehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Die Verbindung zu HiOrg-Server ist fehlgeschlagen.',
      );
      throw fehler;
    }
  }

  async pruefeVerbindung(): Promise<EfsVerbindungsErgebnis> {
    const antwort = await this.anfragen<EfsVerbindungsAntwort>('checkapikey');
    if (!antwort.orga || !antwort.hiorg_org_id) {
      throw this.ungueltigeAntwort(
        'HiOrg-Server hat keine gültige Organisationsinformation geliefert.',
      );
    }
    return { orga: antwort.orga, hiorg_org_id: antwort.hiorg_org_id };
  }

  async getVeranstaltungen(): Promise<EfsEinsatz[]> {
    const antwort = await this.anfragen<EfsApiVeranstaltungenResponse>('getveranstaltungen');
    if (!Array.isArray(antwort.einsaetze))
      throw this.ungueltigeAntwort('HiOrg-Server hat keine gültige Veranstaltungsliste geliefert.');
    return antwort.einsaetze.map((einsatz) => this.mapEinsatz(einsatz));
  }

  async getVeranstaltungDetail(id: string): Promise<EfsDetailResult> {
    const response = await this.anfragen<EfsApiDetailResponse>('getveranstaltung', { id });
    if (
      response.einsatzkraefte_imeinsatz != null &&
      (typeof response.einsatzkraefte_imeinsatz !== 'object' ||
        Array.isArray(response.einsatzkraefte_imeinsatz))
    ) {
      throw this.ungueltigeAntwort('HiOrg-Server hat eine ungültige Einsatzkräfteliste geliefert.');
    }
    if (
      response.einsatzmittel_imeinsatz != null &&
      !Array.isArray(response.einsatzmittel_imeinsatz)
    ) {
      throw this.ungueltigeAntwort('HiOrg-Server hat eine ungültige Einsatzmittelliste geliefert.');
    }
    const einsatz =
      response.titel || response.stichwort || response.datum_von
        ? this.mapEinsatz({
            id: response.id ?? id,
            titel: response.titel,
            stichwort: response.stichwort,
            datum_von: response.datum_von,
            datum_bis: response.datum_bis,
            beginn: response.beginn,
            end: response.end,
            zeitpunkt: response.zeitpunkt,
            ort: response.ort,
          })
        : undefined;
    return {
      einsatz,
      einsatzkraefte: Object.values(response.einsatzkraefte_imeinsatz ?? {}).map((e) =>
        this.mapEinsatzkraft(e),
      ),
      einsatzmittel: (response.einsatzmittel_imeinsatz ?? []).map((e) => this.mapEinsatzmittel(e)),
      zeitraum_bemerk: response.zeitraum_bemerk,
    };
  }

  private ungueltigeAntwort(meldung: string): Error {
    this.verbindung.set('gestoert');
    this.fehler.set(meldung);
    return new Error(meldung);
  }

  private mapEinsatz(e: EfsApiEinsatz): EfsEinsatz {
    const toDateStr = (v?: string | number): string | null =>
      v == null ? null : typeof v === 'number' ? new Date(v * 1000).toISOString() : v || null;
    return {
      id: String(e.id),
      titel: e.titel ?? e.stichwort ?? '',
      datum_von: toDateStr(e.datum_von) ?? toDateStr(e.beginn) ?? toDateStr(e.zeitpunkt) ?? '',
      datum_bis: toDateStr(e.datum_bis) ?? toDateStr(e.end) ?? '',
      ort: e.ort,
      veranstaltung_id: e.veranstaltung_id != null ? String(e.veranstaltung_id) : undefined,
    };
  }

  groupEinsaetze(einsaetze: EfsEinsatz[]): EfsEinsatzGruppe[] {
    const map = new Map<string, EfsEinsatz[]>();
    for (const e of einsaetze) {
      const key = e.veranstaltung_id ?? e.titel;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    const groups: EfsEinsatzGruppe[] = [];
    for (const [key, schichten] of map) {
      schichten.sort((a, b) => a.datum_von.localeCompare(b.datum_von));
      groups.push({
        veranstaltung_id: key,
        titel: schichten[0].titel,
        datum_von: schichten[0].datum_von,
        datum_bis: schichten[schichten.length - 1].datum_bis,
        ort: schichten[0].ort,
        schichten,
      });
    }
    return groups.sort((a, b) => a.datum_von.localeCompare(b.datum_von));
  }

  private mapEinsatzkraft(e: EfsApiEinsatzkraft): EfsEinsatzkraft {
    return {
      hiorg_org_id: String(e.hiorg_ek_id ?? e.hiorg_org_id ?? ''),
      vorname: e.vorname ?? '',
      nachname: e.nachname ?? '',
      ausbildungen: this.qualToAusbildungen(e),
      telefonnummer: e.tel_mobil ?? undefined,
    };
  }

  private qualToAusbildungen(e: EfsApiEinsatzkraft): string[] {
    const result: string[] = [];
    const medMap: Record<string, string> = {
      'Erste-Hilfe': 'EH',
      'Sanitätshelfer/in': 'SanH',
      'Rettungshelfer/in': 'RH',
      'Rettungssanitäter/in': 'RS',
      'Rettungsassistent/in': 'RA',
      'Notfallsanitäter/in': 'NotSan',
      'Arzt/Ärztin': 'A',
      Notarzt: 'NA',
      'Notarzt / Notärztin': 'NA',
    };
    const taktMap: Record<string, string> = {
      'Helfer:in in Ausbildung': 'H',
      'Gruppenführer:in': 'GF',
      'Zugführer:in': 'ZF',
      'ZF mit Stabsausbildung': 'ZF',
      'Verbandsführer:in': 'VF',
      'Verbandführer:in': 'VF',
    };
    if (e.med_qual) result.push(medMap[e.med_qual] ?? e.med_qual);
    if (e.fuehr_qual) result.push(taktMap[e.fuehr_qual] ?? e.fuehr_qual);
    if (e.fw_qual) result.push(e.fw_qual);
    if (e.bes_ausbild) result.push(medMap[e.bes_ausbild] ?? e.bes_ausbild);
    return result.filter(Boolean);
  }

  private mapEinsatzmittel(e: Record<string, unknown>): EfsEinsatzmittel {
    return {
      id: String(e['id'] ?? ''),
      bezeichnung: e['bezeichnung'] != null ? String(e['bezeichnung']) : undefined,
      funkruf: e['funkruf'] != null ? String(e['funkruf']) : undefined,
      fugcode: e['fugcode'] != null ? String(e['fugcode']) : undefined,
    };
  }

  matchFahrzeug(em: EfsEinsatzmittel): FahrzeugRef | null {
    const code = em.fugcode?.toLowerCase();
    const f =
      FAHRZEUGE.find((v) => v.hiorgId === em.fugcode) ??
      FAHRZEUGE.find((v) => v.funkruf.toLowerCase() === code) ??
      FAHRZEUGE.find((v) => v.seriennummer.toLowerCase() === code);
    if (f) return { seriennummer: f.seriennummer, funkruf: f.funkruf, hiorgId: f.hiorgId };
    const funkruf = em.funkruf?.trim();
    return funkruf ? { seriennummer: null, funkruf, hiorgId: em.id || null } : null;
  }
}
