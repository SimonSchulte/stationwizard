import { Injectable } from '@angular/core';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Planung, Posten, Taktisch, Medizinisch, TAKTISCH_ORDER } from '../models/planung.model';
import { formatTaktischeZeit, formatTaktischeZeitDisplay } from '../utils/taktische-zeit';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfMake as any).vfs = (pdfFonts as any).vfs;

const CI_NAVY = '#000548';
const CI_BLUE = '#4A6FB8';
const CI_RED = '#EB003C';
const CI_LIGHT_GRAY = '#C7CCD9';
const CI_ROW_ALT = '#F5F6FA';

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  export(planung: Planung): void {
    const fmt = new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    });
    const nowDate = new Date();
    const now = formatTaktischeZeit(nowDate);
    const nowDisplay = formatTaktischeZeitDisplay(nowDate);
    const start = fmt.format(this.parseDate(planung.start));
    const dateRangeText = planung.end
      ? `${start} – ${fmt.format(this.parseDate(planung.end))}`
      : start;

    const content: Content[] = [
      // CI-Navy header bar
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: planung.name,
                color: '#FFFFFF',
                bold: true,
                fontSize: 18,
                fillColor: CI_NAVY,
                margin: [8, 8, 8, 8],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 4],
      } as Content,
      { text: dateRangeText, style: 'dateRange', margin: [0, 0, 0, 4] },
    ];

    if (planung.einsatzleiter) {
      content.push({
        table: {
          widths: [4, '*'],
          body: [
            [
              { text: '', fillColor: CI_RED, border: [false, false, false, false] },
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
      content.push({ text: '', margin: [0, 0, 0, 12] });
    }

    if (planung.beschreibung) {
      content.push({
        text: planung.beschreibung,
        style: 'beschreibung',
        margin: [0, 0, 0, 8],
      });
    }

    content.push({
      text: `Taktische Zeit: ${now}  (${nowDisplay})`,
      style: 'taktischeZeit',
      margin: [0, 0, 0, 12],
    });

    for (const posten of planung.posten) {
      content.push(...this.buildPostenBlock(posten, planung));
    }

    const docDef: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 50],
      header: () => ({ text: '', margin: [40, 20] }),
      footer: (_page: number, _pages: number) => ({
        text: `Exportiert am: ${now}  (${nowDisplay})`,
        alignment: 'right',
        fontSize: 8,
        color: '#666666',
        margin: [40, 10],
      }),
      content,
      styles: {
        dateRange: { fontSize: 11, color: '#444444' },
        einsatzleiter: { fontSize: 11, italics: true },
        beschreibung: { fontSize: 11, color: '#333333' },
        taktischeZeit: { fontSize: 12, bold: true, color: '#000000' },
        tableHeader: { bold: true, fontSize: 9, color: '#FFFFFF', fillColor: CI_BLUE },
      },
      defaultStyle: { fontSize: 10 },
    };

    const filename = `${planung.name}_${now}.pep.pdf`;
    pdfMake.createPdf(docDef).download(filename);
  }

  private buildPostenBlock(posten: Posten, planung: Planung): Content[] {
    // CI-Navy Posten header
    const headerCells: Content[] = [
      {
        text: posten.label,
        color: '#FFFFFF',
        bold: true,
        fontSize: 12,
        fillColor: CI_NAVY,
        margin: [6, 4, 4, 4],
        border: [false, false, false, false],
      } as Content,
    ];

    const headerWidths: (string | number)[] = ['*'];

    if (posten.fahrzeug) {
      headerCells.push({
        text: posten.fahrzeug.funkruf,
        color: CI_LIGHT_GRAY,
        bold: false,
        fontSize: 12,
        fillColor: CI_NAVY,
        margin: [0, 4, 6, 4],
        border: [false, false, false, false],
      } as Content);
      headerWidths.push('auto');
    }

    if (posten.telefonnummer) {
      headerCells.push({
        text: `\u260E ${posten.telefonnummer}`,
        color: CI_LIGHT_GRAY,
        bold: false,
        fontSize: 11,
        fillColor: CI_NAVY,
        margin: [0, 4, 6, 4],
        border: [false, false, false, false],
      } as Content);
      headerWidths.push('auto');
    }

    const postenHeader: Content = {
      table: {
        widths: headerWidths,
        body: [headerCells],
      },
      layout: 'noBorders',
      margin: [0, 12, 0, 4],
    } as Content;

    const tableBody: Content[][] = [
      [
        { text: 'Position', style: 'tableHeader' },
        { text: 'Taktisch', style: 'tableHeader' },
        { text: 'Medizinisch', style: 'tableHeader' },
        { text: 'Zusatz', style: 'tableHeader' },
        { text: 'Einsatzkraft', style: 'tableHeader' },
      ],
    ];

    posten.positions.forEach((pos, idx) => {
      const person = pos.assigned
        ? (planung.einsatzkraefte.find((e) => e.id === pos.assigned!.id) ?? null)
        : null;

      const rowFill = idx % 2 === 0 ? '#FFFFFF' : CI_ROW_ALT;

      const tStyle = this.taktischStyle(pos.requirements.taktisch);
      const mStyle = this.medizinischStyle(pos.requirements.medizinisch);

      const tCell: ContentText = pos.requirements.taktisch
        ? {
            text: pos.requirements.taktisch,
            fillColor: tStyle.fillColor,
            color: tStyle.color,
            alignment: 'center',
          }
        : { text: '–', color: '#AAAAAA', alignment: 'center', fillColor: rowFill };

      const mCell: ContentText = pos.requirements.medizinisch
        ? {
            text: pos.requirements.medizinisch,
            fillColor: mStyle.fillColor,
            color: mStyle.color,
            alignment: 'center',
          }
        : { text: '–', color: '#AAAAAA', alignment: 'center', fillColor: rowFill };

      const zusatzText = pos.requirements.zusatz ?? person?.tags.zusatz?.join(', ') ?? '–';
      const assignedName = pos.assigned ? pos.assigned.name : '—';

      tableBody.push([
        { text: pos.label, fillColor: rowFill },
        tCell,
        mCell,
        { text: zusatzText || '–', fillColor: rowFill },
        { text: assignedName, fillColor: rowFill },
      ]);
    });

    return [
      postenHeader,
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', '*'],
          body: tableBody,
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },
    ];
  }

  private parseDate(str: string): Date {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    // German format: DD.MM.YYYY or DD.MM.YYYY HH:MM
    const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (m) {
      const [, dd, mm, yyyy, hh = '0', min = '0'] = m;
      return new Date(+yyyy, +mm - 1, +dd, +hh, +min);
    }
    console.warn('PdfExportService: cannot parse date:', str);
    return new Date(0);
  }

  private taktischStyle(tag: Taktisch | null): { fillColor: string; color: string } {
    if (!tag) return { fillColor: '#FFFFFF', color: '#000000' };
    const i = TAKTISCH_ORDER.indexOf(tag);
    if (i <= 1) return { fillColor: CI_LIGHT_GRAY, color: CI_NAVY };
    if (i === 2) return { fillColor: CI_BLUE, color: '#FFFFFF' };
    if (i <= 4) return { fillColor: CI_RED, color: '#FFFFFF' };
    return { fillColor: '#FFFFFF', color: CI_NAVY };
  }

  private medizinischStyle(tag: Medizinisch | null): { fillColor: string; color: string } {
    if (!tag) return { fillColor: '#FFFFFF', color: '#000000' };
    // Tag-based mapping per spec.md
    switch (tag) {
      case 'EH':
      case 'SSD':
      case 'SanH':
        return { fillColor: CI_LIGHT_GRAY, color: CI_NAVY };
      case 'RH':
        return { fillColor: '#2F8F68', color: '#FFFFFF' };
      case 'RS':
        return { fillColor: '#DEE100', color: CI_NAVY };
      case 'RA':
      case 'NotSan':
        return { fillColor: CI_RED, color: '#FFFFFF' };
      case 'A':
      case 'NA':
        return { fillColor: CI_BLUE, color: '#FFFFFF' };
      default:
        return { fillColor: '#E8E8E8', color: '#424242' };
    }
  }
}
