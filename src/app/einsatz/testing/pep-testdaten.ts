import { Pep, PepInhalt, PepVorlage } from '../models/pep.model';

/** Kleine, erfundene PEP: ein Posten mit zwei Positionen, eine Einsatzkraft auf einer davon. */
export function testPepInhalt(ueberschreibung: Partial<PepInhalt> = {}): PepInhalt {
  return {
    beschreibung: 'Übungsdienst',
    posten: [
      {
        id: 'posten-1',
        bezeichnung: 'Sanitätsstation',
        fahrzeug: { funkruf: 'Florian Test 1', seriennummer: null, hiorgId: null },
        telefonnummer: null,
        hiorgSchichtId: null,
        positionen: [
          {
            id: 'position-1',
            bezeichnung: 'Gruppenführung',
            anforderungen: { taktisch: 'GF', medizinisch: 'RS', zusatz: null },
            postenfuehrer: true,
            einsatzkraftId: 'kraft-1',
          },
          {
            id: 'position-2',
            bezeichnung: 'Helfer',
            anforderungen: { taktisch: null, medizinisch: null, zusatz: null },
            postenfuehrer: false,
            einsatzkraftId: null,
          },
        ],
      },
    ],
    einsatzkraefte: [
      {
        id: 'kraft-1',
        name: 'Testperson Nord',
        taktisch: ['GF'],
        medizinisch: ['RS'],
        zusatz: [],
        notiz: null,
        hiorgOrgId: null,
        telefonnummer: null,
      },
    ],
    einsatzleiterId: 'kraft-1',
    ...ueberschreibung,
  };
}

export function testPep(ueberschreibung: Partial<Pep> = {}): Pep {
  return { schema: 1, vorlageId: null, inhalt: testPepInhalt(), ...ueberschreibung };
}

/** Vorlage mit denselben Posten wie `testPepInhalt()`, aber ohne Besetzung. */
export function testPepVorlage(ueberschreibung: Partial<PepVorlage> = {}): PepVorlage {
  const inhalt = testPepInhalt();
  return {
    id: crypto.randomUUID(),
    titel: 'Sanitätsdienst klein',
    inhalt: {
      beschreibung: inhalt.beschreibung,
      posten: inhalt.posten.map((p) => ({
        ...p,
        positionen: p.positionen.map((pos) => ({ ...pos, einsatzkraftId: null })),
      })),
    },
    ...ueberschreibung,
  };
}
