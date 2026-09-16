import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DATE_LOCALE, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DatePipe } from '@angular/common';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { heuteIso, jahrVon } from '../../../kern/kalender/datum';
import { KilometerBilanz } from '../../components/kilometer-bilanz/kilometer-bilanz';
import {
  Aenderungseintrag,
  EIGENTUEMER,
  Fahrzeugstamm,
  GRUPPEN,
  Kilometerstand,
  Wartungstermin,
} from '../../models/fahrzeug.model';
import { AblesungStoreService } from '../../services/ablesung-store.service';
import { AenderungsprotokollStoreService } from '../../services/aenderungsprotokoll-store.service';
import { EIGENTUEMER_LABEL } from '../../services/eigentuemer-label';
import { GRUPPE_LABEL } from '../../services/gruppe-label';
import { istGueltigeFin } from '../../services/fahrzeug-pruefung';
import { berechneJahresbilanz, sollKmProJahr } from '../../services/kilometer-soll';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import { FahrzeugDruckbogenService } from '../../services/fahrzeug-druckbogen.service';
import { ApiErfassungslinkStorage } from '../../storage/api-erfassungslink-storage';
import { erzeugeQrDataUrl, erzeugeQrSvg, fahrzeugQrZiele } from '../../services/fahrzeug-qr';
import { ermittleWartungsstatus, WartungsAmpel } from '../../services/wartungsstatus';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';

function neuerWartungstermin(art: 'hu' | 'frei'): Wartungstermin {
  return {
    id: crypto.randomUUID(),
    art,
    bezeichnung: art === 'hu' ? 'Hauptuntersuchung' : '',
    faelligAm: heuteIso(),
    erinnerungTage: 30,
    erledigtAm: null,
  };
}

/** ISO-Datum (`YYYY-MM-DD`) → lokales `Date` für `mat-datepicker`, zeitzonenunabhängig. */
function isoZuDatum(iso: string): Date | null {
  if (!iso) return null;
  const [jahr, monat, tag] = iso.split('-').map(Number);
  return new Date(jahr, monat - 1, tag);
}

/** Gegenstück zu `isoZuDatum`: lokales `Date` aus dem Datepicker → ISO-Datum. */
function datumZuIso(datum: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${datum.getFullYear()}-${pad(datum.getMonth() + 1)}-${pad(datum.getDate())}`;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fahrzeug-detail',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    MatToolbarModule,
    KilometerBilanz,
  ],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'de-DE' }],
  templateUrl: './fahrzeug-detail.html',
  styleUrl: './fahrzeug-detail.less',
})
export class FahrzeugDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);
  readonly store = inject(FahrzeugStoreService);
  readonly ablesungStore = inject(AblesungStoreService);
  readonly aenderungsprotokollStore = inject(AenderungsprotokollStoreService);
  private readonly druckbogenService = inject(FahrzeugDruckbogenService);
  private readonly linkStorage = inject(ApiErfassungslinkStorage);

  readonly EIGENTUEMER = EIGENTUEMER;
  readonly EIGENTUEMER_LABEL = EIGENTUEMER_LABEL;
  readonly GRUPPEN = GRUPPEN;
  readonly GRUPPE_LABEL = GRUPPE_LABEL;
  readonly heute = heuteIso();

  /** Reagiert auf einen Wechsel des Routenparameters, falls die Detailseite wiederverwendet wird. */
  private readonly routenId = toSignal(
    this.route.paramMap.pipe(
      map((paramMap) => paramMap.get('id')),
      distinctUntilChanged(),
    ),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  readonly istFin = computed(() => {
    const fin = this.store.entwurf()?.fahrgestellnummer;
    return !fin || istGueltigeFin(fin);
  });

  readonly jahressoll = computed(() => {
    const eigentuemer = this.store.entwurf()?.eigentuemer;
    return eigentuemer ? sollKmProJahr(eigentuemer) : null;
  });

  readonly kannSpeichern = computed(() => {
    const entwurf = this.store.entwurf();
    return (
      !!entwurf &&
      entwurf.bezeichnung.trim().length > 0 &&
      entwurf.kennzeichen.trim().length > 0 &&
      this.istFin() &&
      !this.store.speichertGerade()
    );
  });

  readonly jahresbilanz = computed(() => {
    const entwurf = this.store.entwurf();
    if (!entwurf || this.store.istNeu()) return null;
    return berechneJahresbilanz(entwurf, this.ablesungStore.ablesungen(), jahrVon(this.heute));
  });

  readonly ablesungenAbsteigend = computed(() =>
    [...this.ablesungStore.ablesungen()].sort((a, b) => b.abgelesenAm.localeCompare(a.abgelesenAm)),
  );

  /** IDs aller Ablesungen, auf die eine andere Ablesung per `korrigiert` verweist. */
  private readonly korrigierteIds = computed(
    () =>
      new Set(
        this.ablesungStore
          .ablesungen()
          .map((a) => a.korrigiert)
          .filter((id) => !!id),
      ),
  );

  /** Server sperrt das Löschen für diesen Fall ebenfalls; hier nur eine vorab sichtbare Sperre. */
  hatKorrektur(ablesung: Kilometerstand): boolean {
    return this.korrigierteIds().has(ablesung.id);
  }

  readonly korrigiertId = signal<string | null>(null);
  readonly korrekturStand = signal('');
  readonly korrekturDatum = signal(heuteIso());
  readonly korrekturBemerkung = signal('');

  readonly nachtragOffen = signal(false);
  readonly nachtragDatum = signal(heuteIso());
  readonly nachtragStand = signal('');
  readonly nachtragBemerkung = signal('');

  readonly qrLaedt = signal(false);
  readonly qrCodes = signal<{
    uebersicht: string;
    km: string;
    oeffentlich: string | null;
  } | null>(null);
  /** Das Erfassungstoken wird nur hier geladen, nicht mit der Fahrzeugliste. */
  private readonly erfassungToken = signal<string | null>(null);
  readonly qrErneuertGerade = signal(false);
  readonly qrErneuernFehler = signal('');
  readonly druckbogenLaedt = signal(false);
  readonly druckbogenFehler = signal('');

  constructor() {
    effect(() => {
      const id = this.routenId();
      if (id === 'neu' || id === null) {
        this.store.neuesFahrzeugBeginnen();
      } else {
        void this.store.fahrzeugLaden(id);
        void this.ablesungStore.laden(id);
        void this.aenderungsprotokollStore.laden(id);
      }
    });
  }

  aktualisieren<K extends keyof Fahrzeugstamm>(feld: K, wert: Fahrzeugstamm[K]): void {
    this.store.entwurfAktualisieren({ [feld]: wert } as Partial<Fahrzeugstamm>);
  }

  wartungAktualisieren(id: string, patch: Partial<Wartungstermin>): void {
    const liste = this.store.entwurf()?.wartungstermine ?? [];
    this.store.wartungstermineAktualisieren(
      liste.map((termin) => (termin.id === id ? { ...termin, ...patch } : termin)),
    );
  }

  /** Für die Datepicker-Bindung: ISO-Datum-Signale/-Felder als `Date` darstellen. */
  alsDatum(iso: string): Date | null {
    return isoZuDatum(iso);
  }

  wartungDatumAktualisieren(id: string, event: MatDatepickerInputEvent<Date>): void {
    if (!event.value) return;
    this.wartungAktualisieren(id, { faelligAm: datumZuIso(event.value) });
  }

  wartungVorlaufAktualisieren(id: string, wert: string): void {
    const erinnerungTage = Number(wert);
    this.wartungAktualisieren(id, {
      erinnerungTage: Number.isFinite(erinnerungTage) && erinnerungTage >= 0 ? erinnerungTage : 0,
    });
  }

  wartungAlsErledigtMarkieren(id: string, erledigt: boolean): void {
    this.wartungAktualisieren(id, { erledigtAm: erledigt ? heuteIso() : null });
  }

  wartungEntfernen(id: string): void {
    const liste = this.store.entwurf()?.wartungstermine ?? [];
    this.store.wartungstermineAktualisieren(liste.filter((termin) => termin.id !== id));
  }

  wartungHinzufuegen(art: 'hu' | 'frei'): void {
    const liste = this.store.entwurf()?.wartungstermine ?? [];
    this.store.wartungstermineAktualisieren([...liste, neuerWartungstermin(art)]);
  }

  wartungAmpel(termin: Wartungstermin): WartungsAmpel {
    return ermittleWartungsstatus(termin, this.heute).ampel;
  }

  hatOffeneHu(): boolean {
    return (this.store.entwurf()?.wartungstermine ?? []).some(
      (t) => t.art === 'hu' && t.erledigtAm === null,
    );
  }

  async speichern(): Promise<void> {
    const warNeu = this.store.istNeu();
    const erfolg = await this.store.speichern();
    if (erfolg && warNeu) {
      const id = this.store.entwurf()?.id;
      if (id) await this.router.navigate(['/fahrzeuge', id], { replaceUrl: true });
    }
  }

  async nachKonfliktNeuLaden(): Promise<void> {
    const id = this.store.entwurf()?.id;
    if (!id) return;
    if (
      !(await this.dialogDienst.bestaetigen(
        'Die lokalen Änderungen gehen dabei verloren. Zum Sichern zuerst die Angaben notieren.',
        'Aktuellen Stand laden',
        'Verwerfen und laden',
      ))
    )
      return;
    await this.store.neuLadenNachKonflikt(id);
  }

  korrekturBeginnen(ablesung: Kilometerstand): void {
    this.korrigiertId.set(ablesung.id);
    this.korrekturStand.set(String(ablesung.stand));
    this.korrekturDatum.set(ablesung.abgelesenAm);
    this.korrekturBemerkung.set('');
  }

  korrekturAbbrechen(): void {
    this.korrigiertId.set(null);
  }

  korrekturDatumAktualisieren(event: MatDatepickerInputEvent<Date>): void {
    if (event.value) this.korrekturDatum.set(datumZuIso(event.value));
  }

  async korrekturSpeichern(): Promise<void> {
    const fahrzeugId = this.store.entwurf()?.id;
    const korrigiert = this.korrigiertId();
    const stand = Number(this.korrekturStand());
    if (!fahrzeugId || !korrigiert || !Number.isFinite(stand) || stand < 0) return;
    const erfolg = await this.ablesungStore.erfassen({
      fahrzeugId,
      abgelesenAm: this.korrekturDatum(),
      stand,
      quelle: 'korrektur',
      korrigiert,
      bemerkung: this.korrekturBemerkung(),
    });
    if (erfolg) this.korrigiertId.set(null);
  }

  async ablesungLoeschen(ablesung: Kilometerstand): Promise<void> {
    const fahrzeugId = this.store.entwurf()?.id;
    if (!fahrzeugId) return;
    if (
      !(await this.dialogDienst.bestaetigen(
        'Die Ablesung wird endgültig gelöscht und lässt sich nicht wiederherstellen.',
        'Ablesung löschen',
        'Endgültig löschen',
      ))
    )
      return;
    await this.ablesungStore.loeschen(fahrzeugId, ablesung.id);
  }

  /**
   * Für den häufigsten Fall – den Stand zum 1.1. des laufenden Jahres
   * nachtragen, ohne den kein Jahresvergleich möglich ist (siehe
   * `kilometer-soll.ts`, `ermittleJahresstartstand`) – ist das Datum
   * vorbelegt, bleibt aber änderbar für andere fehlende Ablesungen.
   */
  nachtragBeginnen(): void {
    this.nachtragDatum.set(`${jahrVon(this.heute)}-01-01`);
    this.nachtragStand.set('');
    this.nachtragBemerkung.set('');
    this.nachtragOffen.set(true);
  }

  nachtragAbbrechen(): void {
    this.nachtragOffen.set(false);
  }

  nachtragDatumAktualisieren(event: MatDatepickerInputEvent<Date>): void {
    if (event.value) this.nachtragDatum.set(datumZuIso(event.value));
  }

  async nachtragSpeichern(): Promise<void> {
    const fahrzeugId = this.store.entwurf()?.id;
    const stand = Number(this.nachtragStand());
    if (!fahrzeugId || !Number.isFinite(stand) || stand < 0) return;
    const erfolg = await this.ablesungStore.erfassen({
      fahrzeugId,
      abgelesenAm: this.nachtragDatum(),
      stand,
      quelle: 'formular',
      korrigiert: null,
      bemerkung: this.nachtragBemerkung(),
    });
    if (erfolg) this.nachtragOffen.set(false);
  }

  async qrCodesAnzeigen(): Promise<void> {
    const id = this.store.entwurf()?.id;
    if (!id || this.qrCodes()) return;
    this.qrLaedt.set(true);
    this.qrErneuernFehler.set('');
    try {
      // Das Token steht bewusst nicht in der Fahrzeugantwort; es wird erst
      // hier, beim tatsächlichen Anzeigen der Codes, einzeln geholt.
      const link = await this.linkStorage.ladeLink(id);
      this.erfassungToken.set(link.token);
      await this.qrCodesZeichnen(id, link.token);
    } catch (fehler) {
      this.qrErneuernFehler.set(
        fehler instanceof Error ? fehler.message : 'Die QR-Codes konnten nicht geladen werden.',
      );
    } finally {
      this.qrLaedt.set(false);
    }
  }

  private async qrCodesZeichnen(id: string, token: string | null): Promise<void> {
    const ziele = fahrzeugQrZiele(id, token);
    const [uebersicht, km, oeffentlich] = await Promise.all([
      erzeugeQrDataUrl(ziele.uebersichtUrl),
      erzeugeQrDataUrl(ziele.kmUrl),
      ziele.oeffentlichUrl ? erzeugeQrDataUrl(ziele.oeffentlichUrl) : Promise.resolve(null),
    ]);
    this.qrCodes.set({ uebersicht, km, oeffentlich });
  }

  /**
   * Erzeugt ein neues Erfassungstoken. Alle bereits gedruckten öffentlichen
   * Aufkleber dieses Fahrzeugs werden dadurch sofort ungültig – es gibt
   * bewusst keine Übergangsfrist mit zwei gültigen Codes.
   */
  async qrErneuern(): Promise<void> {
    const id = this.store.entwurf()?.id;
    if (!id || this.qrErneuertGerade()) return;
    const bestaetigt = await this.dialogDienst.bestaetigen(
      'Alle bereits gedruckten öffentlichen QR-Codes dieses Fahrzeugs werden dadurch sofort ' +
        'ungültig. Neue Aufkleber müssen ausgehängt werden.',
      'QR-Code erneuern',
      'Erneuern',
    );
    if (!bestaetigt) return;
    this.qrErneuertGerade.set(true);
    this.qrErneuernFehler.set('');
    try {
      const link = await this.linkStorage.erneuere(id);
      this.erfassungToken.set(link.token);
      await this.qrCodesZeichnen(id, link.token);
      await this.aenderungsprotokollStore.laden(id);
    } catch (fehler) {
      this.qrErneuernFehler.set(
        fehler instanceof Error ? fehler.message : 'Der QR-Code konnte nicht erneuert werden.',
      );
    } finally {
      this.qrErneuertGerade.set(false);
    }
  }

  /** Eine Beschreibung kann mehrere mit `\n` getrennte Zeilen enthalten (mehrere Felder in einem Speichervorgang). */
  beschreibungZeilen(eintrag: Aenderungseintrag): string[] {
    return eintrag.beschreibung.split('\n');
  }

  async qrSvgHerunterladen(ziel: 'uebersicht' | 'km' | 'oeffentlich'): Promise<void> {
    const entwurf = this.store.entwurf();
    if (!entwurf) return;
    const ziele = fahrzeugQrZiele(entwurf.id, this.erfassungToken());
    const url =
      ziel === 'uebersicht'
        ? ziele.uebersichtUrl
        : ziel === 'km'
          ? ziele.kmUrl
          : ziele.oeffentlichUrl;
    if (!url) return;
    const svg = await erzeugeQrSvg(url);
    dateiHerunterladen(svg, `${entwurf.bezeichnung || 'fahrzeug'}-qr-${ziel}.svg`, 'image/svg+xml');
  }

  async druckbogenHerunterladen(): Promise<void> {
    const entwurf = this.store.entwurf();
    if (!entwurf) return;
    this.druckbogenLaedt.set(true);
    this.druckbogenFehler.set('');
    try {
      await this.druckbogenService.erzeugeUndSpeichere(
        entwurf,
        this.erfassungToken() ?? (await this.linkStorage.ladeLink(entwurf.id)).token,
      );
    } catch (fehler) {
      this.druckbogenFehler.set(
        fehler instanceof Error ? fehler.message : 'Der Druckbogen konnte nicht erstellt werden.',
      );
    } finally {
      this.druckbogenLaedt.set(false);
    }
  }
}
