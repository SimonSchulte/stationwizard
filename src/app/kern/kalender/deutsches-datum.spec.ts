import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { describe, expect, it } from 'vitest';
import { DeutscherDatumAdapter, provideDeutschesDatum } from './deutsches-datum';

describe('DeutscherDatumAdapter', () => {
  TestBed.configureTestingModule({ providers: [provideDeutschesDatum()] });
  const adapter = TestBed.inject(DateAdapter) as DeutscherDatumAdapter;

  it('liest Tag.Monat.Jahr deutsch und nicht amerikanisch', () => {
    const datum = adapter.parse('11.12.2026');
    expect(datum).toEqual(new Date(2026, 11, 11));
  });

  it('versteht einstellige Angaben und zweistellige Jahre', () => {
    expect(adapter.parse('1.2.2026')).toEqual(new Date(2026, 1, 1));
    expect(adapter.parse(' 5.6.27 ')).toEqual(new Date(2027, 5, 5));
  });

  it('weist nicht existierende Tage als ungültig ab', () => {
    const datum = adapter.parse('31.02.2026');
    expect(datum && adapter.isValid(datum)).toBe(false);
  });

  it('liest die ISO-Schreibweise und lässt leere Eingaben leer', () => {
    expect(adapter.parse('2026-12-11')).toEqual(new Date(2026, 11, 11));
    expect(adapter.parse('')).toBeNull();
  });

  it('meldet unlesbaren Text als ungültig', () => {
    const datum = adapter.parse('morgen');
    expect(datum && adapter.isValid(datum)).toBe(false);
  });
});
