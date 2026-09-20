import { PreiskatalogEintrag } from '../models/preiskatalog.model';

let laufendeId = 0;

export function erzeugeTestPreiskatalogEintrag(
  ueberschreibung: Partial<PreiskatalogEintrag> = {},
): PreiskatalogEintrag {
  laufendeId += 1;
  return {
    id: `preiskatalog-${laufendeId}`,
    bezeichnung: 'Sanitätshelfer',
    art: 'einsatzkraft',
    einzelpreisCent: 1200,
    geaendertAm: '2026-01-01T00:00:00.000Z',
    geaendertVon: 'test@example.invalid',
    version: 1,
    ...ueberschreibung,
  };
}
