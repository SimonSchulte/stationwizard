import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MatchService } from './match.service';
import { Einsatzkraft, Medizinisch, Position, Taktisch } from '../models/planung.model';

describe('MatchService', () => {
  let service: MatchService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MatchService);
  });

  const erzeugePosition = (
    taktisch: Taktisch | null,
    medizinisch: Medizinisch | null,
  ): Position => ({
    id: '1',
    label: 'Test',
    requirements: { taktisch, medizinisch },
    assigned: null,
  });

  const erzeugeEinsatzkraft = (taktisch: Taktisch[], medizinisch: Medizinisch[]): Einsatzkraft => ({
    id: '1',
    name: 'Test Person',
    tags: { taktisch, medizinisch },
  });

  it('erkennt vollständige Erfüllung aller Anforderungen', () => {
    const pos = erzeugePosition('GF', 'RS');
    const person = erzeugeEinsatzkraft(['GF', 'ZF'], ['RS', 'RA']);
    expect(service.matchLevel(pos, person)).toBe('full');
  });

  it('erkennt teilweise Erfüllung bei nur einer passenden Anforderung', () => {
    const pos = erzeugePosition('GF', 'RS');
    const person = erzeugeEinsatzkraft(['GF'], []);
    expect(service.matchLevel(pos, person)).toBe('partial');
  });

  it('erkennt Nichterfüllung beider Anforderungen', () => {
    const pos = erzeugePosition('GF', 'RS');
    const person = erzeugeEinsatzkraft(['H'], ['EH']);
    expect(service.matchLevel(pos, person)).toBe('mismatch');
  });

  it('behandelt Positionen ohne Anforderungen als vollständig passend', () => {
    const pos = erzeugePosition(null, null);
    const person = erzeugeEinsatzkraft([], []);
    expect(service.matchLevel(pos, person)).toBe('full');
  });

  it('kennzeichnet unbesetzte Positionen als neutral', () => {
    const pos = erzeugePosition('GF', null);
    expect(service.positionMatchClass(pos, null)).toBe('neutral');
  });

  it('akzeptiert einen höheren taktischen Rang', () => {
    const pos = erzeugePosition('GF', null);
    const person = erzeugeEinsatzkraft(['ZF'], []);
    expect(service.matchLevel(pos, person)).toBe('full');
  });

  it('lehnt einen niedrigeren taktischen Rang ab', () => {
    const pos = erzeugePosition('GF', null);
    const person = erzeugeEinsatzkraft(['H'], []);
    expect(service.matchLevel(pos, person)).toBe('mismatch');
  });

  it('erkennt fehlende Qualifikationen bei vorhandener Anforderung', () => {
    const pos = erzeugePosition('H', null);
    const person = erzeugeEinsatzkraft([], []);
    expect(service.matchLevel(pos, person)).toBe('mismatch');
  });
});
