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
import { ActivatedRoute, Router } from '@angular/router';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import {
  HIORG_ERGEBNIS_TEXTE,
  HiorgPersonalService,
  type HiorgPerson,
} from '../../../kern/hiorg/hiorg-personal.service';
import { HiorgVerbinden } from '../../../kern/hiorg/hiorg-verbinden/hiorg-verbinden';

/**
 * Übersicht über das gesamte aktive Personal, das das verbundene HiOrg-Konto
 * sehen darf – ein Abruf über die ganze Organisation (`GET /api/hiorg/personal`),
 * nur beim Öffnen und auf ausdrücklichen Wunsch erneut. Nichts davon wird im
 * Browser gespeichert.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-personal-uebersicht',
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
  ],
  templateUrl: './personal-uebersicht.html',
  styleUrl: './personal-uebersicht.less',
})
export class PersonalUebersicht implements OnInit {
  private readonly hiorg = inject(HiorgPersonalService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);

  readonly spalten = ['name', 'gruppen', 'qualifikationen', 'telefon'];
  readonly verbindung = this.hiorg.verbindung;
  readonly laedt = signal(false);
  readonly fehler = signal('');
  readonly personen = signal<HiorgPerson[]>([]);
  readonly suche = signal('');
  readonly rueckmeldung = signal('');
  readonly rueckmeldungErfolg = signal(false);

  readonly gefiltert = computed(() => {
    const suche = this.suche().trim().toLocaleLowerCase('de');
    if (!suche) return this.personen();
    return this.personen().filter((person) =>
      [
        person.nachname,
        person.vorname,
        ...person.gruppen,
        ...person.qualifikationen.flatMap((q) => [q.name ?? '', q.kurz ?? '']),
      ].some((teil) => teil.toLocaleLowerCase('de').includes(suche)),
    );
  });

  ngOnInit(): void {
    const hiorg = this.route.snapshot.queryParamMap.get('hiorg');
    if (hiorg !== null) {
      this.rueckmeldung.set(
        Object.hasOwn(HIORG_ERGEBNIS_TEXTE, hiorg)
          ? HIORG_ERGEBNIS_TEXTE[hiorg]
          : HIORG_ERGEBNIS_TEXTE['fehlgeschlagen'],
      );
      this.rueckmeldungErfolg.set(hiorg === 'verbunden');
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { hiorg: null },
        replaceUrl: true,
      });
    }
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

  qualifikationen(person: HiorgPerson): string[] {
    return person.qualifikationen.map((q) => {
      const bezeichnung =
        q.name && q.kurz && q.name !== q.kurz ? `${q.name} (${q.kurz})` : (q.name ?? q.kurz ?? '');
      return q.liste ? `${q.liste}: ${bezeichnung}` : bezeichnung;
    });
  }

  async trennen(): Promise<void> {
    if (
      !(await this.dialogDienst.bestaetigen(
        'Die gespeicherte Anmeldung beim HiOrg-Server wird verworfen. Für einen erneuten Abruf ist eine neue Anmeldung nötig.',
        'Verbindung trennen',
        'Trennen',
      ))
    ) {
      return;
    }
    this.fehler.set('');
    try {
      await this.hiorg.trennen();
      this.personen.set([]);
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Die Verbindung konnte nicht getrennt werden.',
      );
    }
  }
}
