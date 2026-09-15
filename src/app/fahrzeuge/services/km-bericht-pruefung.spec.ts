import { describe, expect, it } from 'vitest';
import { BerichtZeile, KmBericht } from '../models/km-bericht.model';
import { istKmBericht, istVersandQuittung } from './km-bericht-pruefung';

function zeile(ueberschreibung: Partial<BerichtZeile> = {}): BerichtZeile {
  return {
    bezeichnung: 'MTW',
    funkrufname: 'Florian 1',
    kennzeichen: 'K-XY 123',
    eigentuemer: 'land-nrw',
    letzterStand: 12_000,
    abgelesenAm: '2026-06-01',
    tageSeitAblesung: 14,
    sollKm: 1800,
    istKm: 2000,
    restKm: 0,
    unvollstaendig: false,
    ...ueberschreibung,
  };
}

function bericht(ueberschreibung: Partial<KmBericht> = {}): KmBericht {
  return {
    stichtag: '2026-06-15',
    jahr: 2026,
    zeilen: [zeile()],
    ohneAblesung: 0,
    unterSoll: 0,
    ...ueberschreibung,
  };
}

describe('istKmBericht', () => {
  it('nimmt einen vollständigen Bericht an', () => {
    expect(istKmBericht(bericht())).toBe(true);
  });

  it('nimmt eine Zeile ohne Ablesung an', () => {
    const ohne = zeile({
      letzterStand: null,
      abgelesenAm: null,
      tageSeitAblesung: null,
      istKm: null,
      restKm: null,
      unvollstaendig: true,
    });
    expect(istKmBericht(bericht({ zeilen: [ohne] }))).toBe(true);
  });

  it.each([
    ['fehlendem Stichtag', { stichtag: undefined }],
    ['unplausiblem Stichtag', { stichtag: '15.06.2026' }],
    ['nicht numerischem Jahr', { jahr: '2026' }],
    ['fehlenden Zeilen', { zeilen: undefined }],
  ])('lehnt einen Bericht mit %s ab', (_name, abweichung) => {
    expect(istKmBericht({ ...bericht(), ...abweichung })).toBe(false);
  });

  it('lehnt einen unbekannten Eigentümer ab, statt ihn durchzulassen', () => {
    expect(istKmBericht(bericht({ zeilen: [{ ...zeile(), eigentuemer: 'kreis' } as never] }))).toBe(
      false,
    );
  });

  it('lehnt einen gebrochenen Kilometerstand ab', () => {
    expect(istKmBericht(bericht({ zeilen: [zeile({ letzterStand: 1200.5 })] }))).toBe(false);
  });

  it('lehnt Nicht-Objekte ab', () => {
    expect(istKmBericht(null)).toBe(false);
    expect(istKmBericht([bericht()])).toBe(false);
  });
});

describe('istVersandQuittung', () => {
  it('nimmt eine vollständige Quittung an', () => {
    expect(
      istVersandQuittung({
        gesendetAn: 'leitung@example.test',
        gesendetAm: '2026-06-15T10:00:00.000Z',
        gesendetVon: 'person@example.test',
        anzahlFahrzeuge: 3,
        versandweg: 'email-routing',
      }),
    ).toBe(true);
  });

  it('lehnt eine Quittung ohne Empfänger ab', () => {
    expect(
      istVersandQuittung({
        gesendetAm: '2026-06-15T10:00:00.000Z',
        gesendetVon: 'person@example.test',
        anzahlFahrzeuge: 3,
        versandweg: 'email-routing',
      }),
    ).toBe(false);
  });
});
