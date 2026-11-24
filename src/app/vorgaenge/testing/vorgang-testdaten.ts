import { SchadensmeldungInhalt } from '../models/schadensmeldung.model';
import { UnterschriftStand, Vorgangsdarstellung, VorgangMitVersion } from '../models/vorgang.model';

/** Testdaten (erfunden) für Vorgänge; nur in Spezifikationen verwendet. */
export function testMeldung(
  ueberschreibung: Partial<SchadensmeldungInhalt> = {},
): SchadensmeldungInhalt {
  return {
    art: 'schaden',
    datumFeststellung: '2026-11-12',
    einheit: 'BI EE 04',
    bezeichnung: 'GW SAN',
    kennzeichen: 'XX-HS 110',
    ort: '',
    sachverhalt: 'Das Stromaggregat springt nicht an.',
    stellungnahme: 'Der Sachverhalt wird wie oben beschrieben bestätigt.',
    empfehlung: '',
    ...ueberschreibung,
  };
}

export function testUnterschriften(
  ueberschreibung: Partial<Record<'fest' | 'leitung' | 'verantw', Partial<UnterschriftStand>>> = {},
): UnterschriftStand[] {
  return (['fest', 'leitung', 'verantw'] as const).map((slot) => ({
    slot,
    status: 'offen',
    anEmail: null,
    angefragtVon: null,
    angefragtAm: null,
    name: null,
    unterschriebenAm: null,
    signatur: null,
    ...ueberschreibung[slot],
  }));
}

export function testDarstellung(
  ueberschreibung: Partial<Vorgangsdarstellung> = {},
  meldung: Partial<SchadensmeldungInhalt> = {},
): Vorgangsdarstellung {
  return {
    vorgang: {
      id: 'v-1',
      art: 'fahrzeug-material-defekt',
      fahrzeugId: 'f-1',
      titel: 'Stromaggregat defekt',
      stufe: 0,
      geplantAm: null,
      abgeschlossenAm: null,
      angelegtAm: '2026-11-12T10:00:00.000Z',
      angelegtVon: 'tim.beispiel@example.test',
      geaendertAm: '2026-11-12T10:00:00.000Z',
      geaendertVon: 'tim.beispiel@example.test',
    },
    meldung: {
      id: 'm-1',
      inhalt: testMeldung(meldung),
      version: 1,
      vollstaendig: true,
      gesperrt: false,
      versendetAm: null,
      versendetVon: null,
      versendetAn: null,
    },
    unterschriften: testUnterschriften(),
    angebote: [],
    ereignisse: [],
    ...ueberschreibung,
  };
}

export function testStand(
  daten: Vorgangsdarstellung = testDarstellung(),
  version = '"1"',
): VorgangMitVersion {
  return { daten, version };
}
