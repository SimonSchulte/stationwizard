import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { leererTermin, leeresDocument } from '../../models/plan.model';
import { PlanStore } from '../../services/plan-store';
import { TerminKarte } from '../termin-karte/termin-karte';
import { BacklogPanel } from './backlog-panel';

describe('BacklogPanel – Auf nächste Lücke legen', () => {
  const idee = { ...leererTermin(null), id: 'idee', thema: 'Erfundene Idee' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: {} }] });
    TestBed.inject(PlanStore).setzeDokument({ ...leeresDocument(2026), backlog: [idee] });
  });

  it('bietet die Aktion an jeder Idee an und meldet sie mit der Idee nach oben', () => {
    const fixture = TestBed.createComponent(BacklogPanel);
    fixture.detectChanges();
    const gemeldet: unknown[] = [];
    fixture.componentInstance.aufLueckeLegen.subscribe((i) => gemeldet.push(i));

    const karte = fixture.debugElement.query(By.directive(TerminKarte));
    expect(karte.componentInstance.lueckeAnbieten()).toBe(true);
    karte.triggerEventHandler('naechsteLuecke');

    expect(gemeldet).toEqual([idee]);
  });
});
