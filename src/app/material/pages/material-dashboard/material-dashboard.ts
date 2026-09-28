import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { BehaelterUebersicht } from '../../models/behaelter.model';
import { BehaelterStoreService } from '../../services/behaelter-store.service';

/**
 * Einstieg der Materialverwaltung: alle Behälter, nach Fahrzeug gruppiert, mit
 * dem Stand der letzten Prüfung. Ein Aufruf über den ganzen Bestand – die
 * Seite lädt bewusst nichts je Behälter nach.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-material-dashboard',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatToolbarModule],
  templateUrl: './material-dashboard.html',
  styleUrl: './material-dashboard.less',
})
export class MaterialDashboard implements OnInit {
  private readonly store = inject(BehaelterStoreService);
  private readonly router = inject(Router);

  readonly laedt = this.store.listeLaedt;
  readonly fehler = this.store.listeFehler;
  readonly suche = signal('');

  readonly gruppen = computed(() => {
    const begriff = this.suche().trim().toLowerCase();
    return this.store
      .nachFahrzeug()
      .map((gruppe) => ({
        ...gruppe,
        behaelter: begriff
          ? gruppe.behaelter.filter(
              (eintrag) =>
                eintrag.bezeichnung.toLowerCase().includes(begriff) ||
                eintrag.fahrzeugBezeichnung.toLowerCase().includes(begriff) ||
                eintrag.fahrzeugFunkrufname.toLowerCase().includes(begriff),
            )
          : gruppe.behaelter,
      }))
      .filter((gruppe) => gruppe.behaelter.length > 0);
  });

  readonly anzahlBehaelter = computed(() => this.store.uebersicht().length);

  readonly nieGeprueft = computed(
    () => this.store.uebersicht().filter((eintrag) => eintrag.zuletztGeprueftAm === null).length,
  );

  ngOnInit(): void {
    void this.store.uebersichtLaden();
  }

  neuerBehaelter(): void {
    this.store.neuerBehaelter();
    void this.router.navigate(['/material/behaelter/neu']);
  }

  /**
   * Kurzer Befund des letzten Checks; bewusst ohne Ampel, es gibt noch keine
   * Fälligkeit. Leer, solange nie geprüft wurde: das steht bereits in der
   * Standspalte, und ein grünes „ohne Beanstandung" wäre dort schlicht falsch.
   */
  befund(eintrag: BehaelterUebersicht): string {
    if (eintrag.zuletztGeprueftAm === null) return '';
    const teile: string[] = [];
    if (eintrag.letzteFehlmengen) teile.push(`${eintrag.letzteFehlmengen} Fehlmengen`);
    if (eintrag.letzteUnbrauchbar) teile.push(`${eintrag.letzteUnbrauchbar} unbrauchbar`);
    if (eintrag.letzteAbgelaufen) teile.push(`${eintrag.letzteAbgelaufen} abgelaufen`);
    return teile.length ? teile.join(' · ') : 'ohne Beanstandung';
  }

  istBeanstandet(eintrag: BehaelterUebersicht): boolean {
    return Boolean(
      eintrag.letzteFehlmengen || eintrag.letzteUnbrauchbar || eintrag.letzteAbgelaufen,
    );
  }
}
