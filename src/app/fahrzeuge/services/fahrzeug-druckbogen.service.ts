import { Injectable } from '@angular/core';
import type { Column, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PDF_FARBEN } from '../../einsatz/services/pdf-export.service';
import { dateiHerunterladen } from '../../kern/storage/datei-storage';
import { Fahrzeugstamm } from '../models/fahrzeug.model';
import { erzeugeQrSvg, fahrzeugQrZiele } from './fahrzeug-qr';

/**
 * Aufkleberbogen mit beiden QR-Codes, dynamisch importiert (analog
 * `pdf-export.service.ts`). Nutzt dieselbe Farbquelle statt einer eigenen
 * Palette. Papierformat und Anzahl je Blatt sind eine offene Fachfrage
 * (siehe docs/konzept-fahrzeuge.md, Abschnitt 9); dieser Bogen druckt
 * vorerst einen Satz pro Fahrzeug auf A4. Als Dienst geführt (statt einer
 * freien Funktion), damit er sich wie `PdfExportService` über Angular DI
 * durch Tests ersetzen lässt.
 */
@Injectable({ providedIn: 'root' })
export class FahrzeugDruckbogenService {
  async erzeugeUndSpeichere(fahrzeug: Fahrzeugstamm): Promise<void> {
    const ziele = fahrzeugQrZiele(fahrzeug.id);
    const [uebersichtSvg, kmSvg] = await Promise.all([
      erzeugeQrSvg(ziele.uebersichtUrl),
      erzeugeQrSvg(ziele.kmUrl),
    ]);

    const { default: pdfMake } = await import('pdfmake/build/pdfmake');
    const { default: vfsFonts } = await import('pdfmake/build/vfs_fonts');
    pdfMake.addVirtualFileSystem(vfsFonts);

    const spalte = (titel: string, svg: string, ziel: string): Column => ({
      stack: [
        {
          text: titel,
          bold: true,
          fontSize: 12,
          color: PDF_FARBEN.dunkelblau,
          margin: [0, 0, 0, 8],
        },
        { svg, width: 160, alignment: 'center' },
        {
          text: ziel,
          fontSize: 7,
          color: PDF_FARBEN.sekundaer,
          alignment: 'center',
          margin: [0, 8, 0, 0],
        },
      ],
      width: '50%',
      alignment: 'center',
    });

    const definition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      content: [
        { text: fahrzeug.bezeichnung, fontSize: 18, bold: true, color: PDF_FARBEN.dunkelblau },
        {
          text: [fahrzeug.funkrufname, fahrzeug.kennzeichen].filter(Boolean).join(' · '),
          fontSize: 11,
          color: PDF_FARBEN.sekundaer,
          margin: [0, 4, 0, 24],
        },
        {
          columns: [
            spalte('Übersicht', uebersichtSvg, ziele.uebersichtUrl),
            spalte('Kilometerstand erfassen', kmSvg, ziele.kmUrl),
          ],
        },
      ],
      defaultStyle: { fontSize: 10, color: PDF_FARBEN.text },
    };

    const daten = Uint8Array.from(await pdfMake.createPdf(definition).getBuffer());
    dateiHerunterladen(
      daten,
      `${fahrzeug.bezeichnung || 'fahrzeug'}-qr-codes.pdf`,
      'application/pdf',
    );
  }
}
