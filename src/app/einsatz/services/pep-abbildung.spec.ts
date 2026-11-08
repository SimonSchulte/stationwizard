import { describe, expect, it } from 'vitest';
import { Planung } from '../models/planung.model';
import {
  pepInhaltZuPlanung,
  pepKennzahlen,
  pepVorlageAnwenden,
  planungZuPepInhalt,
  planungZuPepVorlageInhalt,
} from './pep-abbildung';
import { istPepInhalt, istPepVorlageInhalt } from './pep-pruefung';

const KOPF = {
  id: 'einsatz-1',
  name: 'Übungsdienst',
  start: '2026-12-05T10:00',
  end: '2026-12-05T20:00',
};

/** Planung mit allen optionalen Feldern des Editor-Modells. */
function volllePlanung(): Planung {
  const anna = {
    id: 'ek-anna',
    name: 'Muster Anna',
    tags: {
      taktisch: ['GF' as const],
      medizinisch: ['RS' as const, 'NotSan' as const],
      zusatz: ['CE'],
    },
    meta: { notes: 'Nur vormittags' },
    hiorg_org_id: 'org-17',
    telefonnummer: '0170 1234567',
    kuerzel: 'MUA',
  };
  const ben = { id: 'ek-ben', name: 'Beispiel Ben', tags: {} };
  return {
    ...KOPF,
    beschreibung: 'Fest am Markt',
    hiorg_einsatz_id: '4711',
    einsatzkraefte: [anna, ben],
    einsatzleiter: { id: anna.id, name: anna.name },
    posten: [
      {
        id: 'p1',
        label: 'Station Nord',
        fahrzeug: { funkruf: 'RK 1', seriennummer: 'S-1', hiorgId: 'h-1' },
        telefonnummer: '0521 000',
        hiorg_schicht_id: 'schicht-9',
        positions: [
          {
            id: 'pos1',
            label: 'Führung',
            requirements: { taktisch: 'GF', medizinisch: 'RS', zusatz: 'CE' },
            assigned: { id: 'ek-anna', name: 'Muster Anna' },
            isPostenfuehrer: true,
          },
          {
            id: 'pos2',
            label: 'Helfer',
            requirements: { taktisch: null, medizinisch: null },
            assigned: null,
          },
        ],
      },
      {
        id: 'p2',
        label: 'Station Süd',
        fahrzeug: null,
        positions: [
          {
            id: 'pos3',
            label: '',
            requirements: { taktisch: null, medizinisch: 'EH' },
            assigned: { id: 'ek-ben', name: 'Beispiel Ben' },
          },
        ],
      },
    ],
  };
}

describe('planungZuPepInhalt / pepInhaltZuPlanung', () => {
  it('ist ein gültiger Inhalt nach dem Vertrag', () => {
    const inhalt = planungZuPepInhalt(volllePlanung());
    expect(istPepInhalt(inhalt)).toBe(true);
    expect(inhalt.einsatzleiterId).toBe('ek-anna');
    expect(inhalt.einsatzkraefte[0]).toEqual({
      id: 'ek-anna',
      name: 'Muster Anna',
      taktisch: ['GF'],
      medizinisch: ['RS', 'NotSan'],
      zusatz: ['CE'],
      notiz: 'Nur vormittags',
      hiorgOrgId: 'org-17',
      telefonnummer: '0170 1234567',
      kuerzel: 'MUA',
    });
    expect(inhalt.posten[0]).toMatchObject({
      bezeichnung: 'Station Nord',
      hiorgSchichtId: 'schicht-9',
      telefonnummer: '0521 000',
    });
    expect(inhalt.posten[0].positionen[0]).toMatchObject({
      anforderungen: { taktisch: 'GF', medizinisch: 'RS', zusatz: 'CE' },
      postenfuehrer: true,
      einsatzkraftId: 'ek-anna',
    });
    expect(inhalt.posten[0].positionen[1].postenfuehrer).toBe(false);
    // Der Vertrag trägt nur die Id, nie den Namen der Zuordnung.
    expect(JSON.stringify(inhalt.posten)).not.toContain('Muster Anna');
  });

  it('läuft verlustfrei bis auf Name, Zeitraum und Dateihülle', () => {
    const planung = volllePlanung();
    const zurueck = pepInhaltZuPlanung(planungZuPepInhalt(planung), {
      ...KOPF,
      hiorgEinsatzId: '4711',
    });
    expect(zurueck).toEqual(planung);
  });

  it('nimmt Name und Zeitraum aus dem Kopf, nicht aus der Planung', () => {
    const inhalt = planungZuPepInhalt(volllePlanung());
    const planung = pepInhaltZuPlanung(inhalt, {
      id: 'neu',
      name: 'Umbenannt',
      start: '2027-01-01T08:00',
      end: '2027-01-01T09:00',
    });
    expect(planung).toMatchObject({
      id: 'neu',
      name: 'Umbenannt',
      start: '2027-01-01T08:00',
      end: '2027-01-01T09:00',
    });
    expect(planung.hiorg_einsatz_id).toBeUndefined();
  });

  it('holt den Namen der Zuordnung aus den Einsatzkräften', () => {
    const inhalt = planungZuPepInhalt(volllePlanung());
    inhalt.einsatzkraefte[0].name = 'Muster Annabell';
    const planung = pepInhaltZuPlanung(inhalt, KOPF);
    expect(planung.posten[0].positions[0].assigned).toEqual({
      id: 'ek-anna',
      name: 'Muster Annabell',
    });
    expect(planung.einsatzleiter).toEqual({ id: 'ek-anna', name: 'Muster Annabell' });
  });

  it('verwirft eine Zuordnung auf eine nicht vorhandene Einsatzkraft', () => {
    const planung = volllePlanung();
    planung.posten[0].positions[0].assigned = { id: 'ek-weg', name: 'Gelöscht Gerd' };
    planung.einsatzleiter = { id: 'ek-weg', name: 'Gelöscht Gerd' };
    const inhalt = planungZuPepInhalt(planung);
    expect(inhalt.posten[0].positionen[0].einsatzkraftId).toBeNull();
    expect(inhalt.einsatzleiterId).toBeNull();
    expect(istPepInhalt(inhalt)).toBe(true);
    // Die übrigen Zuordnungen bleiben.
    expect(inhalt.posten[1].positionen[0].einsatzkraftId).toBe('ek-ben');
  });

  it('übersetzt eine fehlende Beschreibung in leeren Text und zurück', () => {
    const planung = { ...volllePlanung(), beschreibung: undefined };
    const inhalt = planungZuPepInhalt(planung);
    expect(inhalt.beschreibung).toBe('');
    expect(pepInhaltZuPlanung(inhalt, KOPF).beschreibung).toBeNull();
  });
});

describe('Vorlagen', () => {
  it('verwirft Einsatzkräfte, Zuordnungen und Einsatzleitung', () => {
    const vorlage = planungZuPepVorlageInhalt(volllePlanung());
    expect(istPepVorlageInhalt(vorlage)).toBe(true);
    expect(Object.keys(vorlage).sort()).toEqual(['beschreibung', 'posten']);
    expect(vorlage.posten.flatMap((p) => p.positionen.map((pos) => pos.einsatzkraftId))).toEqual([
      null,
      null,
      null,
    ]);
    // Postenangaben bleiben als Vorgabe.
    expect(vorlage.posten[0]).toMatchObject({
      fahrzeug: { funkruf: 'RK 1' },
      hiorgSchichtId: 'schicht-9',
    });
    expect(vorlage.posten[0].positionen[0].postenfuehrer).toBe(true);
  });

  it('wendet eine Vorlage mit neuen Ids und leeren Einsatzkräften an', () => {
    const vorlage = planungZuPepVorlageInhalt(volllePlanung());
    let zaehler = 0;
    const inhalt = pepVorlageAnwenden(vorlage, () => `neu-${++zaehler}`);
    expect(istPepInhalt(inhalt)).toBe(true);
    expect(inhalt.einsatzkraefte).toEqual([]);
    expect(inhalt.einsatzleiterId).toBeNull();
    const ids = inhalt.posten.flatMap((p) => [p.id, ...p.positionen.map((pos) => pos.id)]);
    expect(ids.every((id) => id.startsWith('neu-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(inhalt.posten[0].bezeichnung).toBe('Station Nord');
    // Die Vorlage selbst bleibt unverändert.
    expect(vorlage.posten[0].id).toBe('p1');
  });

  it('erzeugt ohne Vorgabe eindeutige UUIDs', () => {
    const vorlage = planungZuPepVorlageInhalt(volllePlanung());
    const a = pepVorlageAnwenden(vorlage);
    const b = pepVorlageAnwenden(vorlage);
    expect(a.posten[0].id).not.toBe(b.posten[0].id);
    expect(a.posten[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('pepKennzahlen', () => {
  it('zählt Posten, Positionen und besetzte Positionen', () => {
    expect(pepKennzahlen(planungZuPepInhalt(volllePlanung()))).toEqual({
      posten: 2,
      positionen: 3,
      besetzt: 2,
    });
    expect(
      pepKennzahlen({ beschreibung: '', posten: [], einsatzkraefte: [], einsatzleiterId: null }),
    ).toEqual({ posten: 0, positionen: 0, besetzt: 0 });
  });
});
