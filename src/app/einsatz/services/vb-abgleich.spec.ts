import { describe, expect, it } from 'vitest';
import { VbInhalt } from '../models/vb.model';
import {
  testAbschnitt,
  testInhalt,
  testLaufzettel,
  testPosition,
  testVorlage,
} from '../testing/vb-testdaten';
import { kopiereVorlage } from './vb-kopie';
import { istVbInhalt } from './vb-pruefung';
import { vbAbgleich, wendeAenderungenAn } from './vb-abgleich';

function vorlageMitDreiLaufzetteln(): VbInhalt {
  return testInhalt({
    anweisungen: 'Anweisung',
    abschnitte: [
      testAbschnitt({
        titel: 'Betreuung',
        laufzettel: [
          testLaufzettel({
            lagerort: 'Lager A',
            positionen: [
              testPosition({ material: 'Stühle', anzahl: '10' }),
              testPosition({ material: 'Tische', anzahl: '2' }),
            ],
          }),
          testLaufzettel({ lagerort: 'Lager B', positionen: [testPosition({ material: 'Zelt' })] }),
        ],
      }),
      testAbschnitt({
        titel: 'TeSi',
        farbe: 'abschnitt-2',
        fachgruppe: 'tesi',
        laufzettel: [testLaufzettel({ lagerort: 'Lager C', fachgruppe: 'tesi' })],
      }),
    ],
  });
}

function schluesselVon(vorlage: VbInhalt, vb: VbInhalt, art?: string) {
  return new Set(
    vbAbgleich(vorlage, vb)
      .filter((a) => art === undefined || a.art === art)
      .map((a) => a.schluessel),
  );
}

function alleSchluessel(vorlage: VbInhalt, vb: VbInhalt) {
  return schluesselVon(vorlage, vb);
}

describe('vbAbgleich', () => {
  const vorlage = vorlageMitDreiLaufzetteln();
  const frischeKopie = () =>
    structuredClone(
      kopiereVorlage({ id: crypto.randomUUID(), titel: 'V', inhalt: vorlage }, 1).inhalt,
    );

  it('meldet bei unveränderter Kopie nichts', () => {
    expect(vbAbgleich(vorlage, frischeKopie())).toEqual([]);
  });

  it('erkennt geänderte Anweisungen', () => {
    const vb = { ...frischeKopie(), anweisungen: 'Neu' };
    const [aenderung] = vbAbgleich(vorlage, vb);
    expect(aenderung).toMatchObject({
      schluessel: 'anweisungen',
      art: 'geaendert',
      ebene: 'anweisungen',
      standardGewaehlt: true,
    });
  });

  it('erkennt Abschnittsänderungen mit lesbarer Beschreibung', () => {
    const vb = frischeKopie();
    vb.abschnitte[0].titel = 'Betreuung Nord';
    vb.abschnitte[0].farbe = 'abschnitt-3';
    const [aenderung] = vbAbgleich(vorlage, vb);
    expect(aenderung.art).toBe('geaendert');
    expect(aenderung.titel).toBe('Abschnitt „Betreuung“');
    expect(aenderung.beschreibung).toContain('Titel: „Betreuung“ → „Betreuung Nord“');
    expect(aenderung.beschreibung).toContain('Farbe: Orange → Magenta');
  });

  it('fasst alle Unterschiede eines Laufzettels samt Positionen zu einer Änderung zusammen', () => {
    const vb = frischeKopie();
    const lz = vb.abschnitte[0].laufzettel[0];
    lz.lagerort = 'Lager Z';
    lz.positionen[0].anzahl = '12';
    lz.positionen.pop();
    lz.positionen.push(testPosition({ material: 'Bänke' }));
    const aenderungen = vbAbgleich(vorlage, vb);
    expect(aenderungen).toHaveLength(1);
    expect(aenderungen[0].art).toBe('geaendert');
    expect(aenderungen[0].beschreibung).toContain('Von: „Lager A“ → „Lager Z“');
    expect(aenderungen[0].beschreibung).toContain('Positionen: 1 neu, 1 geändert, 1 gelöscht');
  });

  it('erkennt neue und gelöschte Laufzettel; Löschungen sind nicht vorgewählt', () => {
    const vb = frischeKopie();
    vb.abschnitte[0].laufzettel.splice(1, 1);
    vb.abschnitte[1].laufzettel.push(testLaufzettel({ lagerort: 'Neu' }));
    const aenderungen = vbAbgleich(vorlage, vb);
    const geloescht = aenderungen.find((a) => a.art === 'geloescht');
    const neu = aenderungen.find((a) => a.art === 'neu');
    expect(geloescht).toMatchObject({ ebene: 'laufzettel', standardGewaehlt: false });
    expect(neu).toMatchObject({ ebene: 'laufzettel', standardGewaehlt: true });
    expect(aenderungen).toHaveLength(2);
  });

  it('behandelt einen unbekannten herkunftId-Verweis als neu', () => {
    const vb = frischeKopie();
    vb.abschnitte[0].laufzettel[0].herkunftId = crypto.randomUUID();
    const arten = vbAbgleich(vorlage, vb)
      .map((a) => a.art)
      .sort();
    expect(arten).toEqual(['geloescht', 'neu']);
  });

  it('listet Laufzettel eines neuen oder gelöschten Abschnitts nicht einzeln', () => {
    const vb = frischeKopie();
    vb.abschnitte.push(testAbschnitt({ titel: 'Neu', laufzettel: [testLaufzettel()] }));
    vb.abschnitte.splice(1, 1);
    const aenderungen = vbAbgleich(vorlage, vb);
    expect(aenderungen.map((a) => `${a.art}:${a.ebene}`).sort()).toEqual([
      'geloescht:abschnitt',
      'neu:abschnitt',
    ]);
  });

  it('erkennt Verschieben in einen anderen Abschnitt und Umsortieren', () => {
    const vb = frischeKopie();
    const [verschoben] = vb.abschnitte[0].laufzettel.splice(1, 1);
    vb.abschnitte[1].laufzettel.unshift(verschoben);
    vb.abschnitte.reverse();
    const aenderungen = vbAbgleich(vorlage, vb);
    const verschiebung = aenderungen.find((a) => a.ebene === 'laufzettel');
    expect(verschiebung?.beschreibung).toContain('Verschoben von „Betreuung“ nach „TeSi“');
    expect(aenderungen.some((a) => a.schluessel === 'reihenfolge:abschnitte')).toBe(true);
  });

  it('vergibt stabile Schlüssel', () => {
    const vb = frischeKopie();
    vb.abschnitte[0].laufzettel[0].lagerort = 'X';
    expect(alleSchluessel(vorlage, vb)).toEqual(alleSchluessel(vorlage, vb));
  });
});

describe('wendeAenderungenAn', () => {
  const vorlage = vorlageMitDreiLaufzetteln();
  const frischeKopie = () =>
    structuredClone(
      kopiereVorlage({ id: crypto.randomUUID(), titel: 'V', inhalt: vorlage }, 1).inhalt,
    );

  it('lässt bei leerer Auswahl beide Stände unverändert', () => {
    const vb = frischeKopie();
    vb.abschnitte[0].laufzettel[0].lagerort = 'X';
    vb.abschnitte[1].laufzettel.pop();
    const ergebnis = wendeAenderungenAn(vorlage, vb, new Set());
    expect(ergebnis.vorlage).toEqual(vorlage);
    expect(ergebnis.vb).toEqual(vb);
  });

  it('verändert die Eingaben nie', () => {
    const vb = frischeKopie();
    vb.abschnitte[0].laufzettel[0].lagerort = 'X';
    vb.abschnitte[0].laufzettel.push(testLaufzettel());
    const vorher = JSON.stringify([vorlage, vb]);
    wendeAenderungenAn(vorlage, vb, alleSchluessel(vorlage, vb));
    expect(JSON.stringify([vorlage, vb])).toBe(vorher);
  });

  it('übernimmt eine Feldänderung und danach ist der Abgleich leer', () => {
    const vb = frischeKopie();
    vb.anweisungen = 'Geänderte Anweisung';
    vb.abschnitte[0].titel = 'Betreuung neu';
    vb.abschnitte[0].laufzettel[0].transportMit = 'Gitterwagen';
    vb.abschnitte[0].laufzettel[0].positionen[1].anzahl = '5';
    const ergebnis = wendeAenderungenAn(vorlage, vb, alleSchluessel(vorlage, vb));
    expect(ergebnis.vorlage.anweisungen).toBe('Geänderte Anweisung');
    expect(ergebnis.vorlage.abschnitte[0].titel).toBe('Betreuung neu');
    expect(ergebnis.vorlage.abschnitte[0].laufzettel[0].transportMit).toBe('Gitterwagen');
    expect(ergebnis.vorlage.abschnitte[0].laufzettel[0].positionen[1].anzahl).toBe('5');
    expect(ergebnis.vorlage.abschnitte[0].laufzettel[0].positionen[1].id).toBe(
      vorlage.abschnitte[0].laufzettel[0].positionen[1].id,
    );
    expect(vbAbgleich(ergebnis.vorlage, ergebnis.vb)).toEqual([]);
    expect(istVbInhalt(ergebnis.vorlage)).toBe(true);
  });

  it('wendet nur die gewählten Änderungen an', () => {
    const vb = frischeKopie();
    vb.abschnitte[0].laufzettel[0].lagerort = 'A2';
    vb.abschnitte[1].laufzettel[0].lagerort = 'C2';
    const aenderungen = vbAbgleich(vorlage, vb);
    expect(aenderungen).toHaveLength(2);
    const ergebnis = wendeAenderungenAn(vorlage, vb, new Set([aenderungen[0].schluessel]));
    const lagerorte = ergebnis.vorlage.abschnitte.flatMap((a) =>
      a.laufzettel.map((l) => l.lagerort),
    );
    expect(lagerorte).toEqual(['A2', 'Lager B', 'Lager C']);
    expect(vbAbgleich(ergebnis.vorlage, ergebnis.vb)).toHaveLength(1);
  });

  it('legt neue Laufzettel mit neuer Id an und setzt die herkunftId in der VB', () => {
    const vb = frischeKopie();
    const neu = testLaufzettel({
      lagerort: 'Neu',
      positionen: [testPosition({ material: 'Pavillon' })],
    });
    vb.abschnitte[0].laufzettel.splice(1, 0, neu);
    let n = 0;
    const ergebnis = wendeAenderungenAn(
      vorlage,
      vb,
      alleSchluessel(vorlage, vb),
      () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
    );
    const inVorlage = ergebnis.vorlage.abschnitte[0].laufzettel;
    expect(inVorlage.map((l) => l.lagerort)).toEqual(['Lager A', 'Neu', 'Lager B']);
    const kopie = inVorlage[1];
    expect(kopie.id).not.toBe(neu.id);
    expect(kopie.herkunftId).toBeNull();
    expect(kopie.positionen[0].herkunftId).toBeNull();
    const inVb = ergebnis.vb.abschnitte[0].laufzettel[1];
    expect(inVb.id).toBe(neu.id);
    expect(inVb.herkunftId).toBe(kopie.id);
    expect(inVb.positionen[0].herkunftId).toBe(kopie.positionen[0].id);
    expect(vbAbgleich(ergebnis.vorlage, ergebnis.vb)).toEqual([]);
  });

  it('wendet eine gewählte Löschung an und lässt eine abgewählte stehen', () => {
    const vb = frischeKopie();
    vb.abschnitte[0].laufzettel.splice(0, 1);
    vb.abschnitte[1].laufzettel.splice(0, 1);
    const geloescht = vbAbgleich(vorlage, vb);
    expect(geloescht.every((a) => !a.standardGewaehlt)).toBe(true);
    const erste = geloescht.find((a) => a.titel.includes('Lager A'));
    const ergebnis = wendeAenderungenAn(vorlage, vb, new Set([erste!.schluessel]));
    expect(ergebnis.vorlage.abschnitte[0].laufzettel.map((l) => l.lagerort)).toEqual(['Lager B']);
    expect(ergebnis.vorlage.abschnitte[1].laufzettel).toHaveLength(1);
  });

  it('legt neue Abschnitte an der richtigen Stelle an und löscht Abschnitte', () => {
    const vb = frischeKopie();
    const neu = testAbschnitt({ titel: 'Mitte', laufzettel: [testLaufzettel({ lagerort: 'M' })] });
    vb.abschnitte.splice(1, 0, neu);
    const ergebnis = wendeAenderungenAn(vorlage, vb, alleSchluessel(vorlage, vb));
    expect(ergebnis.vorlage.abschnitte.map((a) => a.titel)).toEqual(['Betreuung', 'Mitte', 'TeSi']);
    expect(ergebnis.vorlage.abschnitte[1].laufzettel[0].lagerort).toBe('M');
    expect(ergebnis.vb.abschnitte[1].herkunftId).toBe(ergebnis.vorlage.abschnitte[1].id);
    expect(vbAbgleich(ergebnis.vorlage, ergebnis.vb)).toEqual([]);

    const ohneTesi = frischeKopie();
    ohneTesi.abschnitte.pop();
    const loeschen = wendeAenderungenAn(vorlage, ohneTesi, alleSchluessel(vorlage, ohneTesi));
    expect(loeschen.vorlage.abschnitte.map((a) => a.titel)).toEqual(['Betreuung']);
  });

  it('übernimmt Verschieben zwischen Abschnitten und beide Reihenfolgen', () => {
    const vb = frischeKopie();
    const [verschoben] = vb.abschnitte[0].laufzettel.splice(0, 1);
    vb.abschnitte[1].laufzettel.push(verschoben);
    vb.abschnitte.reverse();
    const ergebnis = wendeAenderungenAn(vorlage, vb, alleSchluessel(vorlage, vb));
    expect(ergebnis.vorlage.abschnitte.map((a) => a.titel)).toEqual(['TeSi', 'Betreuung']);
    expect(ergebnis.vorlage.abschnitte[0].laufzettel.map((l) => l.lagerort)).toEqual([
      'Lager C',
      'Lager A',
    ]);
    expect(ergebnis.vorlage.abschnitte[1].laufzettel.map((l) => l.lagerort)).toEqual(['Lager B']);
    expect(vbAbgleich(ergebnis.vorlage, ergebnis.vb)).toEqual([]);
  });

  it('ordnet Laufzettel innerhalb eines Abschnitts um', () => {
    const vb = frischeKopie();
    vb.abschnitte[0].laufzettel.reverse();
    const aenderungen = vbAbgleich(vorlage, vb);
    expect(aenderungen.map((a) => a.ebene)).toEqual(['reihenfolge']);
    const ergebnis = wendeAenderungenAn(vorlage, vb, alleSchluessel(vorlage, vb));
    expect(ergebnis.vorlage.abschnitte[0].laufzettel.map((l) => l.lagerort)).toEqual([
      'Lager B',
      'Lager A',
    ]);
  });

  it('ignoriert unbekannte Schlüssel', () => {
    const vb = frischeKopie();
    const ergebnis = wendeAenderungenAn(vorlage, vb, new Set(['gibt-es-nicht']));
    expect(ergebnis.vorlage).toEqual(vorlage);
  });

  it('funktioniert auch für eine Vorlage aus testVorlage()', () => {
    const v = testVorlage();
    const kopie = kopiereVorlage(v, 3);
    kopie.inhalt.abschnitte[0].laufzettel[0].positionen[0].material = 'Anders';
    const ergebnis = wendeAenderungenAn(
      v.inhalt,
      kopie.inhalt,
      alleSchluessel(v.inhalt, kopie.inhalt),
    );
    expect(ergebnis.vorlage.abschnitte[0].laufzettel[0].positionen[0].material).toBe('Anders');
  });
});
