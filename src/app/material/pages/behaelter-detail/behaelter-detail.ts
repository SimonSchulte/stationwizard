import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { FahrzeugStoreService } from '../../../fahrzeuge/services/fahrzeug-store.service';
import { BehaelterStoreService } from '../../services/behaelter-store.service';
import { PruefvorlageStoreService } from '../../services/pruefvorlage-store.service';

/**
 * Stammdaten eines Behälters: an welchem Fahrzeug er hängt und welcher
 * Prüfvorlage er folgt.
 *
 * Greift für die Fahrzeugauswahl auf den `FahrzeugStoreService` des
 * Fahrzeugmoduls zu. Das ist keine künstliche Vereinheitlichung, sondern der
 * Kern der Fachlichkeit: ein Behälter ohne Fahrzeug ergibt nichts, und beide
 * Module teilen aus demselben Grund bereits eine Datenbank.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-behaelter-detail',
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatToolbarModule,
  ],
  templateUrl: './behaelter-detail.html',
  styleUrl: './behaelter-detail.less',
})
export class BehaelterDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly store = inject(BehaelterStoreService);
  private readonly fahrzeugStore = inject(FahrzeugStoreService);
  private readonly vorlagenStore = inject(PruefvorlageStoreService);

  readonly entwurf = this.store.entwurf;
  readonly laedt = this.store.ladeLaeuft;
  readonly ladeFehler = this.store.ladeFehler;
  readonly speichertGerade = this.store.speichertGerade;
  readonly speicherFehler = this.store.speicherFehler;
  readonly hatAenderungen = this.store.hatUngesicherteAenderungen;
  readonly istNeu = this.store.istNeu;
  readonly loeschFehler = this.store.loeschFehler;

  readonly fahrzeuge = this.fahrzeugStore.fahrzeuge;
  readonly vorlagen = this.vorlagenStore.koepfe;

  private readonly routenId = toSignal(
    this.route.paramMap.pipe(
      map((paramMap) => paramMap.get('id')),
      distinctUntilChanged(),
    ),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  readonly speicherbar = computed(() => {
    const entwurf = this.entwurf();
    return Boolean(
      entwurf &&
      entwurf.bezeichnung.trim() !== '' &&
      entwurf.fahrzeugId !== '' &&
      entwurf.vorlageId !== '',
    );
  });

  constructor() {
    void this.fahrzeugStore.listeLaden();
    void this.vorlagenStore.listeLaden();
    effect(() => {
      const id = this.routenId();
      // Wie im Vorlageneditor: nach dem Anlegen ersetzt `speichern()` die Route
      // `neu` durch die echte Id, ohne die Komponente neu zu erzeugen.
      if (id === 'neu' || id === null) {
        if (!this.store.entwurf()) this.store.neuerBehaelter();
        return;
      }
      if (this.store.geladen()?.daten.id !== id) void this.store.behaelterLaden(id);
    });
  }

  feldAendern(feld: 'bezeichnung' | 'bemerkung' | 'fahrzeugId' | 'vorlageId', wert: string): void {
    this.store.entwurfAendern((behaelter) => ({ ...behaelter, [feld]: wert }));
  }

  async speichern(): Promise<void> {
    const warNeu = this.store.istNeu();
    const entwurf = this.entwurf();
    if (!(await this.store.speichern()) || !entwurf) return;
    if (warNeu) {
      void this.router.navigate(['/material/behaelter', entwurf.id], { replaceUrl: true });
    }
  }

  async loeschen(): Promise<void> {
    const entwurf = this.entwurf();
    if (!entwurf) return;
    const bestaetigt = await this.dialogDienst.bestaetigen(
      `Der Behälter „${entwurf.bezeichnung}" wird endgültig gelöscht. Das ist nur möglich, ` +
        'solange für ihn noch kein Check erfasst wurde.',
      'Behälter löschen',
      'Endgültig löschen',
    );
    if (!bestaetigt) return;
    if (await this.store.behaelterLoeschen(entwurf.id)) {
      void this.router.navigate(['/material']);
    }
  }
}
