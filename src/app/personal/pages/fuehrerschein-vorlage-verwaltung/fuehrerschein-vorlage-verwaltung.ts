import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import { fehlendeFelder } from '../../services/ehrungsantrag-pdf';
import {
  EhrungsantragVorlageService,
  FuehrerscheinVorlageService,
  type DateiVorlageDienst,
  type DateiVorlageMetadaten,
} from '../../services/fuehrerschein-vorlage.service';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Leerzustand, Meldung } from '../../../kern/zustand/zustand';

export type VorlagenSeite = 'fuehrerschein' | 'ehrungsantrag';

interface SeitenArt {
  titel: string;
  beschreibung: string;
  endung: RegExp;
  endungText: string;
  accept: string;
  standardDateiname: string;
  ersetzenFolge: string;
  /** Inhaltliche Vorabprüfung vor dem Hochladen; Text bei Ablehnung, sonst `null`. */
  pruefen?: (datei: File) => Promise<string | null>;
}

const ARTEN: Readonly<Record<VorlagenSeite, SeitenArt>> = {
  fuehrerschein: {
    titel: 'Führerschein-Vorlage',
    beschreibung:
      'Die Word-Vorlage, die die Führerscheinliste beim Herunterladen füllt (Name, Führerscheindatum und -nummer je Person). Die übrigen Spalten der Vorlage – Ausstellungsort, Fahrgastbeförderung, Prüfung und Unterschrift – bleiben für die Eintragung von Hand.',
    endung: /\.docx$/i,
    endungText: '.docx',
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    standardDateiname: 'fuehrerschein-vorlage.docx',
    ersetzenFolge: 'Bereits heruntergeladene Führerscheinlisten bleiben davon unberührt.',
  },
  ehrungsantrag: {
    titel: 'Ehrungsantrag-Vorlage',
    beschreibung:
      'Das PDF-Formular „Antrag auf Verleihung einer Auszeichnung“, das „Offene Ehrungen“ je Antrag füllt: Name, Landes- und Regionalverband, Mitglied seit, Tätigkeit, Dienststunden, bereits verliehene Auszeichnungen, die beantragte Auszeichnung und die Begründung. Straße, Wohnort, Geburtsdatum, Datum der Verleihung und Unterschriften bleiben für die Eintragung von Hand. Die Formularfelder müssen denen der Revision 3.2 entsprechen.',
    endung: /\.pdf$/i,
    endungText: '.pdf',
    accept: '.pdf,application/pdf',
    standardDateiname: 'ehrungsantrag-vorlage.pdf',
    ersetzenFolge: 'Bereits heruntergeladene Anträge bleiben davon unberührt.',
    pruefen: async (datei) => {
      try {
        const fehlend = await fehlendeFelder(await datei.arrayBuffer());
        return fehlend.length === 0
          ? null
          : `Das PDF passt nicht zum erwarteten Formular. Es fehlen ${fehlend.length} Formularfelder, unter anderem „${fehlend[0]}“.`;
      } catch (fehler) {
        return fehler instanceof Error ? fehler.message : 'Das PDF ist nicht lesbar.';
      }
    },
  },
};

/**
 * Verwaltungsseite zum Hinterlegen/Ersetzen einer Dokumentvorlage: die Word-Vorlage der
 * Führerscheinliste (Standard) oder, über `data: { vorlage: 'ehrungsantrag' }` an der Route, das
 * PDF-Formular des Ehrungsantrags. Nur Ablage – das Füllen selbst passiert beim Download.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fuehrerschein-vorlage-verwaltung',
  imports: [
    Leerzustand,
    Meldung,
    Ladeanzeige,
    Seitenkopf,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './fuehrerschein-vorlage-verwaltung.html',
  styleUrl: './fuehrerschein-vorlage-verwaltung.less',
})
export class FuehrerscheinVorlageVerwaltung implements OnInit {
  private readonly seite: VorlagenSeite =
    inject(ActivatedRoute, { optional: true })?.snapshot.data['vorlage'] === 'ehrungsantrag'
      ? 'ehrungsantrag'
      : 'fuehrerschein';
  readonly art = ARTEN[this.seite];
  private readonly vorlageDienst: DateiVorlageDienst =
    this.seite === 'ehrungsantrag'
      ? inject(EhrungsantragVorlageService)
      : inject(FuehrerscheinVorlageService);
  private readonly dialogDienst = inject(DialogDienst);

  readonly vorlage = signal<DateiVorlageMetadaten | null>(null);
  readonly laedt = signal(false);
  readonly fehler = signal('');

  readonly gewaehlteDatei = signal<File | null>(null);
  readonly hochladeFehler = signal('');
  readonly ladeVorgang = signal(false);
  readonly erfolg = signal('');

  readonly herunterladeVorgang = signal(false);
  readonly herunterladenFehler = signal('');

  ngOnInit(): void {
    void this.laden();
  }

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    try {
      this.vorlage.set(await this.vorlageDienst.metadatenLaden());
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Der Vorlagenstatus konnte nicht geladen werden.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  dateiGewaehlt(ereignis: Event): void {
    const eingabe = ereignis.target as HTMLInputElement;
    const datei = eingabe.files?.[0];
    this.hochladeFehler.set('');
    this.erfolg.set('');
    if (datei && !this.art.endung.test(datei.name)) {
      this.hochladeFehler.set(`Nur ${this.art.endungText}-Dateien werden angenommen.`);
      this.gewaehlteDatei.set(null);
    } else {
      this.gewaehlteDatei.set(datei ?? null);
    }
    // Zurücksetzen, damit dieselbe Datei nach einer Korrektur erneut wählbar ist.
    eingabe.value = '';
  }

  async hochladen(): Promise<void> {
    const datei = this.gewaehlteDatei();
    if (!datei || this.ladeVorgang()) return;
    if (this.art.pruefen) {
      const problem = await this.art.pruefen(datei);
      if (problem) {
        this.hochladeFehler.set(problem);
        return;
      }
    }
    const bestehend = this.vorlage();
    if (bestehend?.vorhanden) {
      const bestaetigt = await this.dialogDienst.bestaetigen(
        `Die bestehende Vorlage „${bestehend.dateiname}" wird durch „${datei.name}" ersetzt. ${this.art.ersetzenFolge}`,
        'Vorlage ersetzen',
        'Ersetzen',
      );
      if (!bestaetigt) return;
    }
    this.ladeVorgang.set(true);
    this.hochladeFehler.set('');
    try {
      this.vorlage.set(await this.vorlageDienst.hochladen(datei));
      this.gewaehlteDatei.set(null);
      this.erfolg.set('Die Vorlage wurde gespeichert.');
    } catch (fehler) {
      this.hochladeFehler.set(
        fehler instanceof Error ? fehler.message : 'Die Vorlage konnte nicht gespeichert werden.',
      );
    } finally {
      this.ladeVorgang.set(false);
    }
  }

  async herunterladen(): Promise<void> {
    if (this.herunterladeVorgang()) return;
    this.herunterladeVorgang.set(true);
    this.herunterladenFehler.set('');
    try {
      const daten = await this.vorlageDienst.datenLaden();
      dateiHerunterladen(
        daten,
        this.vorlage()?.dateiname ?? this.art.standardDateiname,
        this.vorlageDienst.medientyp,
      );
    } catch (fehler) {
      this.herunterladenFehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Die Vorlage konnte nicht heruntergeladen werden.',
      );
    } finally {
      this.herunterladeVorgang.set(false);
    }
  }
}
