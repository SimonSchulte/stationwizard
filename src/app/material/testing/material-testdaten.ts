import { Behaelter, BehaelterUebersicht } from '../models/behaelter.model';
import { PruefFach, Pruefvorlage } from '../models/pruefvorlage.model';

/**
 * Erfundene Testdaten. Bewusst eine kleine, ausgedachte Vorlage und nicht die
 * echte NFR-EE-Liste: ein Test soll beobachtbares Verhalten absichern, nicht
 * den Startbestand nacherzählen.
 */

export function erzeugeTestfach(ueberschreibung: Partial<PruefFach> = {}): PruefFach {
  return {
    id: 'fach-1',
    bezeichnung: 'Erstes Fach',
    artikel: [
      {
        id: 'artikel-1',
        bezeichnung: 'Erfundene Binde',
        sollMenge: 2,
        einheit: '',
        herkunft: 'land',
        verfallsdatumPflicht: true,
      },
      {
        id: 'artikel-2',
        bezeichnung: 'Erfundene Schere',
        sollMenge: 1,
        einheit: '',
        herkunft: 'seg',
        verfallsdatumPflicht: false,
      },
    ],
    ...ueberschreibung,
  };
}

export function erzeugeTestvorlage(ueberschreibung: Partial<Pruefvorlage> = {}): Pruefvorlage {
  return {
    id: 'vorlage-1',
    bezeichnung: 'Erfundene Prüfvorlage',
    beschreibung: 'Nur für Tests.',
    grundlage: 'Erfundene Grundlage',
    faecher: [erzeugeTestfach()],
    geaendertAm: '2026-01-01T10:00:00.000Z',
    geaendertVon: 'test@example.test',
    ...ueberschreibung,
  };
}

export function erzeugeTestbehaelter(ueberschreibung: Partial<Behaelter> = {}): Behaelter {
  return {
    id: 'behaelter-1',
    fahrzeugId: 'fahrzeug-1',
    vorlageId: 'vorlage-1',
    bezeichnung: 'Rucksack 3',
    bemerkung: '',
    geaendertAm: '2026-01-01T10:00:00.000Z',
    geaendertVon: 'test@example.test',
    ...ueberschreibung,
  };
}

export function erzeugeTestuebersicht(
  ueberschreibung: Partial<BehaelterUebersicht> = {},
): BehaelterUebersicht {
  return {
    ...erzeugeTestbehaelter(),
    fahrzeugBezeichnung: 'GW SAN Übung',
    fahrzeugFunkrufname: 'Florian Testort 1/59/1',
    fahrzeugGruppe: 'sanitaet',
    vorlageBezeichnung: 'Erfundene Prüfvorlage',
    zuletztGeprueftAm: null,
    letzterCheckId: null,
    letzteFehlmengen: null,
    letzteUnbrauchbar: null,
    letzteAbgelaufen: null,
    ...ueberschreibung,
  };
}
