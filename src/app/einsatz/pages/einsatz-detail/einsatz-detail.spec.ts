import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeldungsDienst } from '../../../kern/zustand/zustand';
import { ApiEinsatzStorage } from '../../storage/api-einsatz-storage';
import { ApiVbVorlagenStorage } from '../../storage/api-vb-vorlagen-storage';
import { ApiVorbereitungStorage } from '../../storage/api-vorbereitung-storage';
import {
  InMemoryEinsatzStorage,
  InMemoryVbVorlagenStorage,
  InMemoryVorbereitungStorage,
} from '../../testing/in-memory-einsatzplanung';
import { testEinsatz, testVorbereitung } from '../../testing/vb-testdaten';
import { VbDruckDienst } from '../../services/vb-druck';
import { EinsatzDetail } from './einsatz-detail';

describe('EinsatzDetail', () => {
  let vorbereitungen: InMemoryVorbereitungStorage;
  let einsaetze: InMemoryEinsatzStorage;
  const drucken = vi.fn().mockResolvedValue(undefined);

  async function seiteFuer(id: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiEinsatzStorage, useValue: einsaetze },
        { provide: ApiVorbereitungStorage, useValue: vorbereitungen },
        { provide: ApiVbVorlagenStorage, useValue: new InMemoryVbVorlagenStorage() },
        { provide: VbDruckDienst, useValue: { drucken } },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id })),
            snapshot: { paramMap: convertToParamMap({ id }) },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(EinsatzDetail);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent?.replace(/\s+/g, ' ') ?? '';
  }

  function knopf(fixture: { nativeElement: HTMLElement }, beschriftung: string): HTMLElement {
    const treffer = [...fixture.nativeElement.querySelectorAll<HTMLElement>('button, a')].find(
      (k) => k.textContent?.includes(beschriftung),
    );
    if (!treffer) throw new Error(`Kein Knopf „${beschriftung}“`);
    return treffer;
  }

  beforeEach(() => {
    drucken.mockClear();
    vorbereitungen = new InMemoryVorbereitungStorage();
    einsaetze = new InMemoryEinsatzStorage(vorbereitungen);
  });

  it('zeigt ohne PEP und VB die Anlegen-Wege und den Leerzustand', async () => {
    const einsatz = testEinsatz({ hiorgVeranstaltungId: '4711', ort: 'Ummeln' });
    einsaetze._vorbelegen(einsatz);
    const fixture = await seiteFuer(einsatz.id);

    const inhalt = text(fixture);
    expect(inhalt).toContain('05.12.2026, 10:00–20:00 Uhr');
    expect(inhalt).toContain('Ummeln');
    expect(inhalt).toContain('HiOrg-Veranstaltung verknüpft');
    expect(inhalt).toContain('PEP anlegen');
    expect(inhalt).toContain('Noch keine Vorbereitung');
    expect(inhalt).toContain('Aus Vorlage anlegen');
    expect(inhalt).toContain('Leer beginnen');
    expect(inhalt).not.toContain('PEP öffnen');
  });

  it('zeigt mit PEP und VB Kennzahlen, VB öffnen und Drucken', async () => {
    const einsatz = testEinsatz({ pepId: crypto.randomUUID() });
    einsaetze._vorbelegen(einsatz);
    vorbereitungen._vorbelegen(einsatz.id, testVorbereitung());
    const fixture = await seiteFuer(einsatz.id);

    const inhalt = text(fixture);
    expect(inhalt).toContain('PEP öffnen');
    expect(inhalt).toContain('1 Laufzettel');
    expect(inhalt).toContain('1 Positionen');
    expect(inhalt).toContain('VB öffnen');
    expect(inhalt).not.toContain('Noch keine Vorbereitung');
    expect(inhalt).not.toContain('HiOrg-Veranstaltung verknüpft');

    knopf(fixture, 'Drucken').click();
    await fixture.whenStable();
    expect(drucken).toHaveBeenCalledTimes(1);
    expect(drucken.mock.calls[0][0]).toMatchObject({ titel: einsatz.titel, ort: 'Ummeln' });
    expect(drucken.mock.calls[0][1].abschnitte).toHaveLength(1);
  });

  it('meldet einen Druckfehler über den MeldungsDienst', async () => {
    const einsatz = testEinsatz();
    einsaetze._vorbelegen(einsatz);
    vorbereitungen._vorbelegen(einsatz.id, testVorbereitung());
    drucken.mockRejectedValueOnce(new Error('kaputt'));
    const fixture = await seiteFuer(einsatz.id);
    const fehler = vi.spyOn(TestBed.inject(MeldungsDienst), 'fehler');

    knopf(fixture, 'Drucken').click();
    await fixture.whenStable();
    expect(fehler).toHaveBeenCalledWith(expect.stringContaining('kaputt'));
  });

  it('legt „Leer beginnen“ eine Vorbereitung an und öffnet den Editor', async () => {
    const einsatz = testEinsatz();
    einsaetze._vorbelegen(einsatz);
    const fixture = await seiteFuer(einsatz.id);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    knopf(fixture, 'Leer beginnen').click();
    await fixture.whenStable();
    expect(vorbereitungen.kennzahlen(einsatz.id)).toEqual({ laufzettel: 0, positionen: 0 });
    expect(navigate).toHaveBeenCalledWith(['/einsatzplanung/einsatz', einsatz.id, 'vb']);
  });

  it('zeigt für eine unbekannte Id „Einsatz nicht gefunden“', async () => {
    const fixture = await seiteFuer(crypto.randomUUID());
    expect(text(fixture)).toContain('Einsatz nicht gefunden');
    expect(text(fixture)).not.toContain('PEP');
  });
});
