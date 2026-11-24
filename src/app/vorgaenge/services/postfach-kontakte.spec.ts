import { describe, expect, it } from 'vitest';
import type { PostfachAdressen } from '../models/postfach.model';
import { baueKontakte, kontakteAlsCsv, kontakteAlsVcard } from './postfach-kontakte';

const adressen: PostfachAdressen = {
  sammelAdresse: 'angebote@beispiel.test',
  fahrzeuge: [
    {
      fahrzeugId: 'f1',
      fahrzeugBezeichnung: 'GW "Technik", groß',
      adressen: [
        { art: 'kennzeichen', adresse: 'xx-ab-1@beispiel.test', quelle: 'XX-AB 1' },
        { art: 'funkruf', adresse: 'gw-tech-01@beispiel.test', quelle: '72 GW-TECH 01' },
      ],
    },
  ],
};

describe('postfach-kontakte', () => {
  it('bildet einen Kontakt je Adresse, das Sammelpostfach zuerst', () => {
    const kontakte = baueKontakte(adressen);
    expect(kontakte.map((k) => k.email)).toEqual([
      'angebote@beispiel.test',
      'xx-ab-1@beispiel.test',
      'gw-tech-01@beispiel.test',
    ]);
    expect(kontakte[1]?.nachname).toBe('Kennzeichen XX-AB 1');
    expect(kontakte[2]?.nachname).toBe('Funkruf 72 GW-TECH 01');
  });

  it('schreibt Outlook-CSV mit BOM, Kopfzeile und maskierten Anführungszeichen', () => {
    const csv = kontakteAlsCsv(baueKontakte(adressen));
    expect(csv.startsWith('﻿"First Name","Last Name","E-mail Address","Notes"\r\n')).toBe(true);
    expect(csv).toContain('"GW ""Technik"", groß","Kennzeichen XX-AB 1","xx-ab-1@beispiel.test"');
    expect(csv.split('\r\n')).toHaveLength(5);
  });

  it('schreibt eine vCard je Kontakt mit maskierten Sonderzeichen', () => {
    const vcf = kontakteAlsVcard(baueKontakte(adressen));
    expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(3);
    expect(vcf.match(/END:VCARD/g)).toHaveLength(3);
    expect(vcf).toContain('EMAIL;TYPE=INTERNET:gw-tech-01@beispiel.test');
    expect(vcf).toContain('FN:GW "Technik"\\, groß Kennzeichen XX-AB 1');
    expect(vcf.endsWith('END:VCARD\r\n')).toBe(true);
  });
});
