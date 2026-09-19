import { Injectable } from '@angular/core';
import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PDF_FARBEN } from '../../einsatz/services/pdf-export.service';
import { dateiHerunterladen } from '../../kern/storage/datei-storage';
import { Fahrzeugstamm } from '../models/fahrzeug.model';
import type { ErfassungslinkMitFahrzeug } from '../storage/erfassungslink-storage';
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
  private async ladePdfMake() {
    const { default: pdfMake } = await import('pdfmake/build/pdfmake');
    const { default: vfsFonts } = await import('pdfmake/build/vfs_fonts');
    pdfMake.addVirtualFileSystem(vfsFonts);
    return pdfMake;
  }

  async erzeugeUndSpeichere(
    fahrzeug: Fahrzeugstamm,
    erfassungToken: string | null = null,
  ): Promise<void> {
    const ziele = fahrzeugQrZiele(fahrzeug.id, erfassungToken);
    const [uebersichtSvg, kmSvg, oeffentlichSvg] = await Promise.all([
      erzeugeQrSvg(ziele.uebersichtUrl),
      erzeugeQrSvg(ziele.kmUrl),
      ziele.oeffentlichUrl ? erzeugeQrSvg(ziele.oeffentlichUrl) : Promise.resolve(null),
    ]);

    const pdfMake = await this.ladePdfMake();

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
            spalte('Erfassen – mit Anmeldung', kmSvg, ziele.kmUrl),
          ],
        },
        // Der öffentliche Code größer und über die volle Breite: er ist der
        // Code, der an die Windschutzscheibe kommt.
        oeffentlichSvg && ziele.oeffentlichUrl
          ? {
              stack: [
                {
                  text: 'Kilometerstand melden – ohne Anmeldung',
                  bold: true,
                  fontSize: 14,
                  color: PDF_FARBEN.dunkelblau,
                  alignment: 'center',
                  margin: [0, 32, 0, 4],
                },
                {
                  text: 'Wird von der Zug- oder Gruppenführung freigegeben.',
                  fontSize: 10,
                  color: PDF_FARBEN.sekundaer,
                  alignment: 'center',
                  margin: [0, 0, 0, 12],
                },
                { svg: oeffentlichSvg, width: 220, alignment: 'center' },
                {
                  text: ziele.oeffentlichUrl,
                  fontSize: 7,
                  color: PDF_FARBEN.sekundaer,
                  alignment: 'center',
                  margin: [0, 8, 0, 0],
                },
              ],
            }
          : {
              text: 'Für dieses Fahrzeug ist noch kein öffentlicher Erfassungscode erzeugt.',
              fontSize: 10,
              color: PDF_FARBEN.sekundaer,
              alignment: 'center',
              margin: [0, 32, 0, 0],
            },
        {
          text:
            'Der Code ohne Anmeldung ist ein Zugangsmerkmal: Wer ihn hat, kann für dieses ' +
            'Fahrzeug melden. Bei Verlust oder Missbrauch in der App erneuern – gedruckte ' +
            'Aufkleber werden dadurch ungültig.',
          fontSize: 8,
          color: PDF_FARBEN.sekundaer,
          margin: [0, 32, 0, 0],
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

  /**
   * Übersichtsbogen mit dem Kilometererfassungs-QR-Code jedes Fahrzeugs, zwei
   * je Zeile, für den Aushang. Nur der Erfassungs-Code (nicht der
   * Übersichts-Code) – gebraucht wird hier ausschließlich der schnelle
   * Zugriff aufs Formular. Das Kennzeichen steht bewusst als Text neben dem
   * Code statt im Code selbst: der QR-Inhalt bleibt die reine Ziel-URL ohne
   * zusätzliche Kennung (siehe `fahrzeug-qr.ts`), sonst wäre der gedruckte
   * Code kein reiner Weiterleitungsaufkleber mehr.
   */
  async erzeugeUndSpeichereUebersicht(
    links: readonly ErfassungslinkMitFahrzeug[],
    art: 'intern' | 'oeffentlich',
  ): Promise<void> {
    const sortiert = [...links].sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung));
    const zielFuer = (link: ErfassungslinkMitFahrzeug) => {
      const ziele = fahrzeugQrZiele(link.fahrzeugId, link.token);
      return art === 'oeffentlich' ? ziele.oeffentlichUrl : ziele.kmUrl;
    };
    const svgs = await Promise.all(
      // Fahrzeuge ohne öffentlichen Code erscheinen als benannte Leerzelle,
      // statt stillschweigend aus dem Bogen zu verschwinden.
      sortiert.map((link) => {
        const ziel = zielFuer(link);
        return ziel ? erzeugeQrSvg(ziel) : Promise.resolve(null);
      }),
    );

    const pdfMake = await this.ladePdfMake();

    const zelle = (fahrzeug: ErfassungslinkMitFahrzeug, svg: string | null): Content => ({
      stack: [
        {
          text: fahrzeug.funkrufname || '—',
          bold: true,
          fontSize: 12,
          color: PDF_FARBEN.dunkelblau,
        },
        {
          text: fahrzeug.kennzeichen || '—',
          fontSize: 11,
          color: PDF_FARBEN.sekundaer,
          margin: [0, 2, 0, 8],
        },
        svg
          ? { svg, width: 130, alignment: 'center' }
          : {
              text: 'kein öffentlicher Code erzeugt',
              fontSize: 9,
              color: PDF_FARBEN.sekundaer,
              alignment: 'center',
              margin: [0, 40, 0, 40],
            },
      ],
      alignment: 'center',
      margin: [0, 12, 0, 12],
    });

    const leerzelle: Content = { text: '' };

    const zeilen: Content[][] = [];
    for (let i = 0; i < sortiert.length; i += 2) {
      const links = zelle(sortiert[i], svgs[i]);
      const rechts = sortiert[i + 1] ? zelle(sortiert[i + 1], svgs[i + 1]) : leerzelle;
      zeilen.push([links, rechts]);
    }

    const definition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      content: [
        {
          text:
            art === 'oeffentlich'
              ? 'Kilometerstand melden – QR-Übersicht (ohne Anmeldung)'
              : 'Kilometererfassung – QR-Übersicht (mit Anmeldung)',
          fontSize: 18,
          bold: true,
          color: PDF_FARBEN.dunkelblau,
        },
        {
          text:
            art === 'oeffentlich'
              ? 'Code am Fahrzeug scannen und den Kilometerstand melden. Die Meldung wird von der Zug- oder Gruppenführung freigegeben.'
              : 'Code am Fahrzeug scannen, um den Kilometerstand direkt einzutragen. Setzt eine Anmeldung voraus.',
          fontSize: 11,
          color: PDF_FARBEN.sekundaer,
          margin: [0, 4, 0, 20],
        },
        {
          table: { widths: ['50%', '50%'], body: zeilen },
          layout: 'lightHorizontalLines',
        },
        art === 'oeffentlich'
          ? {
              text:
                'Diese Codes sind Zugangsmerkmale: Wer einen hat, kann für dieses Fahrzeug ' +
                'melden. Bei Verlust oder Missbrauch in der App erneuern – gedruckte Aufkleber ' +
                'werden dadurch ungültig.',
              fontSize: 8,
              color: PDF_FARBEN.sekundaer,
              margin: [0, 20, 0, 0],
            }
          : { text: '' },
      ],
      defaultStyle: { fontSize: 10, color: PDF_FARBEN.text },
    };

    const daten = Uint8Array.from(await pdfMake.createPdf(definition).getBuffer());
    dateiHerunterladen(
      daten,
      art === 'oeffentlich'
        ? 'fahrzeuge-km-qr-uebersicht-oeffentlich.pdf'
        : 'fahrzeuge-km-qr-uebersicht-intern.pdf',
      'application/pdf',
    );
  }
}
