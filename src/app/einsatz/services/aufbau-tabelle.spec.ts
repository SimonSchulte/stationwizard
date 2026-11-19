import { describe, expect, it } from 'vitest';
import type {
  AufbauEinheit,
  AufbauFreierEintrag,
  AufbauKistenEintrag,
} from '../models/aufbau.model';
import {
  testArtikelStamm,
  testEinheit,
  testId,
  testKiste,
  testLager,
} from '../testing/aufbau-testdaten';
import { istAufbauInhalt } from './aufbau-pruefung';
import {
  aufbauZuZeilen,
  istGleicherAufbau,
  vergleicheAufbau,
  zeilenZuAufbau,
  type AufbauTabellenZeile,
} from './aufbau-tabelle';

const halle = { ...testLager(1, 'Halle A', 1), plaetze: [{ id: testId(90), name: 'Regal 1' }] };
const keller = testLager(2, 'Keller', 2);
const verband = testArtikelStamm(10, 'Verbandpäckchen', 'Packung', halle.id);
const daten = { lager: [halle, keller], artikel: [verband] };

function kiste(extra: Partial<AufbauKistenEintrag> = {}): AufbauKistenEintrag {
  return {
    art: 'kiste',
    id: testId(300),
    kisteId: null,
    name: 'Kiste Rot',
    lagerId: keller.id,
    anzahl: 2,
    inhalt: [
      { artikelId: verband.id, menge: 4, bemerkung: 'steril' },
      { artikelId: null, name: 'Schere', einheit: 'Stück', menge: 1, bemerkung: '' },
    ],
    phase: 'vorher',
    ...extra,
  };
}

function frei(extra: Partial<AufbauFreierEintrag> = {}): AufbauFreierEintrag {
  return {
    art: 'frei',
    id: testId(301),
    name: 'Zeltsack',
    einheit: 'Stück',
    menge: 3,
    bemerkung: '',
    lagerId: halle.id,
    platzId: testId(90),
    phase: null,
    ...extra,
  };
}

function aufbau() {
  const wagen: AufbauEinheit = testEinheit({ id: testId(201), typ: 'wagen', name: 'Wagen 1' }, [
    frei(),
  ]);
  const fahrzeug: AufbauEinheit = testEinheit(
    { id: testId(200), typ: 'fahrzeug', name: 'GW-Lager', foto: 'data:image/jpeg;base64,xx' },
    [
      {
        art: 'artikel',
        id: testId(302),
        artikelId: verband.id,
        menge: 2,
        bemerkung: '',
        lagerId: halle.id,
        phase: null,
      },
      kiste(),
      { art: 'wagen', id: testId(303), einheit: wagen },
    ],
  );
  return { anweisungen: 'Bitte vorsichtig', einheiten: [fahrzeug] };
}

const kopie = (zeilen: AufbauTabellenZeile[]): AufbauTabellenZeile[] =>
  zeilen.map((z, i) => ({ ...z, zeile: i + 2 }));

describe('Aufbau als Tabelle', () => {
  it('Rundlauf ohne Änderung ergibt denselben Aufbau, auch mit Foto und Anweisungen', () => {
    const alt = aufbau();
    const zeilen = kopie(aufbauZuZeilen(alt, daten));
    const ergebnis = zeilenZuAufbau(zeilen, alt, daten);
    expect(ergebnis.warnungen).toEqual([]);
    expect(istGleicherAufbau(alt, ergebnis.inhalt)).toBe(true);
    expect(vergleicheAufbau(alt, ergebnis.inhalt)).toEqual({ neu: 0, entfernt: 0, geaendert: 0 });
  });

  it('schreibt Einheiten, Einträge und Kistenpositionen als eigene Zeilen', () => {
    const zeilen = aufbauZuZeilen(aufbau(), daten);
    expect(zeilen.map((z) => z.ebene)).toEqual([
      'Fahrzeug',
      'Artikel',
      'Kiste',
      'Kistenposition',
      'Kistenposition',
      'Wagen',
      'Freier Artikel',
    ]);
    const wagenZeile = zeilen[5]!;
    expect(wagenZeile).toMatchObject({ fahrzeug: 'GW-Lager', wagen: 'Wagen 1' });
    expect(zeilen[6]).toMatchObject({ lager: 'Halle A', platz: 'Regal 1', menge: '3' });
  });

  it('übernimmt geänderte Menge, Bemerkung, Phase und Lager, ohne Foto und Farbe zu verlieren', () => {
    const alt = aufbau();
    const zeilen = kopie(aufbauZuZeilen(alt, daten));
    zeilen[1] = {
      ...zeilen[1]!,
      menge: '5,5',
      phase: 'zum Schluss',
      lager: 'keller',
      bemerkung: 'neu',
    };
    const { inhalt, warnungen } = zeilenZuAufbau(zeilen, alt, daten);
    expect(warnungen).toEqual([]);
    expect(inhalt.einheiten[0]!.foto).toBe('data:image/jpeg;base64,xx');
    expect(inhalt.einheiten[0]!.inhalt[0]).toMatchObject({
      art: 'artikel',
      id: testId(302),
      menge: 5.5,
      phase: 'zum-schluss',
      lagerId: keller.id,
      bemerkung: 'neu',
    });
    expect(vergleicheAufbau(alt, inhalt)).toEqual({ neu: 0, entfernt: 0, geaendert: 1 });
    expect(istAufbauInhalt(inhalt)).toBe(true);
  });

  it('ergänzt Zeilen ohne ID und entfernt gelöschte Zeilen', () => {
    const alt = aufbau();
    const zeilen = kopie(aufbauZuZeilen(alt, daten));
    // Freier Artikel im Wagen löschen, neuer freier Artikel im Fahrzeug, neuer Katalogartikel in der Kiste.
    const ohneFrei = zeilen.filter((z) => z.ebene !== 'Freier Artikel');
    ohneFrei.push({
      ...zeilen[6]!,
      id: '',
      ebene: 'Freier Artikel',
      wagen: '',
      name: 'Klappstuhl',
      menge: '10',
    });
    const { inhalt, warnungen } = zeilenZuAufbau(ohneFrei, alt, daten);
    expect(warnungen).toEqual([]);
    const fahrzeug = inhalt.einheiten[0]!;
    const neuer = fahrzeug.inhalt.at(-1);
    expect(neuer).toMatchObject({ art: 'frei', name: 'Klappstuhl', menge: 10 });
    expect(neuer && 'id' in neuer && neuer.id).not.toBe(testId(301));
    const wagen = fahrzeug.inhalt.find((x) => x.art === 'wagen');
    expect(wagen?.art === 'wagen' && wagen.einheit.inhalt).toEqual([]);
    expect(vergleicheAufbau(alt, inhalt)).toEqual({ neu: 1, entfernt: 1, geaendert: 0 });
  });

  it('legt neue Fahrzeuge und Wagen samt Inhalt an und ordnet Kistenpositionen der Kiste zu', () => {
    const alt = aufbau();
    const zeilen = kopie(aufbauZuZeilen(alt, daten));
    const neu = (z: Partial<AufbauTabellenZeile>): AufbauTabellenZeile => ({
      zeile: 0,
      ebene: '',
      fahrzeug: '',
      wagen: '',
      kiste: '',
      name: '',
      menge: '',
      masseinheit: '',
      lager: '',
      platz: '',
      phase: '',
      bemerkung: '',
      standard: '',
      id: '',
      ...z,
    });
    zeilen.push(
      neu({ ebene: 'Fahrzeug', fahrzeug: 'KTW 2' }),
      neu({ ebene: 'Kiste', fahrzeug: 'KTW 2', name: 'Notfall', menge: '1' }),
      neu({
        ebene: 'Kistenposition',
        fahrzeug: 'KTW 2',
        kiste: 'notfall',
        name: 'verbandpäckchen',
        menge: '2',
      }),
      neu({
        ebene: 'Kistenposition',
        fahrzeug: 'KTW 2',
        kiste: 'Notfall',
        name: 'Tourniquet',
        masseinheit: 'Stück',
        menge: '1',
      }),
    );
    zeilen.forEach((z, i) => (z.zeile = i + 2));
    const { inhalt, warnungen } = zeilenZuAufbau(zeilen, alt, daten);
    expect(warnungen).toEqual([]);
    expect(inhalt.einheiten.map((e) => e.name)).toEqual(['GW-Lager', 'KTW 2']);
    const notfall = inhalt.einheiten[1]!.inhalt[0];
    expect(notfall).toMatchObject({ art: 'kiste', name: 'Notfall', anzahl: 1 });
    expect(notfall?.art === 'kiste' && notfall.inhalt).toEqual([
      { artikelId: verband.id, menge: 2, bemerkung: '' },
      { artikelId: null, name: 'Tourniquet', einheit: 'Stück', menge: 1, bemerkung: '' },
    ]);
    expect(istAufbauInhalt(inhalt)).toBe(true);
  });

  it('verlinkt eine Kiste ohne bekannte Verknüpfung über ihren Namen mit den Stammdaten', () => {
    const stamm = testKiste(400, 'Kiste Rot', keller.id, verband.id);
    const alt = aufbau();
    const zeilen = kopie(aufbauZuZeilen(alt, daten)).map((z) =>
      // eine Datei aus einem anderen Aufbau: die Zeilen-IDs sind hier unbekannt
      z.ebene === 'Kiste' || z.ebene === 'Kistenposition' ? { ...z, id: '' } : z,
    );
    const { inhalt } = zeilenZuAufbau(zeilen, alt, { ...daten, kisten: [stamm] });
    const eintrag = inhalt.einheiten[0]!.inhalt.find((x) => x.art === 'kiste');
    expect(eintrag).toMatchObject({ name: 'Kiste Rot', kisteId: stamm.id });
    // ohne Stammdaten-Kiste bleibt es unverknüpft
    const ohne = zeilenZuAufbau(zeilen, alt, daten).inhalt.einheiten[0]!.inhalt.find(
      (x) => x.art === 'kiste',
    );
    expect(ohne).toMatchObject({ kisteId: null });
  });

  it('meldet Fehlerhaftes mit Zeilennummer und behält den bisherigen Wert', () => {
    const alt = aufbau();
    const zeilen = kopie(aufbauZuZeilen(alt, daten));
    zeilen[1] = { ...zeilen[1]!, menge: 'viele', lager: 'Gibt es nicht', phase: 'später' };
    zeilen[2] = { ...zeilen[2]!, menge: '0' };
    zeilen.push({ ...zeilen[1]!, id: '', ebene: 'Unbekannt', zeile: 99 });
    const { inhalt, warnungen } = zeilenZuAufbau(zeilen, alt, daten);
    expect(warnungen.some((w) => w.startsWith('Zeile 3:') && w.includes('Menge'))).toBe(true);
    expect(warnungen.some((w) => w.startsWith('Zeile 3:') && w.includes('Lager'))).toBe(true);
    expect(warnungen.some((w) => w.startsWith('Zeile 3:') && w.includes('Phase'))).toBe(true);
    expect(warnungen.some((w) => w.startsWith('Zeile 4:') && w.includes('Anzahl'))).toBe(true);
    expect(warnungen.some((w) => w.startsWith('Zeile 99:'))).toBe(true);
    expect(inhalt.einheiten[0]!.inhalt[0]).toMatchObject({
      menge: 2,
      lagerId: halle.id,
      phase: null,
    });
    expect(inhalt.einheiten[0]!.inhalt[1]).toMatchObject({ anzahl: 2 });
  });

  it('übernimmt einen unbekannten Artikel als freien Artikel und überspringt unbekannte Einheiten', () => {
    const alt = aufbau();
    const zeilen = kopie(aufbauZuZeilen(alt, daten));
    zeilen[1] = { ...zeilen[1]!, id: '', name: 'Neuer Stoff', masseinheit: 'Rolle' };
    zeilen.push({ ...zeilen[1]!, id: '', fahrzeug: 'Gibt es nicht', zeile: 50 });
    const { inhalt, warnungen } = zeilenZuAufbau(zeilen, alt, daten);
    expect(
      inhalt.einheiten[0]!.inhalt.some((x) => x.art === 'frei' && x.name === 'Neuer Stoff'),
    ).toBe(true);
    expect(warnungen.some((w) => w.includes('nicht im Katalog'))).toBe(true);
    expect(warnungen.some((w) => w.startsWith('Zeile 50:'))).toBe(true);
  });

  it('entfernt eine Einheit samt Inhalt, wenn ihre Zeilen fehlen', () => {
    const alt = aufbau();
    const { inhalt } = zeilenZuAufbau([], alt, daten);
    expect(inhalt.einheiten).toEqual([]);
    expect(vergleicheAufbau(alt, inhalt).entfernt).toBe(5);
  });
});
