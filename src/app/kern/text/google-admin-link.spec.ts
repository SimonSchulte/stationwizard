import { describe, expect, it } from 'vitest';
import { googleAdminKonsoleLink } from './google-admin-link';

describe('googleAdminKonsoleLink', () => {
  it('verlinkt die Admin-Console-Nutzersuche nach E-Mail-Adresse', () => {
    expect(googleAdminKonsoleLink('max.mustermann@juh-beispiel.de')).toBe(
      'https://admin.google.com/ac/users?query=email%3Amax.mustermann%40juh-beispiel.de',
    );
  });
});
