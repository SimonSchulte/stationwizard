import { NOTIZ_TEXT_MAX } from '../models/postfach.model';

/**
 * Liest eine Rohmail im Browser (`postal-mime`, dynamisch geladen). Der Worker parst nie: die
 * CPU-Zeit des Free-Tarifs reicht dafür nicht, und der Browser hat die Mail ohnehin gleich vor sich.
 * Der Inhalt einer Mail wird nie als HTML dargestellt, sondern als reiner Text.
 */
export interface GelesenerAnhang {
  name: string;
  medientyp: string;
  groesse: number;
  inhalt: Uint8Array;
}

export interface GelesenerMail {
  von: string;
  betreff: string;
  datum: string | null;
  text: string;
  anhaenge: GelesenerAnhang[];
}

const TEXT_ANZEIGE_MAX = 20_000;

/** Reiner Text aus HTML, ohne es auszuführen oder darzustellen. */
export function htmlZuText(html: string): string {
  const dokument = new DOMParser().parseFromString(html, 'text/html');
  dokument.querySelectorAll('script, style, head').forEach((knoten) => knoten.remove());
  dokument.querySelectorAll('br, p, div, li, tr, h1, h2, h3, h4').forEach((knoten) => {
    knoten.append('\n');
  });
  return (dokument.body.textContent ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function leseMail(bytes: ArrayBuffer): Promise<GelesenerMail> {
  const { default: PostalMime } = await import('postal-mime');
  const mail = await PostalMime.parse(bytes);
  const absender = mail.from;
  const von = absender
    ? [absender.name, absender.address ? `<${absender.address}>` : ''].filter(Boolean).join(' ')
    : '';
  const text = (mail.text?.trim() ? mail.text : mail.html ? htmlZuText(mail.html) : '').trim();
  return {
    von,
    betreff: mail.subject ?? '',
    datum: mail.date ?? null,
    text: text.slice(0, TEXT_ANZEIGE_MAX),
    anhaenge: mail.attachments.map((a, index) => {
      const inhalt =
        typeof a.content === 'string'
          ? new TextEncoder().encode(a.content)
          : new Uint8Array(a.content);
      return {
        name: a.filename ?? `anhang-${index + 1}`,
        medientyp: (a.mimeType ?? 'application/octet-stream').toLowerCase(),
        groesse: inhalt.byteLength,
        inhalt,
      };
    }),
  };
}

/** Die Notiz, die mit dem Angebot am Vorgang bleibt: Betreff, Absender, Datum und Anfang des Textes. */
export function notizVon(mail: GelesenerMail): {
  betreff: string;
  absender: string;
  datum: string;
  text: string;
} {
  return {
    betreff: mail.betreff.slice(0, 300),
    absender: mail.von.slice(0, 300),
    datum: (mail.datum ?? '').slice(0, 40),
    text: mail.text.slice(0, NOTIZ_TEXT_MAX),
  };
}
