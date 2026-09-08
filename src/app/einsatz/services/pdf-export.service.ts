import { Injectable, inject } from '@angular/core';
import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Planung, Posten, Taktisch, Medizinisch, TAKTISCH_ORDER } from '../models/planung.model';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { dateiHerunterladen } from '../../kern/storage/datei-storage';
import {
  formatiereTaktischeZeit,
  formatiereTaktischeZeitAnzeige,
} from '../../kern/kalender/taktische-zeit';

/** PDF unterstützt keine CSS-Variablen; dieselben Designfarben werden hier konkret geführt. */
const PDF_FARBEN = {
  dunkelblau: '#000548',
  blau: '#4A6FB8',
  rot: '#EB003C',
  hellgrau: '#C7CCD9',
  alternierendeZeile: '#F5F6FA',
  weiss: '#FFFFFF',
  schwarz: '#000000',
  sekundaer: '#666666',
  beschriftung: '#444444',
  text: '#333333',
  platzhalter: '#AAAAAA',
  gruen: '#2F8F68',
  gelb: '#DEE100',
  neutral: '#E8E8E8',
  neutralText: '#424242',
} as const;

let geladeneBibliothek: ReturnType<typeof importierePdfBibliothek> | null = null;

async function importierePdfBibliothek() {
  const [pdfModul, schriftModul] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  // pdfmake 0.3 exportiert die Dateiname/Base64-Map selbst, keinen .vfs-Unterknoten.
  // https://pdfmake.github.io/docs/0.3/getting-started/client-side/
  pdfModul.default.addVirtualFileSystem(schriftModul.default);
  return pdfModul.default;
}

async function ladePdfBibliothek() {
  geladeneBibliothek ??= importierePdfBibliothek();
  try {
    return await geladeneBibliothek;
  } catch (ursache) {
    geladeneBibliothek = null;
    throw ursache;
  }
}

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  private readonly dialog = inject(DialogDienst);

  async exportieren(planung: Planung): Promise<void> {
    try {
      const zeitpunkt = new Date();
      const daten = await this.erzeugePdf(planung, zeitpunkt);
      const name =
        planung.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'Einsatzplanung';
      dateiHerunterladen(
        daten,
        `${name}_${formatiereTaktischeZeit(zeitpunkt)}.pep.pdf`,
        'application/pdf',
      );
    } catch {
      await this.dialog.hinweis(
        'Das PDF konnte nicht erstellt werden. Bitte prüfe die Datumsangaben und versuche es erneut.',
        'PDF-Export fehlgeschlagen',
      );
    }
  }

  /** Erzeugt echte PDF-Bytes; Bibliothek und Schriften werden erst hier geladen. */
  async erzeugePdf(planung: Planung, zeitpunkt = new Date()): Promise<Uint8Array<ArrayBuffer>> {
    const dokument = this.baueDokument(planung, zeitpunkt);
    const pdfMake = await ladePdfBibliothek();
    const daten = await pdfMake.createPdf(dokument).getBuffer();
    return Uint8Array.from(daten);
  }

  private baueDokument(planung: Planung, zeitpunkt: Date): TDocumentDefinitions {
    const formatierer = new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    });
    const taktischeZeit = formatiereTaktischeZeit(zeitpunkt);
    const zeitAnzeige = formatiereTaktischeZeitAnzeige(zeitpunkt);
    const start = formatierer.format(this.leseDatum(planung.start));
    const zeitraum = planung.end
      ? `${start} – ${formatierer.format(this.leseDatum(planung.end))}`
      : start;

    const inhalt: Content[] = [
      // Kopfzeile in der gemeinsamen Hauptfarbe.
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: planung.name,
                color: PDF_FARBEN.weiss,
                bold: true,
                fontSize: 18,
                fillColor: PDF_FARBEN.dunkelblau,
                margin: [8, 8, 8, 8],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 4],
      } as Content,
      { text: zeitraum, style: 'zeitraum', margin: [0, 0, 0, 4] },
    ];

    if (planung.einsatzleiter) {
      inhalt.push({
        table: {
          widths: [4, '*'],
          body: [
            [
              { text: '', fillColor: PDF_FARBEN.rot, border: [false, false, false, false] },
              {
                text: `Einsatzleiter: ${planung.einsatzleiter.name}`,
                style: 'einsatzleiter',
                border: [false, false, false, false],
                margin: [6, 2, 0, 2],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 12],
      } as Content);
    } else {
      inhalt.push({ text: '', margin: [0, 0, 0, 12] });
    }

    if (planung.beschreibung) {
      inhalt.push({
        text: planung.beschreibung,
        style: 'beschreibung',
        margin: [0, 0, 0, 8],
      });
    }

    inhalt.push({
      text: `Taktische Zeit: ${taktischeZeit}  (${zeitAnzeige})`,
      style: 'taktischeZeit',
      margin: [0, 0, 0, 12],
    });

    for (const posten of planung.posten) {
      inhalt.push(...this.bauePostenBlock(posten, planung));
    }

    const dokument: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 50],
      header: () => ({ text: '', margin: [40, 20] }),
      footer: () => ({
        text: `Exportiert am: ${taktischeZeit}  (${zeitAnzeige})`,
        alignment: 'right',
        fontSize: 8,
        color: PDF_FARBEN.sekundaer,
        margin: [40, 10],
      }),
      content: inhalt,
      styles: {
        zeitraum: { fontSize: 11, color: PDF_FARBEN.beschriftung },
        einsatzleiter: { fontSize: 11, italics: true },
        beschreibung: { fontSize: 11, color: PDF_FARBEN.text },
        taktischeZeit: { fontSize: 12, bold: true, color: PDF_FARBEN.schwarz },
        tabellenKopf: {
          bold: true,
          fontSize: 9,
          color: PDF_FARBEN.weiss,
          fillColor: PDF_FARBEN.blau,
        },
      },
      defaultStyle: { fontSize: 10 },
    };

    return dokument;
  }

  private bauePostenBlock(posten: Posten, planung: Planung): Content[] {
    // Postenkopf mit Fahrzeug und Kontakt.
    const kopfZellen: Content[] = [
      {
        text: posten.label,
        color: PDF_FARBEN.weiss,
        bold: true,
        fontSize: 12,
        fillColor: PDF_FARBEN.dunkelblau,
        margin: [6, 4, 4, 4],
        border: [false, false, false, false],
      } as Content,
    ];

    const kopfBreiten: (string | number)[] = ['*'];

    if (posten.fahrzeug) {
      kopfZellen.push({
        text: posten.fahrzeug.funkruf,
        color: PDF_FARBEN.hellgrau,
        bold: false,
        fontSize: 12,
        fillColor: PDF_FARBEN.dunkelblau,
        margin: [0, 4, 6, 4],
        border: [false, false, false, false],
      } as Content);
      kopfBreiten.push('auto');
    }

    if (posten.telefonnummer) {
      kopfZellen.push({
        text: `\u260E ${posten.telefonnummer}`,
        color: PDF_FARBEN.hellgrau,
        bold: false,
        fontSize: 11,
        fillColor: PDF_FARBEN.dunkelblau,
        margin: [0, 4, 6, 4],
        border: [false, false, false, false],
      } as Content);
      kopfBreiten.push('auto');
    }

    const postenKopf: Content = {
      table: {
        widths: kopfBreiten,
        body: [kopfZellen],
      },
      layout: 'noBorders',
      margin: [0, 12, 0, 4],
    } as Content;

    const tabellenZeilen: Content[][] = [
      [
        { text: 'Position', style: 'tabellenKopf' },
        { text: 'Taktisch', style: 'tabellenKopf' },
        { text: 'Medizinisch', style: 'tabellenKopf' },
        { text: 'Zusatz', style: 'tabellenKopf' },
        { text: 'Einsatzkraft', style: 'tabellenKopf' },
      ],
    ];

    posten.positions.forEach((position, index) => {
      const einsatzkraft = position.assigned
        ? (planung.einsatzkraefte.find((e) => e.id === position.assigned!.id) ?? null)
        : null;

      const zeilenFarbe = index % 2 === 0 ? PDF_FARBEN.weiss : PDF_FARBEN.alternierendeZeile;

      const taktikStil = this.taktischerStil(position.requirements.taktisch);
      const medizinStil = this.medizinischerStil(position.requirements.medizinisch);

      const taktikZelle: ContentText = position.requirements.taktisch
        ? {
            text: position.requirements.taktisch,
            fillColor: taktikStil.fillColor,
            color: taktikStil.color,
            alignment: 'center',
          }
        : { text: '–', color: PDF_FARBEN.platzhalter, alignment: 'center', fillColor: zeilenFarbe };

      const medizinZelle: ContentText = position.requirements.medizinisch
        ? {
            text: position.requirements.medizinisch,
            fillColor: medizinStil.fillColor,
            color: medizinStil.color,
            alignment: 'center',
          }
        : { text: '–', color: PDF_FARBEN.platzhalter, alignment: 'center', fillColor: zeilenFarbe };

      const zusatzText =
        position.requirements.zusatz ?? einsatzkraft?.tags.zusatz?.join(', ') ?? '–';
      const zugewiesenerName = position.assigned ? position.assigned.name : '—';

      tabellenZeilen.push([
        { text: position.label, fillColor: zeilenFarbe },
        taktikZelle,
        medizinZelle,
        { text: zusatzText || '–', fillColor: zeilenFarbe },
        { text: zugewiesenerName, fillColor: zeilenFarbe },
      ]);
    });

    return [
      postenKopf,
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', '*'],
          body: tabellenZeilen,
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },
    ];
  }

  private leseDatum(wert: string): Date {
    const datum = new Date(wert);
    if (!Number.isNaN(datum.getTime())) return datum;
    // Bestehende PEP-Dateien können das deutsche Format DD.MM.YYYY HH:MM enthalten.
    const treffer = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(wert);
    if (treffer) {
      const [, tag, monat, jahr, stunde = '0', minute = '0'] = treffer;
      const deutsch = new Date(+jahr, +monat - 1, +tag, +stunde, +minute);
      if (
        deutsch.getFullYear() === +jahr &&
        deutsch.getMonth() === +monat - 1 &&
        deutsch.getDate() === +tag
      ) {
        return deutsch;
      }
    }
    throw new Error('Die Planung enthält ein ungültiges Datum.');
  }

  private taktischerStil(qualifikation: Taktisch | null): { fillColor: string; color: string } {
    if (!qualifikation) return { fillColor: PDF_FARBEN.weiss, color: PDF_FARBEN.schwarz };
    const rang = TAKTISCH_ORDER.indexOf(qualifikation);
    if (rang <= 1) return { fillColor: PDF_FARBEN.hellgrau, color: PDF_FARBEN.dunkelblau };
    if (rang === 2) return { fillColor: PDF_FARBEN.blau, color: PDF_FARBEN.weiss };
    if (rang <= 4) return { fillColor: PDF_FARBEN.rot, color: PDF_FARBEN.weiss };
    return { fillColor: PDF_FARBEN.weiss, color: PDF_FARBEN.dunkelblau };
  }

  private medizinischerStil(qualifikation: Medizinisch | null): {
    fillColor: string;
    color: string;
  } {
    if (!qualifikation) return { fillColor: PDF_FARBEN.weiss, color: PDF_FARBEN.schwarz };
    // Zuordnung der Qualifikationsfarben gemäß Fachspezifikation.
    switch (qualifikation) {
      case 'EH':
      case 'SSD':
      case 'SanH':
        return { fillColor: PDF_FARBEN.hellgrau, color: PDF_FARBEN.dunkelblau };
      case 'RH':
        return { fillColor: PDF_FARBEN.gruen, color: PDF_FARBEN.weiss };
      case 'RS':
        return { fillColor: PDF_FARBEN.gelb, color: PDF_FARBEN.dunkelblau };
      case 'RA':
      case 'NotSan':
        return { fillColor: PDF_FARBEN.rot, color: PDF_FARBEN.weiss };
      case 'A':
      case 'NA':
        return { fillColor: PDF_FARBEN.blau, color: PDF_FARBEN.weiss };
      default:
        return { fillColor: PDF_FARBEN.neutral, color: PDF_FARBEN.neutralText };
    }
  }
}
