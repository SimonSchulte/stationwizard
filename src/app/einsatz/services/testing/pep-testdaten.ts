import { Planung } from '../../models/planung.model';

export function erzeugeTestplanung(): Planung {
  const person = {
    id: crypto.randomUUID(),
    name: 'Testperson Nord',
    tags: { taktisch: ['GF' as const], medizinisch: ['RS' as const] },
  };
  return {
    id: crypto.randomUUID(),
    name: 'Synthetischer Übungsplan',
    start: '2026-09-08T10:00:00+02:00',
    end: '2026-09-08T12:00:00+02:00',
    einsatzkraefte: [person],
    einsatzleiter: { id: person.id, name: person.name },
    posten: [
      {
        id: crypto.randomUUID(),
        label: 'Übungsposten',
        fahrzeug: null,
        positions: [
          {
            id: crypto.randomUUID(),
            label: 'Gruppenführung',
            requirements: { taktisch: 'GF', medizinisch: 'RS' },
            assigned: { id: person.id, name: person.name },
          },
        ],
      },
    ],
  };
}
