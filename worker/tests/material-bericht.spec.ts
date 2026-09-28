import { describe, expect, it } from 'vitest';
import {
  BerichtsQuelle,
  berichtAlsHtml,
  berichtAlsNachricht,
  berichtAlsText,
  istLandBeziehbar,
  mangelgruende,
} from '../src/material-bericht';
import { Checkposition } from '../src/material-check';

const HEUTE = '2026-09-21';

function position(ueberschreibung: Partial<Checkposition> = {}): Checkposition {
  return {
    artikelId: 'a1',
    fachId: 'f1',
    fach: 'Erstes Fach',
    bezeichnung: 'Erfundene Binde',
    sollMenge: 4,
    einheit: '',
    herkunft: 'land',
    verfallsdatumPflicht: true,
    geprueft: true,
    istMenge: 4,
    unbrauchbar: false,
    verfallsdaten: [null, null, null, null],
    ...ueberschreibung,
  };
}

function quelle(positionen: Checkposition[]): BerichtsQuelle {
  return {
    behaelterBezeichnung: 'NFR 3',
    fahrzeugBezeichnung: 'GW SAN Übung',
    vorlageBezeichnung: 'Erfundene Prüfvorlage',
    grundlage: 'Erfundene Grundlage',
    geprueftAm: '2026-09-20',
    erfasstVon: 'geprueft@example.test',
    gemeldetVonName: null,
    verfallsdatumErfasst: true,
    positionen,
  };
}

describe('istLandBeziehbar', () => {
  it('führt einen Artikel mit Landbezug immer über Land', () => {
    expect(istLandBeziehbar('land')).toBe(true);
    expect(istLandBeziehbar('beide')).toBe(true);
    expect(istLandBeziehbar('seg')).toBe(false);
  });
});

describe('mangelgruende', () => {
  it('meldet unbrauchbares Material', () => {
    expect(mangelgruende(position({ unbrauchbar: true }), HEUTE, true)).toEqual([
      'unbrauchbar geworden',
    ]);
  });

  it('meldet ein abgelaufenes Stück mit Nummer und Monat', () => {
    const gruende = mangelgruende(
      position({ verfallsdaten: [null, '2026-01', null, null] }),
      HEUTE,
      true,
    );
    expect(gruende).toEqual(['Verfallsdatum abgelaufen Stück 2/4: 01.2026']);
  });

  it('meldet ein bald ablaufendes Stück nicht als Mangel', () => {
    expect(
      mangelgruende(position({ verfallsdaten: ['2026-10', null, null, null] }), HEUTE, true),
    ).toEqual([]);
  });

  it('meldet nichts, wenn die Verfallsdatum-Erfassung abgeschaltet war', () => {
    const gruende = mangelgruende(
      position({ verfallsdaten: ['2020-01', null, null, null] }),
      HEUTE,
      false,
    );
    expect(gruende).toEqual([]);
  });

  it('wertet eine bloße Fehlmenge nicht als Mangel', () => {
    expect(mangelgruende(position({ istMenge: 1 }), HEUTE, true)).toEqual([]);
  });
});

describe('berichtAlsText – Bestellschein', () => {
  it('führt Land-beziehbare Positionen vor rein SEG-beziehbaren', () => {
    const text = berichtAlsText(
      quelle([
        position({ artikelId: 'a1', bezeichnung: 'SEG-Artikel', herkunft: 'seg', istMenge: 1 }),
        position({ artikelId: 'a2', bezeichnung: 'Land-Artikel', herkunft: 'land', istMenge: 0 }),
      ]),
      'bestellschein',
      HEUTE,
    );
    expect(text.indexOf('BESTELLLISTE LAND')).toBeLessThan(text.indexOf('BESTELLLISTE SEG'));
    expect(text.indexOf('Land-Artikel')).toBeLessThan(text.indexOf('SEG-Artikel'));
  });

  it('nennt die Fehlmenge mit Einheit, nicht die Istmenge', () => {
    const text = berichtAlsText(
      quelle([position({ istMenge: 1, einheit: 'Paar' })]),
      'bestellschein',
      HEUTE,
    );
    expect(text).toContain('3 Paar Erfundene Binde');
  });

  it('nennt eine vollständige Position gar nicht', () => {
    const text = berichtAlsText(quelle([position()]), 'bestellschein', HEUTE);
    expect(text).toContain('Keine Fehlmengen');
    expect(text).not.toContain('Erfundene Binde');
  });

  it('führt eine übererfüllte Menge nicht als Fehlmenge', () => {
    const text = berichtAlsText(quelle([position({ istMenge: 9 })]), 'bestellschein', HEUTE);
    expect(text).toContain('Keine Fehlmengen');
  });

  it('trägt Behälter, Fahrzeug, Prüftag und Grundlage im Kopf und Fuß', () => {
    const text = berichtAlsText(quelle([position()]), 'bestellschein', HEUTE);
    expect(text).toContain('NFR 3 · GW SAN Übung');
    expect(text).toContain('Geprüft am: 20.09.2026');
    expect(text).toContain('Grundlage: Erfundene Grundlage');
  });

  it('nennt den selbst angegebenen Namen, wenn die Meldung öffentlich kam', () => {
    const text = berichtAlsText(
      { ...quelle([position()]), gemeldetVonName: 'A. Person' },
      'bestellschein',
      HEUTE,
    );
    expect(text).toContain('Gemeldet von: A. Person (Selbstauskunft)');
  });
});

describe('berichtAlsText – Mängelanzeigen', () => {
  const positionen = [
    position({ artikelId: 'a1', bezeichnung: 'Land-Mangel', herkunft: 'land', unbrauchbar: true }),
    position({ artikelId: 'a2', bezeichnung: 'SEG-Mangel', herkunft: 'seg', unbrauchbar: true }),
    position({ artikelId: 'a3', bezeichnung: 'Nur Fehlmenge', herkunft: 'land', istMenge: 0 }),
  ];

  it('nennt in der Land-Anzeige nur Land-beziehbare Mängel', () => {
    const text = berichtAlsText(quelle(positionen), 'maengel-land', HEUTE);
    expect(text).toContain('Land-Mangel');
    expect(text).not.toContain('SEG-Mangel');
  });

  it('nennt in der SEG-Anzeige nur reine SEG-Mängel', () => {
    const text = berichtAlsText(quelle(positionen), 'maengel-seg', HEUTE);
    expect(text).toContain('SEG-Mangel');
    expect(text).not.toContain('Land-Mangel');
  });

  it('enthält keine bloße Fehlmenge – die gehört auf den Bestellschein', () => {
    const text = berichtAlsText(quelle(positionen), 'maengel-land', HEUTE);
    expect(text).not.toContain('Nur Fehlmenge');
  });

  it('sagt ausdrücklich, wenn nichts zu melden ist', () => {
    const text = berichtAlsText(quelle([position()]), 'maengel-land', HEUTE);
    expect(text).toContain('Keine Mängel gemeldet.');
  });
});

describe('berichtAlsHtml', () => {
  it('maskiert Bezeichnungen, statt sie roh einzusetzen', () => {
    const html = berichtAlsHtml(
      quelle([position({ bezeichnung: '<script>böse</script>', istMenge: 0 })]),
      'bestellschein',
      HEUTE,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('berichtAlsNachricht', () => {
  it('baut Betreff, Text und HTML aus demselben Stand', () => {
    const nachricht = berichtAlsNachricht(
      quelle([position({ istMenge: 0 })]),
      'bestellschein',
      'lager@example.test',
      'Materialmeldung',
      HEUTE,
    );
    expect(nachricht.an).toBe('lager@example.test');
    expect(nachricht.betreff).toBe('Materialmeldung – Bestellschein NFR 3 (20.09.2026)');
    expect(nachricht.text).toContain('Erfundene Binde');
    expect(nachricht.html).toContain('Erfundene Binde');
  });
});
