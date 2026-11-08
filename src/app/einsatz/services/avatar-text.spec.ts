import { describe, expect, it } from 'vitest';
import { avatarText } from './avatar-text';

describe('avatarText', () => {
  it('bevorzugt das Benutzerkürzel und schneidet Leerraum ab', () => {
    expect(avatarText('Muster Anna', ' MUA ')).toBe('MUA');
  });

  it('fällt ohne Kürzel auf die Initialen zurück', () => {
    expect(avatarText('Muster Anna')).toBe('MA');
    expect(avatarText('Muster Anna', null)).toBe('MA');
    expect(avatarText('Muster Anna', '   ')).toBe('MA');
    expect(avatarText('von der Heide Jan')).toBe('VJ');
  });

  it('nimmt bei einem einzelnen Namen zwei Buchstaben und bei keinem ein Fragezeichen', () => {
    expect(avatarText('Madonna')).toBe('MA');
    expect(avatarText('   ')).toBe('?');
  });
});
