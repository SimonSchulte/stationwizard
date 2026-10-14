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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { GruppenFilter } from '../../../kern/hiorg/gruppen-filter/gruppen-filter';
import { gruppenSammeln, passtZuGruppen } from '../../../kern/hiorg/gruppen';
import { gruppenJePersonLaden } from '../../services/hiorg-gruppen';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import {
  HiorgPersonalService,
  type HiorgAntragsdaten,
} from '../../../kern/hiorg/hiorg-personal.service';
import { WorkerFehler } from '../../../kern/worker-client';
import { ApiSystemkonfigurationStorage } from '../../../systemkonfiguration/storage/api-systemkonfiguration-storage';
import { EHRUNGSANTRAG_MEDIENTYP, ehrungsantragFuellen } from '../../services/ehrungsantrag-pdf';
import { EhrungsantragVorlageService } from '../../services/fuehrerschein-vorlage.service';
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
  /** Gespeicherte Begründung; leer, wenn keine erfasst ist. */
  begruendung: string;
  antragErstelltAm: string | null;
}

/** Nur Buchstaben, Ziffern und Bindestriche im Dateinamen. */
function dateinamenTeil(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'person'
  );
}

/**
 * Offene Ehrungen: alle jetzt zu vergebenden, noch nicht als erhalten erfassten Auszeichnungen
 * (aus dem gespeicherten Stand, nicht aus ungesicherten Änderungen des Ehrungsmanagers) mit dem
 * Haken „Abgestimmt OB“, einer Begründung und dem Antrag als PDF. Haken und Begründung werden
 * sofort gespeichert; der Download füllt die im Verwaltungsbereich hinterlegte Antragsvorlage
 * (`ehrungsantrag-pdf.ts`) und vermerkt den Zeitpunkt, der als „zuletzt erstellt am“ erscheint
 * und den Vorgang als beantragt zählt. Der Excel-Export enthält dieselbe Liste samt Haken.
 */
@Component({
  selector: 'app-offene-ehrungen',
  imports: [
    GruppenFilter,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
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
  private readonly dialogDienst = inject(DialogDienst);
  private readonly antragVorlage = inject(EhrungsantragVorlageService);
  private readonly systemkonfiguration = inject(ApiSystemkonfigurationStorage);

  readonly jahr = aktuellesJahr();
  readonly spalten = [
    'auszeichnung',
    'name',
    'grundlage',
    'bisher',
    'ov',
    'abgestimmtOb',
    'begruendung',
    'antrag',
    'hinweis',
  ];

  readonly laedt = signal(false);
  readonly arbeitet = signal(false);
  readonly fehler = signal('');
  readonly rueckmeldung = signal('');
  readonly bearbeitung = signal<Bearbeitung>('alle');
  /** Begründungen, die gerade bearbeitet und noch nicht gespeichert sind, je Zeilen-Id. */
  readonly begruendungEntwurf = signal<ReadonlyMap<string, string>>(new Map());
  /** Zuletzt eingegebene Tätigkeit, nur für diese Sitzung als Vorschlag. */
  private letzteTaetigkeit = '';
  /** HiOrg-Anrede je Person (für Frau/Herr im Antrag); nie gespeichert. */
  private readonly anredeJePerson = signal<ReadonlyMap<string, string>>(new Map());
  /** HiOrg-Id je Person, um beim Antrag deren Anschrift einzeln abzurufen; nie gespeichert. */
  private hiorgIdJePerson: ReadonlyMap<string, string> = new Map();
  /** Gruppen je Person aus HiOrg (Best effort, ohne Verbindung leer); leere Auswahl heißt alle. */
  private readonly gruppenJePerson = signal<ReadonlyMap<string, string[]>>(new Map());
  readonly gruppen = computed(() =>
    gruppenSammeln(Array.from(this.gruppenJePerson().values(), (gruppen) => ({ gruppen }))),
  );
  readonly gruppenAuswahl = signal<string[]>([]);
  readonly gruppenHinweis = signal('');
  readonly angezeigteSpalten = computed(() =>
    this.spalten.flatMap((s) => (s === 'name' ? [s, 'gruppen'] : [s])),
  );

  gruppenText(zeile: Zeile): string {
    return (
      this.gruppenJePerson().get(personSchluessel(zeile.eintrag.nachname, zeile.eintrag.vorname)) ??
      []
    ).join(', ');
  }
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
        begruendung: stand?.begruendung ?? '',
        antragErstelltAm: stand?.antragErstelltAm ?? null,
        ov: zustaendigeOv.get(eintrag.personId ?? '') ?? null,
      };
    });
  });

  readonly zeilen = computed(() => {
    const filter = this.bearbeitung();
    const gruppenAuswahl = this.gruppenAuswahl();
    const gruppenJePerson = this.gruppenJePerson();
    return this.alleZeilen().filter(
      (zeile) =>
        passtZuGruppen(
          gruppenJePerson.get(personSchluessel(zeile.eintrag.nachname, zeile.eintrag.vorname)) ??
            [],
          gruppenAuswahl,
        ) &&
        (filter === 'alle'
          ? true
          : filter === 'offen'
            ? !zeile.abgestimmtOb && !zeile.beantragt
            : filter === 'abgestimmt'
              ? zeile.abgestimmtOb && !zeile.beantragt
              : zeile.beantragt),
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
    // Nur für den Gruppenfilter; die Tabelle wartet nicht darauf.
    if (this.gruppenJePerson().size === 0) await this.hiorgZuordnungLaden();
  }

  private async hiorgZuordnungLaden(): Promise<void> {
    const ergebnis = await gruppenJePersonLaden(this.hiorg);
    this.gruppenJePerson.set(ergebnis.gruppen);
    this.anredeJePerson.set(ergebnis.anreden);
    this.hiorgIdJePerson = ergebnis.ids;
    this.gruppenHinweis.set(ergebnis.hinweis);
  }

  /**
   * Anrede und Anschrift für den Antrag. Fehlt die HiOrg-Zuordnung (etwa weil HiOrg beim Öffnen
   * der Seite nicht verbunden war), wird sie einmal nachgeladen. Ohne Treffer bleiben die Felder
   * leer; der Grund steht in `hinweis`.
   */
  private async antragsangaben(
    schluessel: string,
  ): Promise<{ anschrift: HiorgAntragsdaten | null; anrede: string | undefined; hinweis: string }> {
    if (this.hiorgIdJePerson.size === 0) await this.hiorgZuordnungLaden();
    const anrede = this.anredeJePerson().get(schluessel);
    if (this.hiorgIdJePerson.size === 0) {
      return { anschrift: null, anrede, hinweis: this.gruppenHinweis() || 'HiOrg nicht verbunden' };
    }
    const id = this.hiorgIdJePerson.get(schluessel);
    if (!id) {
      return {
        anschrift: null,
        anrede,
        hinweis: 'Person in HiOrg nicht eindeutig gefunden (Name abweichend oder doppelt)',
      };
    }
    try {
      const anschrift = await this.hiorg.antragsdatenLaden(id);
      return { anschrift, anrede: anschrift.anrede ?? anrede, hinweis: '' };
    } catch {
      return { anschrift: null, anrede, hinweis: 'Anschrift aus HiOrg nicht abrufbar' };
    }
  }

  zeileId(_index: number, zeile: Zeile): string {
    return zeile.id;
  }

  auszeichnungText(schluessel: EhrungSchluessel): string {
    return EHRUNG_BEZEICHNUNG[schluessel];
  }

  private async vorgangSpeichern(zeile: Zeile, aktion: () => Promise<void>): Promise<boolean> {
    if (!zeile.eintrag.personId || this.speichernd().has(zeile.id)) return false;
    this.fehler.set('');
    this.speichernd.update((alt) => new Set(alt).add(zeile.id));
    try {
      await aktion();
      return true;
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Der Stand konnte nicht gespeichert werden.',
      );
      return false;
    } finally {
      this.speichernd.update((alt) => {
        const neu = new Set(alt);
        neu.delete(zeile.id);
        return neu;
      });
    }
  }

  async abgestimmt(zeile: Zeile, wert: boolean): Promise<void> {
    const personId = zeile.eintrag.personId;
    if (!personId) return;
    await this.vorgangSpeichern(zeile, () =>
      this.dienst.vorgangSetzen(personId, zeile.eintrag.auszeichnung, 'abgestimmtOb', wert),
    );
  }

  begruendungText(zeile: Zeile): string {
    return this.begruendungEntwurf().get(zeile.id) ?? zeile.begruendung;
  }

  begruendungGeaendert(zeile: Zeile, text: string): void {
    this.begruendungEntwurf.update((alt) => new Map(alt).set(zeile.id, text));
  }

  /** Speichert beim Verlassen des Feldes, und nur, wenn sich der Text tatsächlich geändert hat. */
  async begruendungSpeichern(zeile: Zeile): Promise<boolean> {
    const entwurf = this.begruendungEntwurf().get(zeile.id);
    const personId = zeile.eintrag.personId;
    if (entwurf === undefined || !personId) return true;
    if (entwurf.trim() === zeile.begruendung) {
      this.entwurfVerwerfen(zeile.id);
      return true;
    }
    const gespeichert = await this.vorgangSpeichern(zeile, () =>
      this.dienst.vorgangAendern(personId, zeile.eintrag.auszeichnung, { begruendung: entwurf }),
    );
    if (gespeichert) this.entwurfVerwerfen(zeile.id);
    return gespeichert;
  }

  private entwurfVerwerfen(id: string): void {
    this.begruendungEntwurf.update((alt) => {
      const neu = new Map(alt);
      neu.delete(id);
      return neu;
    });
  }

  /** `TT.MM.JJJJ` des zuletzt erstellten Antrags in Berliner Zeit. */
  erstelltAm(zeile: Zeile): string {
    if (!zeile.antragErstelltAm) return '';
    const zeitpunkt = new Date(zeile.antragErstelltAm);
    return Number.isNaN(zeitpunkt.getTime())
      ? ''
      : zeitpunkt.toLocaleDateString('de-DE', {
          timeZone: 'Europe/Berlin',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
  }

  /**
   * Füllt die hinterlegte Antragsvorlage für diese Zeile und lädt sie herunter. Die Tätigkeit
   * wird jedes Mal abgefragt; LV und RV kommen aus den Organisationsstammdaten. Erst nach dem
   * Download wird der Antrag am Server vermerkt.
   */
  async antragHerunterladen(zeile: Zeile): Promise<void> {
    const personId = zeile.eintrag.personId;
    const person = this.dienst.personen().find((p) => p.id === personId);
    if (!personId || !person || this.arbeitet()) return;
    this.fehler.set('');
    this.rueckmeldung.set('');
    if (!(await this.begruendungSpeichern(zeile))) return;
    const taetigkeit = await this.dialogDienst.eingabe(
      `Antrag für ${person.vorname} ${person.nachname}: ${zeile.auszeichnung}. Die Tätigkeit erscheint im Formular unter „Tätigkeit“.`,
      'Antrag erstellen',
      'Tätigkeit',
      {
        bestaetigenLabel: 'PDF erstellen',
        wert: this.letzteTaetigkeit,
        leerErlaubt: true,
        maxLaenge: 120,
      },
    );
    if (taetigkeit === null) return;
    this.letzteTaetigkeit = taetigkeit;
    this.arbeitet.set(true);
    try {
      const [vorlage, konfiguration] = await Promise.all([
        this.antragVorlage.datenLaden(),
        this.systemkonfiguration.laden(),
      ]);
      const { organisationLandesverband, organisationRegionalverband } =
        konfiguration.einstellungen;
      const angaben = await this.antragsangaben(personSchluessel(person.nachname, person.vorname));
      const anrede = uhrArtAusAnrede(angaben.anrede);
      const anschrift = angaben.anschrift;
      const aktuell = this.dienst.vorgaenge().get(zeile.id);
      const pdf = await ehrungsantragFuellen(vorlage, {
        person,
        auszeichnung: zeile.eintrag.auszeichnung,
        landesverband: organisationLandesverband,
        regionalverband: organisationRegionalverband,
        taetigkeit,
        begruendung: aktuell?.begruendung ?? zeile.begruendung,
        anrede,
        anschrift,
      });
      dateiHerunterladen(
        pdf.slice(),
        `antrag-${dateinamenTeil(person.nachname)}-${dateinamenTeil(person.vorname)}-${zeile.eintrag.auszeichnung}.pdf`,
        EHRUNGSANTRAG_MEDIENTYP,
      );
      const offen: string[] = [];
      if (!organisationLandesverband || !organisationRegionalverband) {
        offen.push('Landes- bzw. Regionalverband (Systemkonfiguration, Organisationsstammdaten)');
      }
      if (!anrede) offen.push('Frau/Herr');
      const fehlend = [
        !anschrift?.strasse && 'Straße',
        !(anschrift?.plz || anschrift?.ort) && 'Wohnort',
        !anschrift?.geburtsdatum && 'Geburtsdatum',
      ].filter((feld): feld is string => !!feld);
      if (fehlend.length > 0) {
        offen.push(`${fehlend.join(', ')}${angaben.hinweis ? ` (${angaben.hinweis})` : ''}`);
      }
      offen.push('Datum der Verleihung und Unterschriften');
      this.rueckmeldung.set(`Antrag erstellt. Von Hand zu ergänzen: ${offen.join('; ')}.`);
      const vermerkt = await this.vorgangSpeichern(zeile, () =>
        this.dienst.vorgangAendern(personId, zeile.eintrag.auszeichnung, { antragErstellt: true }),
      );
      if (!vermerkt) {
        this.fehler.set(
          'Der Antrag wurde heruntergeladen, aber „zuletzt erstellt am“ konnte nicht gespeichert werden.',
        );
      }
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof WorkerFehler && fehler.status === 404
          ? 'Es ist noch keine Antragsvorlage hinterlegt. Bitte im Verwaltungsbereich unter „Ehrungsantrag-Vorlage“ hochladen.'
          : fehler instanceof Error
            ? fehler.message
            : 'Der Antrag konnte nicht erstellt werden.',
      );
    } finally {
      this.arbeitet.set(false);
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
      const offeneUhren = this.zeilen().filter((z) => z.eintrag.gruppe === 'Jubiläumsuhr');
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
        new Set(this.zeilen().map((zeile) => zeile.id)),
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
