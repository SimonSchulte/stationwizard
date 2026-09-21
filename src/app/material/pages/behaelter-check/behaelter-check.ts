import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { CheckFortschritt } from '../../components/check-fortschritt/check-fortschritt';
import { CheckPosition } from '../../components/check-position/check-position';
import { PruefFach } from '../../models/pruefvorlage.model';
import { CheckStoreService } from '../../services/check-store.service';

/**
 * Der Fahrzeugcheck im angemeldeten Bereich.
 *
 * Aufbau nach dem Prototyp, aber ohne dessen Schwächen: der Fortschritt klebt
 * oben und bleibt beim Scrollen sichtbar, Fächer sind einzeln aufklappbar, und
 * das Zurücksetzen bestätigt über den gemeinsamen Dialog statt über einen
 * selbstgebauten Zwei-Tipp-Behelf.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-behaelter-check',
  imports: [
    DatePipe,
    RouterLink,
    CheckFortschritt,
    CheckPosition,
    MatButtonModule,
    MatExpansionModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatToolbarModule,
  ],
  templateUrl: './behaelter-check.html',
  styleUrl: './behaelter-check.less',
})
export class BehaelterCheck {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);
  readonly store = inject(CheckStoreService);

  readonly auftrag = this.store.auftrag;
  readonly stand = this.store.stand;
  readonly laedt = this.store.laedt;
  readonly ladeFehler = this.store.ladeFehler;
  readonly reichtEin = this.store.reichtEin;
  readonly einreichFehler = this.store.einreichFehler;
  readonly fortschritt = this.store.fortschritt;
  readonly einreichbar = this.store.einreichbar;
  readonly entwurfGefundenAm = this.store.entwurfGefundenAm;
  readonly heute = this.store.heutigerTag;

  /** Welche Fächer offen sind; anfangs alle zu, damit die Seite nicht erschlägt. */
  readonly offeneFaecher = signal<ReadonlySet<string>>(new Set());

  private readonly routenId = toSignal(
    this.route.paramMap.pipe(
      map((paramMap) => paramMap.get('id')),
      distinctUntilChanged(),
    ),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  readonly verfallsdatumErfasst = computed(() => this.stand()?.verfallsdatumErfasst ?? false);

  readonly faecher = computed(() => this.auftrag()?.vorlage.faecher ?? []);

  constructor() {
    effect(() => {
      const id = this.routenId();
      if (id === null) return;
      if (this.store.auftrag()?.behaelter.id !== id) void this.store.auftragLaden(id);
    });
  }

  fachOffen(fachId: string): boolean {
    return this.offeneFaecher().has(fachId);
  }

  fachUmschalten(fachId: string, offen: boolean): void {
    const naechste = new Set(this.offeneFaecher());
    if (offen) naechste.add(fachId);
    else naechste.delete(fachId);
    this.offeneFaecher.set(naechste);
  }

  alleFaecher(offen: boolean): void {
    this.offeneFaecher.set(offen ? new Set(this.faecher().map((fach) => fach.id)) : new Set());
  }

  kennzahlen(fach: PruefFach) {
    return this.store.fachKennzahlen(fach.id);
  }

  fachZusammenfassung(fach: PruefFach): string {
    const stand = this.kennzahlen(fach);
    if (!stand) return '';
    const teile = [`${stand.geprueft}/${stand.gesamt} geprüft`];
    if (stand.unvollstaendig > 0) teile.push(`${stand.unvollstaendig} zu melden`);
    if (stand.verfallshinweise > 0) teile.push(`${stand.verfallshinweise} Verfallsdatum`);
    return teile.join(' · ');
  }

  position(artikelId: string) {
    return this.stand()?.positionen[artikelId] ?? null;
  }

  umschalten(artikelId: string): void {
    const position = this.position(artikelId);
    if (!position) return;
    this.store.positionAendern(artikelId, { geprueft: !position.geprueft });
  }

  async allesAufSoll(): Promise<void> {
    const bestaetigt = await this.dialogDienst.bestaetigen(
      'Alle Positionen werden auf den Soll-Bestand gesetzt und abgehakt. Das ist eine ' +
        'Abkürzung für einen vollständigen Behälter – jede Abweichung muss danach einzeln ' +
        'korrigiert werden.',
      'Alles auf Soll setzen',
      'Alles auf Soll setzen',
    );
    if (bestaetigt) this.store.allesAufSoll();
  }

  async zuruecksetzen(): Promise<void> {
    const bestaetigt = await this.dialogDienst.bestaetigen(
      'Alle Eingaben dieses Checks werden verworfen.',
      'Check zurücksetzen',
      'Zurücksetzen',
    );
    if (bestaetigt) this.store.zuruecksetzen();
  }

  async entwurfVerwerfen(): Promise<void> {
    const bestaetigt = await this.dialogDienst.bestaetigen(
      'Der auf diesem Gerät gesicherte Zwischenstand wird gelöscht und der Check beginnt von vorn.',
      'Zwischenstand verwerfen',
      'Verwerfen',
    );
    if (bestaetigt) this.store.entwurfVerwerfen();
  }

  async einreichen(): Promise<void> {
    const kennzahlen = this.fortschritt();
    if (!kennzahlen) return;
    const offen = kennzahlen.gesamt - kennzahlen.geprueft;
    const bestaetigt = await this.dialogDienst.bestaetigen(
      offen > 0
        ? `${offen} von ${kennzahlen.gesamt} Positionen sind nicht abgehakt. Der Check wird ` +
            'trotzdem gespeichert und als unvollständig ausgewiesen.'
        : `Alle ${kennzahlen.gesamt} Positionen sind geprüft. Der Check wird gespeichert und ` +
            'lässt sich danach nicht mehr ändern – eine Korrektur ist ein neuer Check.',
      'Check abschließen',
      'Abschließen',
    );
    if (!bestaetigt) return;
    const check = await this.store.einreichen();
    if (check) void this.router.navigate(['/material/checks', check.id], { replaceUrl: true });
  }
}
