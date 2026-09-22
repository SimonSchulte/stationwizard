import { describe, expect, it } from 'vitest';
import {
  VorlagenFach,
  pruefeEntwurf,
  pruefePositionen,
  verfallsdatumStatus,
  zaehleKennzahlen,
} from '../src/material-check';

const HEUTE = '2026-09-21';

function faecher(): VorlagenFach[] {
  return [
    {
      id: 'f1',
      bezeichnung: 'Erstes Fach',
      artikel: [
        {
          id: 'a1',
          bezeichnung: 'Erfundene Binde',
          sollMenge: 2,
          einheit: '',
          herkunft: 'land',
          verfallsdatumPflicht: true,
        },
        {
          id: 'a2',
          bezeichnung: 'Erfundene Schere',
          sollMenge: 1,
          einheit: '',
          herkunft: 'seg',
          verfallsdatumPflicht: false,
        },
      ],
    },
  ];
}

function position(ueberschreibung: Record<string, unknown> = {}) {
  return {
    artikelId: 'a1',
    geprueft: true,
    istMenge: 2,
    unbrauchbar: false,
    verfallsdaten: [null, null],
    ...ueberschreibung,
  };
}

function vollstaendig(ueberschreibung: Record<string, unknown>[] = []) {
  return [
    position(),
    position({ artikelId: 'a2', istMenge: 1, verfallsdaten: [null] }),
    ...ueberschreibung,
  ];
}

describe('verfallsdatumStatus', () => {
  it('gilt bis zum letzten Tag des Monats, nicht bis zum ersten', () => {
    // September 2026 endet am 30.; am 21. ist er noch gültig.
    expect(verfallsdatumStatus('2026-09', HEUTE)).toBe('laeuft-ab');
    expect(verfallsdatumStatus('2026-08', HEUTE)).toBe('abgelaufen');
  });

  it('meldet ein Datum innerhalb der Warnfrist als bald ablaufend', () => {
    // 31.12.2026 ist 101 Tage entfernt, 30.11.2026 genau 70.
    expect(verfallsdatumStatus('2026-11', HEUTE)).toBe('laeuft-ab');
    expect(verfallsdatumStatus('2026-12', HEUTE)).toBe('ok');
  });

  it('behandelt ein fehlendes oder unlesbares Datum als nicht erfasst, nicht als abgelaufen', () => {
    expect(verfallsdatumStatus(null, HEUTE)).toBe('keines');
    expect(verfallsdatumStatus('', HEUTE)).toBe('keines');
    expect(verfallsdatumStatus('2026-13', HEUTE)).toBe('keines');
    expect(verfallsdatumStatus('irgendwas', HEUTE)).toBe('keines');
  });
});

describe('pruefePositionen', () => {
  it('ergänzt die Momentaufnahme aus der Vorlage, nicht aus dem Anfragekörper', () => {
    const ergebnis = pruefePositionen(
      [
        position({ bezeichnung: 'Vorgetäuscht', sollMenge: 99, herkunft: 'beide' }),
        position({ artikelId: 'a2', istMenge: 1, verfallsdaten: [null] }),
      ],
      faecher(),
    );
    expect('positionen' in ergebnis).toBe(true);
    if (!('positionen' in ergebnis)) return;
    expect(ergebnis.positionen[0]?.bezeichnung).toBe('Erfundene Binde');
    expect(ergebnis.positionen[0]?.sollMenge).toBe(2);
    expect(ergebnis.positionen[0]?.herkunft).toBe('land');
    expect(ergebnis.positionen[0]?.fach).toBe('Erstes Fach');
  });

  it('weist einen Artikel ab, den die Vorlage nicht kennt', () => {
    const ergebnis = pruefePositionen(
      vollstaendig([position({ artikelId: 'fremd', verfallsdaten: [] })]),
      faecher(),
    );
    expect(ergebnis).toEqual({ fehler: 'unbekannter-artikel' });
  });

  it('weist einen doppelt eingereichten Artikel ab', () => {
    const ergebnis = pruefePositionen([...vollstaendig(), position()], faecher());
    expect(ergebnis).toEqual({ fehler: 'artikel-doppelt' });
  });

  it('weist einen unvollständigen Check ab, weil er kein Nachweis über den Behälter wäre', () => {
    expect(pruefePositionen([position()], faecher())).toEqual({ fehler: 'artikel-fehlt' });
  });

  it('verlangt genau ein Verfallsdatum je Stück', () => {
    const ergebnis = pruefePositionen(
      [position({ verfallsdaten: [null] }), position({ artikelId: 'a2', verfallsdaten: [null] })],
      faecher(),
    );
    expect(ergebnis).toEqual({ fehler: 'stueckzahl-passt-nicht' });
  });

  it('nimmt ein leeres Verfallsdatum als nicht erfasst an', () => {
    const ergebnis = pruefePositionen(
      [
        position({ verfallsdaten: ['', '2027-03'] }),
        position({ artikelId: 'a2', verfallsdaten: [null] }),
      ],
      faecher(),
    );
    expect('positionen' in ergebnis).toBe(true);
    if (!('positionen' in ergebnis)) return;
    expect(ergebnis.positionen[0]?.verfallsdaten).toEqual([null, '2027-03']);
  });

  it('weist ein unlesbares Verfallsdatum ab, statt es stillschweigend zu verwerfen', () => {
    const ergebnis = pruefePositionen(
      [position({ verfallsdaten: ['irgendwann', null] }), position({ artikelId: 'a2' })],
      faecher(),
    );
    expect(ergebnis).toEqual({ fehler: 'unlesbar' });
  });

  it('weist eine negative Istmenge ab', () => {
    const ergebnis = pruefePositionen([position({ istMenge: -1 })], faecher());
    expect(ergebnis).toEqual({ fehler: 'unlesbar' });
  });
});

describe('zaehleKennzahlen', () => {
  it('zählt Fehlmengen, Unbrauchbares und abgelaufene Stücke getrennt', () => {
    const ergebnis = pruefePositionen(
      [
        position({ istMenge: 1, unbrauchbar: true, verfallsdaten: ['2026-08', '2027-12'] }),
        position({ artikelId: 'a2', geprueft: false, istMenge: 1, verfallsdaten: [null] }),
      ],
      faecher(),
    );
    if (!('positionen' in ergebnis)) throw new Error('Positionen erwartet');
    const kennzahlen = zaehleKennzahlen(ergebnis.positionen, HEUTE);
    expect(kennzahlen).toEqual({
      gesamt: 2,
      geprueft: 1,
      fehlmengen: 1,
      unbrauchbar: 1,
      abgelaufen: 1,
      laeuftAb: 0,
    });
  });

  it('zählt eine übererfüllte Menge nicht als Fehlmenge', () => {
    const ergebnis = pruefePositionen(
      [position({ istMenge: 5 }), position({ artikelId: 'a2', verfallsdaten: [null] })],
      faecher(),
    );
    if (!('positionen' in ergebnis)) throw new Error('Positionen erwartet');
    expect(zaehleKennzahlen(ergebnis.positionen, HEUTE).fehlmengen).toBe(0);
  });
});

describe('pruefeEntwurf', () => {
  function entwurf(positionen: Record<string, unknown>) {
    return { verfallsdatumErfasst: false, bemerkung: 'halb fertig', positionen };
  }

  it('lässt einen unfertigen Stand zu: Vollständigkeit ist keine Bedingung', () => {
    const ergebnis = pruefeEntwurf(entwurf({ a1: position() }), faecher());
    expect('entwurf' in ergebnis).toBe(true);
    if (!('entwurf' in ergebnis)) return;
    expect(Object.keys(ergebnis.entwurf.positionen)).toEqual(['a1']);
    expect(ergebnis.entwurf.bemerkung).toBe('halb fertig');
  });

  it('nimmt auch einen vollständig leeren Stand an – so beginnt jeder Check', () => {
    expect(pruefeEntwurf(entwurf({}), faecher())).toEqual({
      entwurf: { verfallsdatumErfasst: false, bemerkung: 'halb fertig', positionen: {} },
    });
  });

  it('weist einen Artikel ab, den die Vorlage nicht kennt', () => {
    const ergebnis = pruefeEntwurf(
      entwurf({ unbekannt: position({ artikelId: 'unbekannt' }) }),
      faecher(),
    );
    expect(ergebnis).toEqual({ fehler: 'unbekannter-artikel' });
  });

  it('weist eine Verfallsdatenliste ab, die nicht zur Sollmenge passt', () => {
    const ergebnis = pruefeEntwurf(entwurf({ a1: position({ verfallsdaten: [null] }) }), faecher());
    expect(ergebnis).toEqual({ fehler: 'stueckzahl-passt-nicht' });
  });

  it('weist einen Wert ab, dessen artikelId dem Schlüssel widerspricht', () => {
    // Zwei Wahrheiten über dieselbe Position wären ein Zuordnungsfehler und
    // nicht stillschweigend zu heilen.
    const ergebnis = pruefeEntwurf(
      entwurf({ a1: position({ artikelId: 'a2', verfallsdaten: [null, null] }) }),
      faecher(),
    );
    expect(ergebnis).toEqual({ fehler: 'unlesbar' });
  });

  it('weist eine fehlende oder unlesbare Hülle ab', () => {
    expect(pruefeEntwurf(null, faecher())).toEqual({ fehler: 'unlesbar' });
    expect(pruefeEntwurf({ positionen: {} }, faecher())).toEqual({ fehler: 'unlesbar' });
    expect(pruefeEntwurf(entwurf([] as never), faecher())).toEqual({ fehler: 'unlesbar' });
  });
});
