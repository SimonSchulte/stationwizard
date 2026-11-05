import { describe, expect, it } from 'vitest';
import { baueEinsatzListe } from './einsatz-liste';
import { testEinsatz } from '../testing/vb-testdaten';
import { EfsEinsatzGruppe } from '../models/planung.model';

const JETZT = new Date('2026-11-05T12:00:00Z');

function gruppe(id: string, titel: string, von: string, bis = von): EfsEinsatzGruppe {
  return { veranstaltung_id: id, titel, datum_von: von, datum_bis: bis, schichten: [] };
}
const eintrag = (teil: Parameters<typeof testEinsatz>[0]) => ({
  ...testEinsatz(teil),
  version: 1,
  vb: null,
});

describe('baueEinsatzListe', () => {
  it('mischt HiOrg und eigene Einsätze nach Beginn, ohne Beginn zuletzt', () => {
    const liste = baueEinsatzListe(
      [gruppe('2', 'Später', '2026-12-20 10:00:00'), gruppe('1', 'Früher', '2026-11-20 10:00:00')],
      [
        eintrag({ titel: 'Ohne Datum', beginn: null, ende: null }),
        eintrag({ titel: 'Dazwischen', beginn: '2026-12-01T09:00', ende: '2026-12-01T17:00' }),
      ],
      JETZT,
    );
    expect(liste.anstehend.map((z) => z.titel)).toEqual([
      'Früher',
      'Dazwischen',
      'Später',
      'Ohne Datum',
    ]);
    expect(liste.anstehend.map((z) => z.herkunft)).toEqual(['hiorg', 'eigen', 'hiorg', 'eigen']);
    expect(liste.vergangen).toEqual([]);
  });

  it('legt Vergangenes getrennt ab, neueste zuerst', () => {
    const liste = baueEinsatzListe(
      [gruppe('1', 'Altes Fest', '2026-09-01 10:00:00', '2026-09-01 18:00:00')],
      [eintrag({ titel: 'Jüngerer', beginn: '2026-10-10T10:00', ende: '2026-10-10T12:00' })],
      JETZT,
    );
    expect(liste.anstehend).toEqual([]);
    expect(liste.vergangen.map((z) => z.titel)).toEqual(['Jüngerer', 'Altes Fest']);
  });

  it('verknüpft Veranstaltungen mit ihrem Einsatz (PEP, VB) und ignoriert dessen eigene Zeile', () => {
    const einsatz = {
      ...eintrag({ hiorgVeranstaltungId: '1', pepId: crypto.randomUUID() }),
      vb: { laufzettel: 22, positionen: 64 },
    };
    const liste = baueEinsatzListe([gruppe('1', 'Markt', '2026-12-01 10:00:00')], [einsatz], JETZT);
    expect(liste.anstehend).toHaveLength(1);
    expect(liste.anstehend[0]).toMatchObject({
      schluessel: 'hiorg:1',
      beginn: '2026-12-01T10:00',
      pepVorhanden: true,
      vb: { laufzettel: 22, positionen: 64 },
    });
  });

  it('zeigt Veranstaltungen ohne Einsatz mit fehlendem PEP und VB', () => {
    const liste = baueEinsatzListe([gruppe('9', 'Neu', '2026-12-01 10:00:00')], [], JETZT);
    expect(liste.anstehend[0]).toMatchObject({ pepVorhanden: false, vb: null });
  });
});
