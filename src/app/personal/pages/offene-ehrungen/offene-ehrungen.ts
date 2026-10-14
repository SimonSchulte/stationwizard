import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { HiorgPersonalService } from '../../../kern/hiorg/hiorg-personal.service';
import { heuteIso } from '../../../kern/kalender/datum';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import { EHRUNGEN_EXCEL_MEDIENTYP, zuEhrendeExcelErzeugen } from '../../services/ehrungen-excel';
import {
  EHRUNG_BEZEICHNUNG,
  aktuellesJahr,
  personSchluessel,
  uhrArtAusAnrede,
  zuEhrende,
  type EhrungSchluessel,
  type UhrArt,
  type ZuEhrender,
} from '../../services/ehrungen-regeln';
import {
  EhrungenService,
  OV_BEZEICHNUNG,
  OV_SCHLUESSEL,
  istOvSchluessel,
  vorgangSchluessel,
  type OvSchluessel,
  type VorgangFeld,
} from '../../services/ehrungen.service';

type Bearbeitung = 'alle' | 'offen' | 'abgestimmt' | 'beantragt';

interface Zeile {
  /** Stabiler Schlüssel aus Person und Auszeichnung. */
  id: string;
  eintrag: ZuEhrender;
  auszeichnung: string;
  abgestimmtOb: boolean;
  beantragt: boolean;
  /** Zuständiger Ortsverband der Person; `null`, solange keiner gewählt ist. */
  ov: OvSchluessel | null;
}

/**
 * Offene Ehrungen: alle jetzt zu vergebenden, noch nicht als erhalten erfassten Auszeichnungen
 * (aus dem gespeicherten Stand, nicht aus ungesicherten Änderungen des Ehrungsmanagers) mit den
 * Haken „Abgestimmt OB“ und „Beantragt“. Die Haken werden sofort je Klick gespeichert; der
 * Excel-Export enthält dieselbe Liste samt Haken.
 */
@Component({
  selector: 'app-offene-ehrungen',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatToolbarModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './offene-ehrungen.html',
  styleUrl: './offene-ehrungen.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OffeneEhrungen implements OnInit {
  private readonly dienst = inject(EhrungenService);
  private readonly hiorg = inject(HiorgPersonalService);

  readonly jahr = aktuellesJahr();
  readonly spalten = [
    'auszeichnung',
    'name',
    'grundlage',
    'bisher',
    'ov',
    'abgestimmtOb',
    'beantragt',
    'hinweis',
  ];

  readonly laedt = signal(false);
  readonly arbeitet = signal(false);
  readonly fehler = signal('');
  readonly rueckmeldung = signal('');
  readonly bearbeitung = signal<Bearbeitung>('alle');
  /** Schlüssel der Zeilen, deren Haken gerade gespeichert wird. */
  readonly speichernd = signal<ReadonlySet<string>>(new Set());
  /** Ob die Haken geladen werden konnten; ohne sie bleibt die Liste lesbar, die Haken sind gesperrt. */
  readonly ovListe = OV_SCHLUESSEL;
  readonly ovBezeichnung = OV_BEZEICHNUNG;
  readonly vorgaengeVerfuegbar = signal(true);

  private readonly alleZeilen = computed<Zeile[]>(() => {
    const vorgaenge = this.dienst.vorgaenge();
    const zustaendigeOv = this.dienst.zustaendigeOv();
    return zuEhrende(this.dienst.personen(), this.jahr).map((eintrag) => {
      const id = vorgangSchluessel(eintrag.personId ?? '', eintrag.auszeichnung);
      const stand = vorgaenge.get(id);
      return {
        id,
        eintrag,
        auszeichnung: this.auszeichnungText(eintrag.auszeichnung),
        abgestimmtOb: stand?.abgestimmtOb ?? false,
        beantragt: stand?.beantragt ?? false,
        ov: zustaendigeOv.get(eintrag.personId ?? '') ?? null,
      };
    });
  });

  readonly zeilen = computed(() => {
    const filter = this.bearbeitung();
    return this.alleZeilen().filter((zeile) =>
      filter === 'alle'
        ? true
        : filter === 'offen'
          ? !zeile.abgestimmtOb && !zeile.beantragt
          : filter === 'abgestimmt'
            ? zeile.abgestimmtOb && !zeile.beantragt
            : zeile.beantragt,
    );
  });

  readonly anzahlAbgestimmt = computed(
    () => this.alleZeilen().filter((zeile) => zeile.abgestimmtOb).length,
  );
  readonly anzahlBeantragt = computed(
    () => this.alleZeilen().filter((zeile) => zeile.beantragt).length,
  );
  readonly anzahlGesamt = computed(() => this.alleZeilen().length);

  ngOnInit(): void {
    void this.laden();
  }

  async laden(): Promise<void> {
    if (this.laedt()) return;
    this.laedt.set(true);
    this.fehler.set('');
    this.vorgaengeVerfuegbar.set(true);
    try {
      await this.dienst.laden();
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Die Ehrungen konnten nicht geladen werden.',
      );
      this.laedt.set(false);
      return;
    }
    try {
      await this.dienst.vorgaengeLaden();
    } catch {
      // Die Liste bleibt lesbar; die Haken lassen sich ohne ihren Stand nicht sicher setzen.
      this.vorgaengeVerfuegbar.set(false);
      this.fehler.set(
        'Der Bearbeitungsstand (Abgestimmt OB, Beantragt) konnte nicht geladen werden. Die Haken sind gesperrt.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  zeileId(_index: number, zeile: Zeile): string {
    return zeile.id;
  }

  auszeichnungText(schluessel: EhrungSchluessel): string {
    return EHRUNG_BEZEICHNUNG[schluessel];
  }

  async haken(zeile: Zeile, feld: VorgangFeld, wert: boolean): Promise<void> {
    const personId = zeile.eintrag.personId;
    if (!personId || this.speichernd().has(zeile.id)) return;
    this.fehler.set('');
    this.speichernd.update((alt) => new Set(alt).add(zeile.id));
    try {
      await this.dienst.vorgangSetzen(personId, zeile.eintrag.auszeichnung, feld, wert);
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Der Haken konnte nicht gespeichert werden.',
      );
    } finally {
      this.speichernd.update((alt) => {
        const neu = new Set(alt);
        neu.delete(zeile.id);
        return neu;
      });
    }
  }

  /** Speichert den zuständigen OV der Person; er gilt für alle ihre offenen Ehrungen. */
  async ovWaehlen(zeile: Zeile, wert: unknown): Promise<void> {
    const personId = zeile.eintrag.personId;
    const ov = istOvSchluessel(wert) ? wert : null;
    if (!personId || this.speichernd().has(zeile.id)) return;
    this.fehler.set('');
    this.speichernd.update((alt) => new Set(alt).add(zeile.id));
    try {
      await this.dienst.zustaendigkeitSetzen(personId, ov);
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error
          ? fehler.message
          : 'Der zuständige OV konnte nicht gespeichert werden.',
      );
    } finally {
      this.speichernd.update((alt) => {
        const neu = new Set(alt);
        neu.delete(zeile.id);
        return neu;
      });
    }
  }

  /**
   * Excel mit denselben Zeilen und Haken. Für die Jubiläumsuhr (Damen/Herren) fragt der Export die
   * HiOrg-Anrede ab, sofern eine Uhr offen ist und HiOrg verbunden ist; sie wird nicht gespeichert.
   */
  async excelHerunterladen(): Promise<void> {
    this.fehler.set('');
    this.rueckmeldung.set('');
    this.arbeitet.set(true);
    try {
      const personen = this.dienst.personen();
      const uhrArten = new Map<string, UhrArt>();
      const offeneUhren = this.alleZeilen().filter((z) => z.eintrag.gruppe === 'Jubiläumsuhr');
      if (offeneUhren.length > 0) {
        let hinweis = '';
        try {
          if ((await this.hiorg.verbindungLaden()) === 'verbunden') {
            for (const person of await this.hiorg.personalLaden()) {
              const art = uhrArtAusAnrede(person.anrede);
              if (art) uhrArten.set(personSchluessel(person.nachname, person.vorname), art);
            }
          } else {
            hinweis = 'HiOrg ist nicht verbunden';
          }
        } catch {
          hinweis = 'HiOrg war nicht erreichbar';
        }
        const offen = offeneUhren.filter(
          (z) => !uhrArten.has(personSchluessel(z.eintrag.nachname, z.eintrag.vorname)),
        ).length;
        if (offen > 0) {
          this.rueckmeldung.set(
            `${hinweis ? hinweis + ': ' : ''}Bei ${offen} Jubiläumsuhr(en) ließ sich Damen/Herren nicht aus der HiOrg-Anrede ermitteln und bleibt in der Liste offen.`,
          );
        }
      }
      const daten = await zuEhrendeExcelErzeugen(
        personen,
        this.jahr,
        uhrArten,
        this.dienst.vorgaenge(),
        this.dienst.zustaendigeOv(),
      );
      dateiHerunterladen(daten, `offene-ehrungen-${heuteIso()}.xlsx`, EHRUNGEN_EXCEL_MEDIENTYP);
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Die Liste konnte nicht erstellt werden.',
      );
    } finally {
      this.arbeitet.set(false);
    }
  }
}
