import { describe, expect, it } from 'vitest';
import {
  testAbschnitt,
  testInhalt,
  testLaufzettel,
  testPosition,
  testVorlage,
} from '../testing/vb-testdaten';
import { istVorbereitung } from './vb-pruefung';
import {
  inhaltAlsVorlage,
  kopiereVorlage,
  laufzettelDuplizieren,
  laufzettelTeilen,
  laufzettelZusammenfuehren,
  leererInhalt,
  naechsteAbschnittFarbe,
  neuePosition,
  neuerAbschnitt,
  neuerLaufzettel,
} from './vb-kopie';

function zaehler(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;
}

describe('kopiereVorlage', () => {
  const vorlage = testVorlage({
    inhalt: testInhalt({
      abschnitte: [
        testAbschnitt({
          laufzettel: [testLaufzettel({ positionen: [testPosition(), testPosition()] })],
        }),
      ],
    }),
  });

  it('setzt neue Ids, herkunftId und Vorlagenbezug', () => {
    const kopie = kopiereVorlage(vorlage, 4, zaehler());
    expect(kopie.vorlageId).toBe(vorlage.id);
    expect(kopie.vorlageVersion).toBe(4);
    expect(kopie.inhalt.anweisungen).toBe(vorlage.inhalt.anweisungen);
    const [a] = kopie.inhalt.abschnitte;
    const [va] = vorlage.inhalt.abschnitte;
    expect(a.id).not.toBe(va.id);
    expect(a.herkunftId).toBe(va.id);
    expect(a.laufzettel[0].herkunftId).toBe(va.laufzettel[0].id);
    expect(a.laufzettel[0].positionen.map((p) => p.herkunftId)).toEqual(
      va.laufzettel[0].positionen.map((p) => p.id),
    );
    expect(a.titel).toBe(va.titel);
  });

  it('lässt die Vorlage unverändert und liefert eine gültige Vorbereitung', () => {
    const vorher = JSON.stringify(vorlage);
    const kopie = kopiereVorlage(vorlage, 1);
    expect(JSON.stringify(vorlage)).toBe(vorher);
    expect(istVorbereitung(kopie)).toBe(true);
    const ids = JSON.stringify(kopie).match(/"id":"[^"]+"/g) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('inhaltAlsVorlage', () => {
  it('vergibt neue Ids und löscht alle herkunftIds', () => {
    const vorlage = testVorlage();
    const vb = kopiereVorlage(vorlage, 1).inhalt;
    const neu = inhaltAlsVorlage(vb);
    expect(neu.abschnitte[0].id).not.toBe(vb.abschnitte[0].id);
    expect(JSON.stringify(neu)).not.toMatch(/"herkunftId":"/);
  });
});

describe('Neuanlagen', () => {
  it('leererInhalt ist leer', () => {
    expect(leererInhalt()).toEqual({ anweisungen: '', abschnitte: [] });
  });

  it('neuerLaufzettel übernimmt Fachgruppe und Auftraggeber des Abschnitts', () => {
    const l = neuerLaufzettel({ fachgruppe: 'tesi' });
    expect(l.fachgruppe).toBe('tesi');
    expect(l.auftraggeber).toBe('GF TeSi');
    expect(l.ueberschrift).toBe('Material verlasten');
    expect(l.positionen).toEqual([]);
    const ohne = neuerLaufzettel(neuerAbschnitt());
    expect(ohne.fachgruppe).toBeNull();
    expect(ohne.auftraggeber).toBe('');
  });

  it('neuerAbschnitt und neuePosition haben eigene Ids und leere Herkunft', () => {
    const a = neuerAbschnitt('abschnitt-3');
    expect(a.farbe).toBe('abschnitt-3');
    expect(a.herkunftId).toBeNull();
    expect(a.titel.length).toBeGreaterThan(0);
    const p = neuePosition();
    expect(p).toMatchObject({ anzahl: '', material: '', herkunftId: null });
    expect(neuePosition().id).not.toBe(p.id);
  });

  it('naechsteAbschnittFarbe nimmt die erste unbenutzte, sonst reihum', () => {
    const inhalt = testInhalt({
      abschnitte: [
        testAbschnitt({ farbe: 'abschnitt-1' }),
        testAbschnitt({ farbe: 'abschnitt-3' }),
      ],
    });
    expect(naechsteAbschnittFarbe(inhalt)).toBe('abschnitt-2');
    const alle = testInhalt({
      abschnitte: Array.from({ length: 9 }, (_, i) =>
        testAbschnitt({ farbe: `abschnitt-${(i % 8) + 1}` as 'abschnitt-1' }),
      ),
    });
    expect(naechsteAbschnittFarbe(alle)).toBe('abschnitt-2');
  });
});

describe('Laufzettel umbauen', () => {
  const l = testLaufzettel({
    herkunftId: crypto.randomUUID(),
    positionen: [testPosition(), testPosition(), testPosition()],
  });

  it('dupliziert mit neuen Ids und ohne Herkunft', () => {
    const kopie = laufzettelDuplizieren(l);
    expect(kopie.id).not.toBe(l.id);
    expect(kopie.herkunftId).toBeNull();
    expect(kopie.positionen.map((p) => p.material)).toEqual(l.positionen.map((p) => p.material));
    expect(
      kopie.positionen.every((p, i) => p.id !== l.positionen[i].id && p.herkunftId === null),
    ).toBe(true);
  });

  it('teilt: gewählte Positionen wandern in einen neuen Laufzettel', () => {
    const { original, abgetrennt } = laufzettelTeilen(l, [l.positionen[2].id, 'unbekannt']);
    expect(original.id).toBe(l.id);
    expect(original.herkunftId).toBe(l.herkunftId);
    expect(original.positionen.map((p) => p.id)).toEqual([l.positionen[0].id, l.positionen[1].id]);
    expect(abgetrennt.id).not.toBe(l.id);
    expect(abgetrennt.herkunftId).toBeNull();
    expect(abgetrennt.positionen.map((p) => p.id)).toEqual([l.positionen[2].id]);
    expect(abgetrennt.lagerort).toBe(l.lagerort);
    expect(l.positionen).toHaveLength(3);
  });

  it('führt zusammen: Positionen angehängt, leere Kopffelder aufgefüllt', () => {
    const ziel = testLaufzettel({ lagerort: '', auftraggeber: 'GF X', fachgruppe: null });
    const quelle = testLaufzettel({ lagerort: 'Halle', auftraggeber: 'GF Y', fachgruppe: 'tesi' });
    const ergebnis = laufzettelZusammenfuehren(ziel, quelle);
    expect(ergebnis.id).toBe(ziel.id);
    expect(ergebnis.lagerort).toBe('Halle');
    expect(ergebnis.auftraggeber).toBe('GF X');
    expect(ergebnis.fachgruppe).toBe('tesi');
    expect(ergebnis.positionen).toHaveLength(ziel.positionen.length + quelle.positionen.length);
    expect(ziel.positionen).toHaveLength(1);
  });
});
