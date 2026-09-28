import { describe, expect, it } from 'vitest';
import {
  istBehaelter,
  istBehaelterUebersicht,
  istHerkunft,
  istPruefArtikel,
  istPruefvorlage,
  istPruefvorlageKopf,
} from './material-pruefung';
import {
  erzeugeTestbehaelter,
  erzeugeTestuebersicht,
  erzeugeTestvorlage,
} from '../testing/material-testdaten';

describe('istHerkunft', () => {
  it('nimmt genau die drei bekannten Werte an', () => {
    expect(istHerkunft('seg')).toBe(true);
    expect(istHerkunft('land')).toBe(true);
    expect(istHerkunft('beide')).toBe(true);
    expect(istHerkunft('bund')).toBe(false);
    expect(istHerkunft(null)).toBe(false);
  });
});

describe('istPruefArtikel', () => {
  const artikel = erzeugeTestvorlage().faecher[0]!.artikel[0]!;

  it('nimmt einen vollständigen Artikel an', () => {
    expect(istPruefArtikel(artikel)).toBe(true);
  });

  it('weist eine Sollmenge unter eins ab, weil eine Position ohne Soll nichts zu prüfen hätte', () => {
    expect(istPruefArtikel({ ...artikel, sollMenge: 0 })).toBe(false);
  });

  it('weist eine gebrochene Sollmenge ab', () => {
    expect(istPruefArtikel({ ...artikel, sollMenge: 1.5 })).toBe(false);
  });

  it('weist ein fehlendes Verfallsdatum-Kennzeichen ab, statt es stillschweigend zu erfinden', () => {
    const { verfallsdatumPflicht: _weg, ...ohne } = artikel;
    expect(istPruefArtikel(ohne)).toBe(false);
  });
});

describe('istPruefvorlage', () => {
  it('nimmt eine vollständige Vorlage an', () => {
    expect(istPruefvorlage(erzeugeTestvorlage())).toBe(true);
  });

  it('weist eine Vorlage ab, in der ein einzelner Artikel fehlerhaft ist', () => {
    const vorlage = erzeugeTestvorlage();
    const kaputt = structuredClone(vorlage) as unknown as {
      faecher: { artikel: { herkunft: string }[] }[];
    };
    kaputt.faecher[0]!.artikel[1]!.herkunft = 'bund';
    expect(istPruefvorlage(kaputt)).toBe(false);
  });

  it('weist eine leere Bezeichnung ab', () => {
    expect(istPruefvorlage(erzeugeTestvorlage({ bezeichnung: '' }))).toBe(false);
  });
});

describe('istPruefvorlageKopf', () => {
  it('nimmt einen Kopf ohne Baum an, weil die Liste ihn nie mitliefert', () => {
    expect(
      istPruefvorlageKopf({
        id: 'v',
        bezeichnung: 'V',
        beschreibung: '',
        grundlage: '',
        anzahlFaecher: 0,
        anzahlArtikel: 0,
        geaendertAm: '2026-01-01T10:00:00.000Z',
        geaendertVon: '',
      }),
    ).toBe(true);
  });
});

describe('istBehaelter und istBehaelterUebersicht', () => {
  it('nimmt einen vollständigen Behälter an', () => {
    expect(istBehaelter(erzeugeTestbehaelter())).toBe(true);
  });

  it('weist einen Behälter ohne Fahrzeug ab', () => {
    expect(istBehaelter(erzeugeTestbehaelter({ fahrzeugId: '' }))).toBe(false);
  });

  it('nimmt eine Übersicht ohne bisherigen Check an', () => {
    expect(istBehaelterUebersicht(erzeugeTestuebersicht())).toBe(true);
  });

  it('nimmt eine Übersicht mit Kennzahlen des letzten Checks an', () => {
    expect(
      istBehaelterUebersicht(
        erzeugeTestuebersicht({
          zuletztGeprueftAm: '2026-03-01',
          letzterCheckId: 'check-1',
          letzteFehlmengen: 2,
          letzteUnbrauchbar: 0,
          letzteAbgelaufen: 3,
        }),
      ),
    ).toBe(true);
  });

  it('weist eine Übersicht ohne Fahrzeugangaben ab', () => {
    const { fahrzeugBezeichnung: _weg, ...ohne } = erzeugeTestuebersicht();
    expect(istBehaelterUebersicht(ohne)).toBe(false);
  });
});
