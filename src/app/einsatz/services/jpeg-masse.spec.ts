import { describe, expect, it } from 'vitest';
import { jpegMasse } from './jpeg-masse';

/** Kleinstes JPEG-Gerüst: SOI, ein Anwendungssegment, SOF0 mit Maßen. */
function jpegUrl(breite: number, hoehe: number): string {
  const bytes = [
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    hoehe >> 8,
    hoehe & 0xff,
    breite >> 8,
    breite & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ];
  return `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe('jpegMasse', () => {
  it('liest Breite und Höhe hinter einem Anwendungssegment', () => {
    expect(jpegMasse(jpegUrl(640, 480))).toEqual({ breite: 640, hoehe: 480 });
    expect(jpegMasse(jpegUrl(300, 1000))).toEqual({ breite: 300, hoehe: 1000 });
  });

  it('liefert null für Unlesbares', () => {
    expect(jpegMasse('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBeNull();
    expect(jpegMasse('kein Bild')).toBeNull();
    expect(jpegMasse('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
    expect(jpegMasse('data:image/jpeg;base64,%%%')).toBeNull();
  });
});
