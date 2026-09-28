import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { heuteIso } from '../../../kern/kalender/datum';
import { HiorgPersonalService, type HiorgPerson } from '../../../kern/hiorg/hiorg-personal.service';
import { HiorgVerbinden } from '../../../kern/hiorg/hiorg-verbinden/hiorg-verbinden';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import {
  fuehrerscheinnummerPruefzifferGueltig,
  type PruefzifferErgebnis,
} from '../../services/fuehrerschein-pruefziffer';
import {
  FUEHRERSCHEIN_DOKUMENT_MEDIENTYP,
  fuehrerscheinDokumentFuellen,
  type FuehrerscheinDokumentZeile,
} from '../../services/fuehrerschein-dokument';
import { fuehrerscheindatumAnzeige } from '../../services/fuehrerschein-anzeige';
import {
  FuehrerscheinVorlageService,
  type FuehrerscheinVorlageMetadaten,
} from '../../services/fuehrerschein-vorlage.service';

/**
 * Führerscheinliste: dieselbe organisationsweite HiOrg-Personalabfrage wie
 * `PersonalUebersicht`, hier auf Name und Fahrerlaubnis zugeschnitten – mit
 * Download als ausgefülltes Word-Dokument (aus der im Verwaltungsbereich
 * hinterlegten Vorlage, siehe `fuehrerschein-vorlage.service.ts` und
 * `fuehrerschein-dokument.ts`). Eigene Seite statt zusätzlicher Spalten in
 * der allgemeinen Übersicht, damit Führerscheinnummern dort nicht
 * standardmäßig sichtbar sind. Ein eigener Abruf beim Öffnen statt eines
 * geteilten Zwischenspeichers: die Daten sollen nicht länger als nötig im
 * Speicher bleiben (siehe `AbrufPuffer`-Dokumentation zur bewussten
 * Nichtnutzung hier).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fuehrerscheinliste',
  imports: [
    HiorgVerbinden,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatToolbarModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './fuehrerscheinliste.html',
  styleUrl: './fuehrerscheinliste.less',
})
export class Fuehrerscheinliste implements OnInit {
  private readonly hiorg = inject(HiorgPersonalService);
  private readonly vorlageDienst = inject(FuehrerscheinVorlageService);

  readonly spalten = ['name', 'klassen', 'beschraenkung', 'nummer', 'datum'];
  readonly verbindung = this.hiorg.verbindung;
  readonly laedt = signal(false);
  readonly fehler = signal('');
  readonly personen = signal<HiorgPerson[]>([]);
  readonly suche = signal('');

  readonly vorlage = signal<FuehrerscheinVorlageMetadaten | null>(null);
  readonly vorlageLaedt = signal(false);
  readonly dokumentWirdErstellt = signal(false);
  readonly dokumentFehler = signal('');

  readonly gefiltert = computed(() => {
    const suche = this.suche().trim().toLocaleLowerCase('de');
    if (!suche) return this.personen();
    return this.personen().filter((person) =>
      [person.nachname, person.vorname, ...(person.fahrerlaubnis?.klassen ?? [])].some((teil) =>
        teil.toLocaleLowerCase('de').includes(suche),
      ),
    );
  });

  /** Nur Personen mit erfasster Führerscheinnummer – sonst gäbe es fürs Dokument nichts einzutragen. */
  readonly dokumentZeilen = computed<FuehrerscheinDokumentZeile[]>(() =>
    this.personen()
      .map((person): FuehrerscheinDokumentZeile | null => {
        const nummer = person.fahrerlaubnis?.fuehrerscheinnummer;
        if (!nummer) return null;
        return {
          name: `${person.nachname}, ${person.vorname}`,
          datum: fuehrerscheindatumAnzeige(person.fahrerlaubnis?.fuehrerscheindatum),
          nummer,
        };
      })
      .filter((zeile): zeile is FuehrerscheinDokumentZeile => zeile !== null),
  );

  ngOnInit(): void {
    void this.laden();
    void this.vorlageLaden();
  }

  async laden(): Promise<void> {
    if (this.laedt()) return;
    this.laedt.set(true);
    this.fehler.set('');
    try {
      if ((await this.hiorg.verbindungLaden()) === 'verbunden') {
        this.personen.set(await this.hiorg.personalLaden());
      } else {
        this.personen.set([]);
      }
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Der HiOrg-Server ist nicht erreichbar.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  async vorlageLaden(): Promise<void> {
    this.vorlageLaedt.set(true);
    try {
      this.vorlage.set(await this.vorlageDienst.metadatenLaden());
    } catch (fehler) {
      this.dokumentFehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Der Vorlagenstatus konnte nicht geladen werden.',
      );
    } finally {
      this.vorlageLaedt.set(false);
    }
  }

  fuehrerscheindatum(person: HiorgPerson): string {
    return fuehrerscheindatumAnzeige(person.fahrerlaubnis?.fuehrerscheindatum);
  }

  /** Nur zur Anzeige vor dem Export, siehe `fuehrerschein-pruefziffer.ts`. */
  pruefziffer(person: HiorgPerson): PruefzifferErgebnis {
    return fuehrerscheinnummerPruefzifferGueltig(person.fahrerlaubnis?.fuehrerscheinnummer);
  }

  async dokumentHerunterladen(): Promise<void> {
    if (this.dokumentWirdErstellt()) return;
    this.dokumentWirdErstellt.set(true);
    this.dokumentFehler.set('');
    try {
      const vorlage = await this.vorlageDienst.datenLaden();
      const blob = await fuehrerscheinDokumentFuellen(vorlage, this.dokumentZeilen());
      dateiHerunterladen(
        blob,
        `fuehrerscheinliste-${heuteIso()}.docx`,
        FUEHRERSCHEIN_DOKUMENT_MEDIENTYP,
      );
    } catch (fehler) {
      this.dokumentFehler.set(
        fehler instanceof Error ? fehler.message : 'Das Dokument konnte nicht erstellt werden.',
      );
    } finally {
      this.dokumentWirdErstellt.set(false);
    }
  }
}
