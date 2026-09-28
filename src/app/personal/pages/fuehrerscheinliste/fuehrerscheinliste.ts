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
import { RouterLink } from '@angular/router';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import { heuteIso } from '../../../kern/kalender/datum';
import { HiorgPersonalService, type HiorgPerson } from '../../../kern/hiorg/hiorg-personal.service';
import { HiorgVerbinden } from '../../../kern/hiorg/hiorg-verbinden/hiorg-verbinden';
import {
  fuehrerscheindatumAnzeige,
  fuehrerscheinlisteCsv,
} from '../../services/fuehrerscheinliste-csv';

const CSV_MEDIENTYP = 'text/csv;charset=utf-8';

/**
 * Führerscheinliste: dieselbe organisationsweite HiOrg-Personalabfrage wie
 * `PersonalUebersicht`, hier auf Name und Fahrerlaubnis zugeschnitten – mit
 * CSV-Export. Eigene Seite statt zusätzlicher Spalten in der allgemeinen
 * Übersicht, damit Führerscheinnummern dort nicht standardmäßig sichtbar
 * sind. Ein eigener Abruf beim Öffnen statt eines geteilten Zwischenspeichers:
 * die Daten sollen nicht länger als nötig im Speicher bleiben (siehe
 * `AbrufPuffer`-Dokumentation zur bewussten Nichtnutzung hier).
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
    RouterLink,
  ],
  templateUrl: './fuehrerscheinliste.html',
  styleUrl: './fuehrerscheinliste.less',
})
export class Fuehrerscheinliste implements OnInit {
  private readonly hiorg = inject(HiorgPersonalService);

  readonly spalten = ['name', 'klassen', 'beschraenkung', 'nummer', 'datum'];
  readonly verbindung = this.hiorg.verbindung;
  readonly laedt = signal(false);
  readonly fehler = signal('');
  readonly personen = signal<HiorgPerson[]>([]);
  readonly suche = signal('');

  readonly gefiltert = computed(() => {
    const suche = this.suche().trim().toLocaleLowerCase('de');
    if (!suche) return this.personen();
    return this.personen().filter((person) =>
      [person.nachname, person.vorname, ...(person.fahrerlaubnis?.klassen ?? [])].some((teil) =>
        teil.toLocaleLowerCase('de').includes(suche),
      ),
    );
  });

  ngOnInit(): void {
    void this.laden();
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

  fuehrerscheindatum(person: HiorgPerson): string {
    return fuehrerscheindatumAnzeige(person.fahrerlaubnis?.fuehrerscheindatum);
  }

  csvExportieren(): void {
    dateiHerunterladen(
      fuehrerscheinlisteCsv(this.personen()),
      `fuehrerscheinliste-${heuteIso()}.csv`,
      CSV_MEDIENTYP,
    );
  }
}
