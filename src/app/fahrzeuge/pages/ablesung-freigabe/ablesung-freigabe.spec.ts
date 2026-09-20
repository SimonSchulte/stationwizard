import { TestBed } from '@angular/core/testing';
import { AufgabenStoreService } from '../../../aufgaben/services/aufgaben-store.service';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Ablesungseinreichung } from '../../models/fahrzeug.model';
import { ApiEinreichungStorage } from '../../storage/api-einreichung-storage';
import {
  EinreichungNichtOffenFehler,
  FreigabeVerweigertFehler,
} from '../../storage/einreichung-storage';
import { AblesungFreigabe } from './ablesung-freigabe';

function einreichung(ueberschreibung: Partial<Ablesungseinreichung> = {}): Ablesungseinreichung {
  return {
    id: 'e1',
    fahrzeugId: 'f1',
    bezeichnung: 'MTW 1',
    kennzeichen: 'XY-TE 123',
    gruppe: 'fuehrung',
    abgelesenAm: '2026-09-15',
    stand: 12_345,
    eingereichtAm: '2026-09-15T08:00:00.000Z',
    gemeldetVonName: 'Maxi Muster',
    bemerkung: '',
    letzterStand: 12_000,
    letzterStandAm: '2026-08-01',
    ...ueberschreibung,
  };
}

async function erzeuge(
  storage: Record<string, unknown>,
  bestaetigt = true,
): Promise<{ seite: AblesungFreigabe; aufgaben: AufgabenStoreService; bestaetigen: unknown }> {
  const bestaetigen = vi.fn().mockResolvedValue(bestaetigt);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiEinreichungStorage, useValue: storage },
      { provide: DialogDienst, useValue: { bestaetigen } },
    ],
  });
  const seite = TestBed.runInInjectionContext(() => new AblesungFreigabe());
  await seite.bereit;
  return { seite, aufgaben: TestBed.inject(AufgabenStoreService), bestaetigen };
}

describe('AblesungFreigabe', () => {
  it('lädt die offenen Meldungen', async () => {
    const { seite } = await erzeuge({ ladeOffene: async () => [einreichung()] });
    expect(seite.einreichungen()).toHaveLength(1);
    expect(seite.leer()).toBe(false);
  });

  it('meldet einen Rückschritt und einen großen Sprung als Hinweis', async () => {
    const { seite } = await erzeuge({ ladeOffene: async () => [] });
    expect(seite.hinweisFuer(einreichung({ stand: 11_000 }))).toBe('rueckschritt');
    expect(seite.hinweisFuer(einreichung({ stand: 99_000 }))).toBe('unplausibler-sprung');
    expect(seite.hinweisFuer(einreichung())).toBeNull();
    expect(seite.hinweisFuer(einreichung({ letzterStand: null }))).toBeNull();
    expect(seite.differenz(einreichung())).toBe(345);
    expect(seite.differenz(einreichung({ letzterStand: null }))).toBeNull();
  });

  it('gibt ohne Hinweis direkt frei', async () => {
    const freigeben = vi.fn().mockResolvedValue(undefined);
    const { seite, bestaetigen } = await erzeuge({
      ladeOffene: async () => [einreichung()],
      freigeben,
    });
    await seite.freigeben(einreichung());
    expect(bestaetigen).not.toHaveBeenCalled();
    expect(freigeben).toHaveBeenCalledWith('e1');
    expect(seite.einreichungen()).toHaveLength(0);
    expect(seite.meldung()).toContain('freigegeben');
  });

  it('fragt bei einem auffälligen Wert nach und bricht bei Ablehnung ab', async () => {
    const freigeben = vi.fn().mockResolvedValue(undefined);
    const auffaellig = einreichung({ stand: 11_000 });
    const { seite, bestaetigen } = await erzeuge(
      { ladeOffene: async () => [auffaellig], freigeben },
      false,
    );
    await seite.freigeben(auffaellig);
    expect(bestaetigen).toHaveBeenCalled();
    expect(freigeben).not.toHaveBeenCalled();
    expect(seite.einreichungen()).toHaveLength(1);
  });

  it('lehnt mit Grund ab und erzeugt keine Freigabe', async () => {
    const ablehnen = vi.fn().mockResolvedValue(undefined);
    const freigeben = vi.fn();
    const { seite } = await erzeuge({
      ladeOffene: async () => [einreichung()],
      ablehnen,
      freigeben,
    });
    seite.ablehnenBeginnen(einreichung());
    seite.grund.set('  Zahlendreher  ');
    await seite.ablehnenBestaetigen(einreichung());
    expect(ablehnen).toHaveBeenCalledWith('e1', 'Zahlendreher');
    expect(freigeben).not.toHaveBeenCalled();
    expect(seite.lehntAb()).toBeNull();
    expect(seite.einreichungen()).toHaveLength(0);
  });

  it('nennt ein fachliches 403 beim Namen statt "Sitzung abgelaufen"', async () => {
    // Die Rolle reicht nicht – die Sitzung ist aber gültig.
    const { seite } = await erzeuge({
      ladeOffene: async () => [einreichung()],
      freigeben: async () => {
        throw new FreigabeVerweigertFehler('Diese Meldung darf nur die Zugführung entscheiden.');
      },
    });
    await seite.freigeben(einreichung());
    expect(seite.meldung()).toContain('Zugführung');
    expect(seite.meldung()).not.toContain('Sitzung');
    // Die Meldung bleibt stehen: sie ist nicht entschieden.
    expect(seite.einreichungen()).toHaveLength(1);
  });

  it('entfernt eine zwischenzeitlich entschiedene Meldung aus der Liste', async () => {
    const { seite } = await erzeuge({
      ladeOffene: async () => [einreichung()],
      freigeben: async () => {
        throw new EinreichungNichtOffenFehler('Diese Meldung wurde zwischenzeitlich entschieden.');
      },
    });
    await seite.freigeben(einreichung());
    expect(seite.meldung()).toContain('zwischenzeitlich');
    expect(seite.einreichungen()).toHaveLength(0);
  });

  it('zeigt einen Ladefehler, statt eine leere Liste vorzutäuschen', async () => {
    const { seite } = await erzeuge({
      ladeOffene: async () => {
        throw new Error('Server nicht erreichbar');
      },
    });
    expect(seite.ladeFehler()).toBe('Server nicht erreichbar');
    expect(seite.einreichungen()).toHaveLength(0);
  });
});
