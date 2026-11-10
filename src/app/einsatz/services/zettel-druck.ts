import { Injectable, inject } from '@angular/core';
import { heuteIso } from '../../kern/kalender/datum';
import { ladePdfBibliothek } from '../../kern/pdf/pdf-bibliothek';
import { PdfAusgabe } from '../../kern/pdf/pdf-ausgabe';
import { MeldungsDienst } from '../../kern/zustand/meldungs-dienst';
import { DruckInhalt } from '../models/druck.model';
import { kistenschildAbschnitt } from './kisten-pdf-definition';
import { baueLaufzettelStreifen } from './laufzettel-layout';
import { LaufzettelLayoutWahl } from './laufzettel-layout-wahl';
import { zuVolleLaufzettel } from './laufzettel-platz';
import { baueZettelPdfDefinition, DruckKopf } from './zettel-pdf-definition';

/** Dateiname ohne Zeichen, die Betriebssysteme in Dateinamen nicht zulassen. */
export function zettelDateiname(titel: string, datum: string): string {
  const bereinigt = titel
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return `Aufbau ${bereinigt || 'Aufbau'} ${datum}.pdf`;
}

/**
 * Druck des Aufbaus: optional die Seite „Allgemeine Anweisungen“, danach 3 bis 6
 * Laufzettelstreifen je A4-Querseite (siehe `docs/konzept-einsatzplanung-vb.md`, Abschnitt 6),
 * zuletzt die Abschnittsschilder (A5 quer nach der Vorlage „Kistenbezeichnung“, zwei je
 * A4-Hochformatblatt).
 * `drucken()` öffnet direkt den Druckdialog des Browsers, `herunterladen()` speichert das PDF.
 * Fehler werden geworfen; der Aufrufer meldet sie.
 */
@Injectable({ providedIn: 'root' })
export class ZettelDruckDienst {
  private readonly meldungen = inject(MeldungsDienst);
  private readonly layout = inject(LaufzettelLayoutWahl);
  private readonly ausgabe = inject(PdfAusgabe);

  /** Öffnet direkt den Druckdialog des Browsers (Rückfall: Download, siehe `PdfAusgabe`). */
  async drucken(kopf: DruckKopf, inhalt: DruckInhalt): Promise<void> {
    const { daten, dateiname } = await this.erzeugen(kopf, inhalt);
    await this.ausgabe.drucken(daten, dateiname);
  }

  async herunterladen(kopf: DruckKopf, inhalt: DruckInhalt): Promise<void> {
    const { daten, dateiname } = await this.erzeugen(kopf, inhalt);
    this.ausgabe.herunterladen(daten, dateiname);
  }

  private async erzeugen(
    kopf: DruckKopf,
    inhalt: DruckInhalt,
  ): Promise<{ daten: Uint8Array<ArrayBuffer>; dateiname: string }> {
    const laufzettel = inhalt.abschnitte.reduce((summe, a) => summe + a.laufzettel.length, 0);
    if (laufzettel === 0 && inhalt.abschnitte.length === 0 && !inhalt.anweisungen.trim()) {
      throw new Error('Der Aufbau enthält weder Anweisungen noch Abschnitte noch Laufzettel.');
    }
    const streifenJeSeite = this.layout.streifenJeSeite();
    const streifen = baueLaufzettelStreifen(inhalt, streifenJeSeite, this.layout.sortierung());
    const definition = baueZettelPdfDefinition(kopf, inhalt, streifen, new Date(), streifenJeSeite);
    if (inhalt.kistenschilder?.length) {
      // Die Kistenschilder stehen zuletzt; sie kennen den Einsatz nicht (Heimatlager statt Zeitraum).
      const inhaltAbschnitte = Array.isArray(definition.content)
        ? definition.content
        : [definition.content];
      definition.content = [...inhaltAbschnitte, kistenschildAbschnitt(inhalt.kistenschilder)];
    }
    const pdfMake = await this.ladeBibliothek();
    const daten = Uint8Array.from(await pdfMake.createPdf(definition).getBuffer());

    const zuVoll = zuVolleLaufzettel(inhalt, streifenJeSeite).length;
    if (zuVoll > 0) {
      this.meldungen.warnung(
        zuVoll === 1
          ? 'Ein Laufzettel passt nicht auf einen Streifen und wurde mit einem Fortsetzungsstreifen gedruckt.'
          : `${zuVoll} Laufzettel passen nicht auf einen Streifen und wurden mit Fortsetzungsstreifen gedruckt.`,
      );
    }
    return { daten, dateiname: zettelDateiname(kopf.titel, heuteIso()) };
  }

  /** Naht für Tests: Bibliothek und Schriften werden erst beim Drucken geladen. */
  ladeBibliothek(): ReturnType<typeof ladePdfBibliothek> {
    return ladePdfBibliothek();
  }
}
