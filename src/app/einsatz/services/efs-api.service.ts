import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppModeService } from './app-mode.service';
import {
  EfsEinsatz,
  EfsEinsatzGruppe,
  EfsEinsatzkraft,
  EfsEinsatzmittel,
  FahrzeugRef,
} from '../models/planung.model';
import { FAHRZEUGE } from '../data/fahrzeuge';

const EFS_API_URL = 'https://www.hiorg-server.de/api/efs/';

// Raw response shapes from the HiOrg EFS-API
interface EfsApiEnvelope {
  status: string;
  fehler?: string;
}

interface EfsCheckApiKeyResponse extends EfsApiEnvelope {
  orga?: string;
  hiorg_org_id?: string;
}

export interface EfsCheckApiKeyResult {
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
  private readonly http = inject(HttpClient);
  private readonly appMode = inject(AppModeService);

  private get headers(): HttpHeaders {
    return new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });
  }

  private buildBody(action: string, extra: Record<string, string> = {}): string {
    return new URLSearchParams({
      apikey: this.appMode.apiKey() ?? '',
      version: '2',
      action,
      ...extra,
    }).toString();
  }

  async checkApiKey(key: string): Promise<EfsCheckApiKeyResult> {
    const body = new URLSearchParams({
      apikey: key,
      version: '2',
      action: 'checkapikey',
    }).toString();
    const response = await firstValueFrom(
      this.http.post<EfsCheckApiKeyResponse>(EFS_API_URL, body, { headers: this.headers }),
    );
    if (response.status !== 'OK' || !response.orga || !response.hiorg_org_id) {
      throw new Error(response.fehler ?? 'Ungültiger API-Key');
    }
    return { orga: response.orga, hiorg_org_id: response.hiorg_org_id };
  }

  async getVeranstaltungen(): Promise<EfsEinsatz[]> {
    const response = await firstValueFrom(
      this.http.post<EfsApiVeranstaltungenResponse>(
        EFS_API_URL,
        this.buildBody('getveranstaltungen'),
        { headers: this.headers },
      ),
    );
    if (response.status !== 'OK' || !response.einsaetze) return [];
    return response.einsaetze.map((e) => this.mapEinsatz(e));
  }

  async getVeranstaltungDetail(id: string): Promise<EfsDetailResult | null> {
    const response = await firstValueFrom(
      this.http.post<EfsApiDetailResponse>(
        EFS_API_URL,
        this.buildBody('getveranstaltung', { id }),
        { headers: this.headers },
      ),
    );
    if (response.status !== 'OK') return null;
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
    if (e.bes_ausbild) result.push(e.bes_ausbild);
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
    if (!em.fugcode) return null;
    const code = em.fugcode.toLowerCase();
    const f =
      FAHRZEUGE.find((v) => v.hiorgId === em.fugcode) ??
      FAHRZEUGE.find((v) => v.funkruf.toLowerCase() === code) ??
      FAHRZEUGE.find((v) => v.seriennummer.toLowerCase() === code);
    if (!f) return null;
    return { seriennummer: f.seriennummer, funkruf: f.funkruf, hiorgId: f.hiorgId };
  }
}
