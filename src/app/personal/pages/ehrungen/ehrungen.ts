import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DATE_LOCALE, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { HiorgPersonalService } from '../../../kern/hiorg/hiorg-personal.service';
import { heuteIso, isoZuLokalesDatum, lokalesDatumZuIso } from '../../../kern/kalender/datum';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import { VerlassenSchutz } from '../../../kern/verlassen-schutz';
import { WorkerFehler } from '../../../kern/worker-client';
import { ehrungenExcelErzeugen, EHRUNGEN_EXCEL_MEDIENTYP } from '../../services/ehrungen-excel';
import {
  EHRENZEICHEN,
  EHRUNG_BEZEICHNUNG,
  EHRUNG_SCHLUESSEL,
  EHRUNG_KURZ,
  JUBILAEUMSZEICHEN,
  LEISTUNGSABZEICHEN,
  VERGABEJAHR_MAXIMUM,
  VERGABEJAHR_MINIMUM,
  aktuellesJahr,
  ansprueche,
  hatErhalten,
  leistungAbgleich,
  mitgliedsjahre,
  personSchluessel,
  stundenTextLesen,
  type Anspruch,
  type Ansprueche,
  type EhrungPerson,
  type EhrungSchluessel,
  type Erhalten,
  type LeistungAbgleich,
} from '../../services/ehrungen-regeln';
import { EhrungenService, type EhrungAenderung } from '../../services/ehrungen.service';

interface Zeile {
  person: EhrungPerson;
  /** Angezeigter Stand: gespeicherter Stand mit den noch ungesicherten Änderungen darüber. */
  stand: EhrungAenderung;
  ansprueche: Ansprueche;
  jahre: number | null;
  abgleich: LeistungAbgleich;
  /** Einmal je Berechnung erzeugt: ein neues Date je Prüfung ließe die Bindung nie zur Ruhe kommen. */
  eintrittAlsDatum: Date | null;
  geaendert: boolean;
}

function gleich(a: EhrungAenderung, b: EhrungAenderung): boolean {
  const schluesselA = Object.keys(a.erhalten) as EhrungSchluessel[];
  return (
    a.eintrittsdatum === b.eintrittsdatum &&
    a.besondereVerdienste === b.besondereVerdienste &&
    schluesselA.length === Object.keys(b.erhalten).length &&
    schluesselA.every(
      (schluessel) =>
        hatErhalten(b.erhalten, schluessel) && a.erhalten[schluessel] === b.erhalten[schluessel],
    )
  );
}

export type StatusFilter = 'alle' | 'erhalten' | 'faellig' | 'ohne-jahr';

type Gruppe = 'leistung' | 'jubilaeum' | 'ehrenzeichen';

function gruppeVon(schluessel: EhrungSchluessel): Gruppe {
  if (LEISTUNGSABZEICHEN.includes(schluessel)) return 'leistung';
  return JUBILAEUMSZEICHEN.includes(schluessel) ? 'jubilaeum' : 'ehrenzeichen';
}

/**
 * Ehrungen: Leistungsabzeichen, Jubiläumszeichen und Ehrenzeichen je Person.
 * Stunden kommen aus einem eingefügten Text, das Eintrittsdatum von Hand oder
 * aus HiOrg; erhaltene Auszeichnungen werden angehakt und gesammelt gespeichert
 * (ein Schreibvorgang je tatsächlich geänderter Person). Was fällig ist, wird
 * aus Stunden, Eintrittsdatum und „Besondere Verdienste" berechnet
 * (`ehrungen-regeln.ts`). Die Daten liegen in der D1-Datenbank, nicht im Browser.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ehrungen',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    MatToolbarModule,
    MatTooltipModule,
    RouterLink,
  ],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'de-DE' }],
  host: { '[class.vollbild]': 'vollbild()' },
  templateUrl: './ehrungen.html',
  styleUrl: './ehrungen.less',
})
export class Ehrungen implements OnInit {
  private readonly dienst = inject(EhrungenService);
  private readonly hiorg = inject(HiorgPersonalService);
  private readonly dialogDienst = inject(DialogDienst);

  private readonly dokument = inject(DOCUMENT);

  readonly bezeichnung = EHRUNG_BEZEICHNUNG;
  readonly kurz = EHRUNG_KURZ;
  readonly spalten = [
    'abgleich',
    'nachname',
    'vorname',
    'stunden',
    'eintritt',
    'jahre',
    'leistung',
    'jubilaeum',
    'verdienste',
    'ehrenzeichen',
    'aktionen',
  ];
  readonly gruppen: { name: string; schluessel: readonly EhrungSchluessel[] }[] = [
    { name: 'Leistungsabzeichen', schluessel: LEISTUNGSABZEICHEN },
    { name: 'Jubiläumszeichen', schluessel: JUBILAEUMSZEICHEN },
    { name: 'Ehrenzeichen', schluessel: EHRENZEICHEN },
  ];
  readonly leistung = LEISTUNGSABZEICHEN;
  readonly jubilaeum = JUBILAEUMSZEICHEN;
  readonly ehrenzeichen = EHRENZEICHEN;
  readonly jahr = aktuellesJahr();

  readonly laedt = signal(false);
  readonly arbeitet = signal(false);
  readonly fehler = signal('');
  readonly rueckmeldung = signal('');
  readonly suche = signal('');
  /** Gewählte Auszeichnungen; leer heißt alle. */
  readonly auszeichnungen = signal<EhrungSchluessel[]>([]);
  readonly status = signal<StatusFilter>('alle');
  readonly vollbild = signal(false);
  /** Standard: meiste Stunden zuerst. Leere Richtung heißt Reihenfolge des Servers (Name). */
  readonly sortierung = signal<Sort>({ active: 'stunden', direction: 'desc' });
  readonly vergabejahrMinimum = VERGABEJAHR_MINIMUM;
  readonly vergabejahrMaximum = VERGABEJAHR_MAXIMUM;
  /** Noch nicht gespeicherte Änderungen je Personen-Id. */
  readonly entwurf = signal<Record<string, EhrungAenderung>>({});

  readonly importOffen = signal(false);
  readonly importText = signal('');

  readonly zeilen = computed<Zeile[]>(() => {
    const entwurf = this.entwurf();
    return this.dienst.personen().map((person) => {
      const gespeichert: EhrungAenderung = {
        eintrittsdatum: person.eintrittsdatum,
        besondereVerdienste: person.besondereVerdienste,
        erhalten: person.erhalten,
      };
      const stand = entwurf[person.id] ?? gespeichert;
      return {
        person,
        stand,
        ansprueche: ansprueche({ ...person, ...stand }, this.jahr),
        jahre: mitgliedsjahre(stand.eintrittsdatum, this.jahr),
        abgleich: leistungAbgleich(person.stunden, stand.erhalten),
        eintrittAlsDatum: stand.eintrittsdatum ? isoZuLokalesDatum(stand.eintrittsdatum) : null,
        geaendert: person.id in entwurf,
      };
    });
  });

  readonly gefiltert = computed(() => {
    const suche = this.suche().trim().toLocaleLowerCase('de');
    const gewaehlt = this.auszeichnungen();
    const status = this.status();
    return this.zeilen().filter(
      (zeile) =>
        (!suche ||
          `${zeile.person.nachname} ${zeile.person.vorname}`
            .toLocaleLowerCase('de')
            .includes(suche)) &&
        this.passtZuFilter(zeile, gewaehlt, status),
    );
  });

  readonly sortiert = computed(() => {
    const { active, direction } = this.sortierung();
    const liste = this.gefiltert();
    if (!direction) return liste;
    const wert = (zeile: Zeile): string | number => {
      switch (active) {
        case 'nachname':
          return zeile.person.nachname.toLocaleLowerCase('de');
        case 'vorname':
          return zeile.person.vorname.toLocaleLowerCase('de');
        case 'stunden':
          return zeile.person.stunden;
        case 'eintritt':
          return zeile.stand.eintrittsdatum ?? '';
        default:
          return zeile.jahre ?? -1;
      }
    };
    const faktor = direction === 'asc' ? 1 : -1;
    return [...liste].sort((a, b) => {
      const x = wert(a);
      const y = wert(b);
      const vergleich =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'de');
      // Gleiche Werte bleiben nach Nach- und Vorname geordnet.
      return (
        faktor * vergleich ||
        a.person.nachname.localeCompare(b.person.nachname, 'de') ||
        a.person.vorname.localeCompare(b.person.vorname, 'de')
      );
    });
  });

  readonly filterAktiv = computed(
    () =>
      this.suche().trim() !== '' || this.auszeichnungen().length > 0 || this.status() !== 'alle',
  );

  readonly anzahlGeaendert = computed(() => Object.keys(this.entwurf()).length);

  /** Vorschau des Textimports gegen den geladenen Bestand. */
  readonly importVorschau = computed(() => {
    const { eintraege, fehler } = stundenTextLesen(this.importText());
    const bestand = new Map(
      this.dienst
        .personen()
        .map((person) => [personSchluessel(person.nachname, person.vorname), person]),
    );
    const gesehen = new Set<string>();
    let neu = 0;
    let geaendert = 0;
    let unveraendert = 0;
    let doppelt = 0;
    for (const eintrag of eintraege) {
      const schluessel = personSchluessel(eintrag.nachname, eintrag.vorname);
      if (gesehen.has(schluessel)) {
        doppelt++;
        continue;
      }
      gesehen.add(schluessel);
      const vorhanden = bestand.get(schluessel);
      if (!vorhanden) neu++;
      else if (vorhanden.stunden === eintrag.stunden) unveraendert++;
      else geaendert++;
    }
    return { eintraege, fehler, neu, geaendert, unveraendert, doppelt };
  });

  constructor() {
    inject(VerlassenSchutz).registrieren(() => this.anzahlGeaendert() > 0);
    // Esc beendet das Browser-Vollbild; die Seite folgt, statt im Zwischenzustand zu bleiben.
    const beiVollbildwechsel = () => {
      if (!this.dokument.fullscreenElement) this.vollbild.set(false);
    };
    this.dokument.addEventListener('fullscreenchange', beiVollbildwechsel);
    inject(DestroyRef).onDestroy(() => {
      this.dokument.removeEventListener('fullscreenchange', beiVollbildwechsel);
      if (this.dokument.fullscreenElement)
        void this.dokument.exitFullscreen().catch(() => undefined);
    });
  }

  /**
   * Vollbild der ganzen Seite, damit Dialoge und Datumsauswahl sichtbar bleiben. Wo der Browser
   * kein Vollbild erlaubt (etwa iOS), bleibt die Seite als Vollbild-Fläche über der App-Hülle.
   */
  async vollbildUmschalten(): Promise<void> {
    if (this.vollbild()) {
      this.vollbild.set(false);
      if (this.dokument.fullscreenElement)
        await this.dokument.exitFullscreen().catch(() => undefined);
      return;
    }
    this.vollbild.set(true);
    await this.dokument.documentElement.requestFullscreen().catch(() => undefined);
  }

  private passtZuFilter(zeile: Zeile, gewaehlt: EhrungSchluessel[], status: StatusFilter): boolean {
    if (gewaehlt.length === 0 && status === 'alle') return true;
    const schluessel = gewaehlt.length > 0 ? gewaehlt : EHRUNG_SCHLUESSEL;
    return schluessel.some((eintrag) => {
      const hat = hatErhalten(zeile.stand.erhalten, eintrag);
      const anspruch = zeile.ansprueche[gruppeVon(eintrag)];
      const zuVergeben = anspruch.erfuellt === eintrag;
      switch (status) {
        case 'erhalten':
          return hat;
        case 'faellig':
          return zuVergeben && anspruch.faellig;
        case 'ohne-jahr':
          return hat && zeile.stand.erhalten[eintrag] === null;
        default:
          return hat || zuVergeben;
      }
    });
  }

  filterZuruecksetzen(): void {
    this.suche.set('');
    this.auszeichnungen.set([]);
    this.status.set('alle');
  }

  ngOnInit(): void {
    void this.laden();
  }

  async laden(): Promise<void> {
    if (this.laedt()) return;
    this.laedt.set(true);
    this.fehler.set('');
    try {
      await this.dienst.laden();
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Die Ehrungen konnten nicht geladen werden.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  private aendern(person: EhrungPerson, neu: EhrungAenderung): void {
    const gespeichert: EhrungAenderung = {
      eintrittsdatum: person.eintrittsdatum,
      besondereVerdienste: person.besondereVerdienste,
      erhalten: person.erhalten,
    };
    this.entwurf.update((entwurf) => {
      const kopie = { ...entwurf };
      if (gleich(neu, gespeichert)) delete kopie[person.id];
      else kopie[person.id] = neu;
      return kopie;
    });
  }

  /** Anhaken ohne Jahr: das Vergabejahr bleibt bewusst leer, bis es eingetragen wird. */
  umschalten(zeile: Zeile, schluessel: EhrungSchluessel, angehakt: boolean): void {
    const erhalten: Erhalten = { ...zeile.stand.erhalten };
    if (angehakt) erhalten[schluessel] = null;
    else delete erhalten[schluessel];
    this.aendern(zeile.person, { ...zeile.stand, erhalten });
  }

  vergabejahr(zeile: Zeile, schluessel: EhrungSchluessel, text: string): void {
    const zahl = Number(text.trim());
    const jahr =
      text.trim() !== '' &&
      Number.isInteger(zahl) &&
      zahl >= VERGABEJAHR_MINIMUM &&
      zahl <= VERGABEJAHR_MAXIMUM
        ? zahl
        : null;
    this.aendern(zeile.person, {
      ...zeile.stand,
      erhalten: { ...zeile.stand.erhalten, [schluessel]: jahr },
    });
  }

  verdienste(zeile: Zeile, wert: boolean): void {
    this.aendern(zeile.person, { ...zeile.stand, besondereVerdienste: wert });
  }

  eintritt(zeile: Zeile, datum: Date | null): void {
    const iso = datum ? lokalesDatumZuIso(datum) : null;
    if (iso === zeile.stand.eintrittsdatum) return;
    this.aendern(zeile.person, { ...zeile.stand, eintrittsdatum: iso });
  }

  hat(zeile: Zeile, schluessel: EhrungSchluessel): boolean {
    return hatErhalten(zeile.stand.erhalten, schluessel);
  }

  jahrVon(zeile: Zeile, schluessel: EhrungSchluessel): number | null {
    return zeile.stand.erhalten[schluessel] ?? null;
  }

  abgleichText(zeile: Zeile): string {
    switch (zeile.abgleich) {
      case 'fehlt':
        return `Leistungsabzeichen fehlt: nach den Stunden steht ${this.kurzBezeichnung(zeile.ansprueche.leistung.erfuellt)} zu, angehakt ist weniger.`;
      case 'zuviel':
        return 'Mehr Leistungsabzeichen angehakt, als die Stunden hergeben. Stunden oder Häkchen prüfen.';
      default:
        return 'Leistungsabzeichen passen zu den Stunden.';
    }
  }

  anspruchVon(zeile: Zeile, gruppe: number): Anspruch {
    return [zeile.ansprueche.leistung, zeile.ansprueche.jubilaeum, zeile.ansprueche.ehrenzeichen][
      gruppe
    ]!;
  }

  kurzBezeichnung(schluessel: EhrungSchluessel | null): string {
    return schluessel ? EHRUNG_KURZ[schluessel] : '';
  }

  /** Klasse für die Chipfarbe je Auszeichnung. */
  chipKlasse(schluessel: EhrungSchluessel): string {
    return `chip-${gruppeVon(schluessel) === 'leistung' ? schluessel : gruppeVon(schluessel)}`;
  }

  verwerfen(): void {
    this.entwurf.set({});
    this.rueckmeldung.set('');
  }

  /** Schreibt nur tatsächlich geänderte Personen, je mit der Version, die geladen wurde. */
  async speichern(): Promise<void> {
    if (this.arbeitet() || this.anzahlGeaendert() === 0) return;
    this.arbeitet.set(true);
    this.fehler.set('');
    this.rueckmeldung.set('');
    let gespeichert = 0;
    let konflikte = 0;
    let sonstige = 0;
    try {
      for (const [id, aenderung] of Object.entries(this.entwurf())) {
        const person = this.dienst.personen().find((eintrag) => eintrag.id === id);
        if (!person) continue;
        try {
          await this.dienst.speichern(person, aenderung);
          this.entwurf.update((entwurf) => {
            const kopie = { ...entwurf };
            delete kopie[id];
            return kopie;
          });
          gespeichert++;
        } catch (fehler) {
          if (fehler instanceof WorkerFehler && fehler.status === 412) konflikte++;
          else sonstige++;
        }
      }
    } finally {
      this.arbeitet.set(false);
    }
    if (konflikte > 0) {
      this.fehler.set(
        `${konflikte} Person(en) wurden zwischenzeitlich geändert und nicht gespeichert. Ihre Änderungen bleiben erhalten; bitte neu laden und erneut prüfen.`,
      );
    } else if (sonstige > 0) {
      this.fehler.set(`${sonstige} Änderung(en) konnten nicht gespeichert werden.`);
    }
    if (gespeichert > 0) this.rueckmeldung.set(`${gespeichert} Person(en) gespeichert.`);
  }

  async neuLaden(): Promise<void> {
    if (
      this.anzahlGeaendert() > 0 &&
      !(await this.dialogDienst.bestaetigen(
        'Ungespeicherte Änderungen gehen beim Neuladen verloren.',
        'Neu laden',
        'Verwerfen und laden',
      ))
    ) {
      return;
    }
    this.entwurf.set({});
    await this.laden();
  }

  async loeschen(zeile: Zeile): Promise<void> {
    const name = `${zeile.person.nachname}, ${zeile.person.vorname}`;
    if (
      !(await this.dialogDienst.bestaetigen(
        `${name} wird mit allen Angaben aus den Ehrungen entfernt. Ein späterer Stundenimport legt die Person neu an.`,
        'Person entfernen',
        'Entfernen',
      ))
    ) {
      return;
    }
    this.fehler.set('');
    try {
      await this.dienst.loeschen(zeile.person.id);
      this.entwurf.update((entwurf) => {
        const kopie = { ...entwurf };
        delete kopie[zeile.person.id];
        return kopie;
      });
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Die Person konnte nicht entfernt werden.',
      );
    }
  }

  async stundenUebernehmen(): Promise<void> {
    const vorschau = this.importVorschau();
    if (this.arbeitet() || vorschau.eintraege.length === 0) return;
    this.arbeitet.set(true);
    this.fehler.set('');
    this.rueckmeldung.set('');
    try {
      const bestand = new Map(
        this.dienst
          .personen()
          .map((person) => [personSchluessel(person.nachname, person.vorname), person]),
      );
      const ergebnisse = await this.dienst.importieren(
        true,
        vorschau.eintraege.map((eintrag) => ({
          ...eintrag,
          version: bestand.get(personSchluessel(eintrag.nachname, eintrag.vorname))?.version,
        })),
      );
      const zaehle = (art: string) => ergebnisse.filter((e) => e === art).length;
      const konflikte = zaehle('konflikt');
      this.rueckmeldung.set(
        `Stunden übernommen: ${zaehle('angelegt')} neu, ${zaehle('aktualisiert')} aktualisiert, ${zaehle('unveraendert')} unverändert` +
          (zaehle('doppelt') ? `, ${zaehle('doppelt')} doppelt im Text` : '') +
          '.',
      );
      if (konflikte > 0) {
        this.fehler.set(
          `${konflikte} Person(en) wurden zwischenzeitlich geändert und nicht aktualisiert. Bitte den Import wiederholen.`,
        );
      }
      this.importText.set('');
      this.importOffen.set(false);
    } catch (fehler) {
      this.fehler.set(fehler instanceof Error ? fehler.message : 'Der Import ist fehlgeschlagen.');
    } finally {
      this.arbeitet.set(false);
    }
  }

  /** Übernimmt `mitglied_seit` aus HiOrg für alle Personen, die auch dort gefunden werden. */
  async eintrittAusHiorg(): Promise<void> {
    if (this.arbeitet()) return;
    this.arbeitet.set(true);
    this.fehler.set('');
    this.rueckmeldung.set('');
    try {
      if ((await this.hiorg.verbindungLaden()) !== 'verbunden') {
        this.fehler.set(
          'Keine Verbindung zum HiOrg-Server. Bitte zuerst in der Personalübersicht verbinden.',
        );
        return;
      }
      const hiorgDatum = new Map<string, string>();
      for (const person of await this.hiorg.personalLaden()) {
        if (person.mitgliedSeit) {
          hiorgDatum.set(personSchluessel(person.nachname, person.vorname), person.mitgliedSeit);
        }
      }
      const eintraege = this.dienst.personen().flatMap((person) => {
        const datum = hiorgDatum.get(personSchluessel(person.nachname, person.vorname));
        return datum && datum !== person.eintrittsdatum ? [{ person, datum }] : [];
      });
      if (eintraege.length === 0) {
        this.rueckmeldung.set(
          'Alle Eintrittsdaten stimmen bereits mit HiOrg überein oder sind dort nicht erfasst.',
        );
        return;
      }
      const ueberschrieben = eintraege.filter((e) => e.person.eintrittsdatum).length;
      if (
        !(await this.dialogDienst.bestaetigen(
          `${eintraege.length} Eintrittsdatum/-daten werden aus HiOrg übernommen` +
            (ueberschrieben
              ? `, davon ${ueberschrieben} abweichend von bereits erfassten Werten (diese werden ersetzt).`
              : '.'),
          'Eintrittsdaten aus HiOrg',
          'Übernehmen',
        ))
      ) {
        return;
      }
      const ergebnisse = await this.dienst.importieren(
        false,
        eintraege.map(({ person, datum }) => ({
          nachname: person.nachname,
          vorname: person.vorname,
          eintrittsdatum: datum,
          version: person.version,
        })),
      );
      const aktualisiert = ergebnisse.filter((e) => e === 'aktualisiert').length;
      const konflikte = ergebnisse.filter((e) => e === 'konflikt').length;
      this.rueckmeldung.set(`Eintrittsdatum für ${aktualisiert} Person(en) übernommen.`);
      if (konflikte > 0) {
        this.fehler.set(
          `${konflikte} Person(en) wurden zwischenzeitlich geändert und nicht aktualisiert.`,
        );
      }
    } catch (fehler) {
      this.fehler.set(fehler instanceof Error ? fehler.message : 'Der Abruf ist fehlgeschlagen.');
    } finally {
      this.arbeitet.set(false);
    }
  }

  async excelHerunterladen(): Promise<void> {
    this.fehler.set('');
    try {
      const personen = this.zeilen().map((zeile) => ({ ...zeile.person, ...zeile.stand }));
      const daten = await ehrungenExcelErzeugen(personen, this.jahr);
      dateiHerunterladen(daten, `ehrungen-${heuteIso()}.xlsx`, EHRUNGEN_EXCEL_MEDIENTYP);
    } catch (fehler) {
      this.fehler.set(
        fehler instanceof Error ? fehler.message : 'Die Excel-Datei konnte nicht erstellt werden.',
      );
    }
  }

  stundenAnzeige(stunden: number): string {
    return stunden.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
