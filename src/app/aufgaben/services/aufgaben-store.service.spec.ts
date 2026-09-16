import { TestBed } from '@angular/core/testing';
import {
  AUFGABENQUELLE,
  type Aufgabe,
  type Aufgabenquelle,
} from '../../kern/aufgaben/aufgabenquelle';
import { AufgabenStoreService } from './aufgaben-store.service';

function aufgabe(id: string, quelle: string, eingegangenAm: string): Aufgabe {
  return {
    id,
    quelle,
    titel: `Aufgabe ${id}`,
    beschreibung: '',
    eingegangenAm,
    routerLink: ['/aufgaben'],
    dringlichkeit: 'normal',
  };
}

function quelle(
  kennung: string,
  bezeichnung: string,
  laden: () => Promise<Aufgabe[]>,
): Aufgabenquelle {
  return { kennung, bezeichnung, ladeAufgaben: laden };
}

function store(...quellen: Aufgabenquelle[]): AufgabenStoreService {
  TestBed.configureTestingModule({
    providers: quellen.map((q) => ({ provide: AUFGABENQUELLE, useValue: q, multi: true })),
  });
  return TestBed.inject(AufgabenStoreService);
}

describe('AufgabenStoreService', () => {
  it('kommt ohne jede Quelle aus', async () => {
    TestBed.configureTestingModule({});
    const dienst = TestBed.inject(AufgabenStoreService);
    await dienst.laden();
    expect(dienst.anzahl()).toBe(0);
    expect(dienst.hatFehler()).toBe(false);
  });

  it('sammelt über mehrere Quellen und sortiert die ältesten zuerst', async () => {
    const dienst = store(
      quelle('a', 'Quelle A', async () => [aufgabe('a1', 'a', '2026-09-15T12:00:00.000Z')]),
      quelle('b', 'Quelle B', async () => [
        aufgabe('b1', 'b', '2026-09-15T08:00:00.000Z'),
        aufgabe('b2', 'b', '2026-09-15T20:00:00.000Z'),
      ]),
    );
    await dienst.laden();
    expect(dienst.aufgaben().map((a) => a.id)).toEqual(['b1', 'a1', 'b2']);
    expect(dienst.anzahl()).toBe(3);
    expect(dienst.bezeichnungen()).toEqual({ a: 'Quelle A', b: 'Quelle B' });
  });

  it('lässt eine ausgefallene Quelle die anderen nicht verdecken', async () => {
    // Der eigentliche Punkt: eine stille Null wäre schlimmer als ein Fehler.
    const dienst = store(
      quelle('a', 'Quelle A', async () => {
        throw new Error('Serverfehler in A');
      }),
      quelle('b', 'Quelle B', async () => [aufgabe('b1', 'b', '2026-09-15T08:00:00.000Z')]),
    );
    await dienst.laden();
    expect(dienst.aufgaben().map((a) => a.id)).toEqual(['b1']);
    expect(dienst.hatFehler()).toBe(true);
    expect(dienst.fehlerJeQuelle()).toEqual({ 'Quelle A': 'Serverfehler in A' });
    expect(dienst.laedt()).toBe(false);
  });

  it('entfernt eine erledigte Aufgabe, ohne neu zu laden', async () => {
    const laden = vi.fn(async () => [
      aufgabe('a1', 'a', '2026-09-15T08:00:00.000Z'),
      aufgabe('a2', 'a', '2026-09-15T09:00:00.000Z'),
    ]);
    const dienst = store(quelle('a', 'Quelle A', laden));
    await dienst.laden();
    dienst.entferne('a1');
    expect(dienst.aufgaben().map((a) => a.id)).toEqual(['a2']);
    expect(laden).toHaveBeenCalledTimes(1);
  });
});
