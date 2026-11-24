import type { PostfachAdressen } from '../models/postfach.model';

/** Ein Kontakt zum Import in ein Adressbuch (Outlook, Google Kontakte, Handy). */
export interface Kontakt {
  vorname: string;
  nachname: string;
  email: string;
  notiz: string;
}

const ART_LABEL = { kennzeichen: 'Kennzeichen', funkruf: 'Funkruf' } as const;

/**
 * Je Adresse ein Kontakt: Vorname ist die Fahrzeugbezeichnung, Nachname nennt, woher die Adresse
 * stammt („Kennzeichen BI-JU 7260“, „Funkruf 72 GW-TECH 01“). So findet man sie im Adressbuch über
 * Bezeichnung, Kennzeichen und Funkrufname. Das Sammelpostfach steht als erster Kontakt.
 */
export function baueKontakte(adressen: PostfachAdressen): Kontakt[] {
  const kontakte: Kontakt[] = [
    {
      vorname: 'Angebote',
      nachname: 'Sammelpostfach',
      email: adressen.sammelAdresse,
      notiz: 'Postfach für Angebote; Mails an unbekannte Adressen landen hier.',
    },
  ];
  for (const fahrzeug of adressen.fahrzeuge) {
    for (const a of fahrzeug.adressen) {
      kontakte.push({
        vorname: fahrzeug.fahrzeugBezeichnung,
        nachname: `${ART_LABEL[a.art]} ${a.quelle}`,
        email: a.adresse,
        notiz: 'Fahrzeugpostfach für Angebote',
      });
    }
  }
  return kontakte;
}

function csvFeld(wert: string): string {
  return `"${wert.replaceAll('"', '""')}"`;
}

/** Outlook-CSV (englische Spaltenköpfe, die Outlook beim Import selbst zuordnet), UTF-8 mit BOM. */
export function kontakteAlsCsv(kontakte: readonly Kontakt[]): string {
  const zeilen = [
    ['First Name', 'Last Name', 'E-mail Address', 'Notes'].map(csvFeld).join(','),
    ...kontakte.map((k) => [k.vorname, k.nachname, k.email, k.notiz].map(csvFeld).join(',')),
  ];
  return `﻿${zeilen.join('\r\n')}\r\n`;
}

function vcardText(wert: string): string {
  return wert
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n');
}

/** vCard 3.0, eine Datei mit allen Kontakten; Outlook, Apple und Google lesen das. */
export function kontakteAlsVcard(kontakte: readonly Kontakt[]): string {
  return kontakte
    .map((k) =>
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${vcardText(k.nachname)};${vcardText(k.vorname)};;;`,
        `FN:${vcardText(`${k.vorname} ${k.nachname}`)}`,
        `EMAIL;TYPE=INTERNET:${k.email}`,
        `NOTE:${vcardText(k.notiz)}`,
        'END:VCARD',
      ].join('\r\n'),
    )
    .join('\r\n')
    .concat('\r\n');
}
