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
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { PruefvorlageKopf } from '../../models/pruefvorlage.model';
import { PruefvorlageStoreService } from '../../services/pruefvorlage-store.service';

/**
 * Pflege der Prüfvorlagen. Liegt beim Fachmodul, ist aber über den
 * Verwaltungsbereich erreichbar – wie der Fahrzeug-Stammdatenimport.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vorlage-liste',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatToolbarModule],
  templateUrl: './vorlage-liste.html',
  styleUrl: './vorlage-liste.less',
})
export class VorlageListe implements OnInit {
  private readonly store = inject(PruefvorlageStoreService);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);

  readonly laedt = this.store.listeLaedt;
  readonly fehler = this.store.listeFehler;
  readonly loeschtId = this.store.loeschtId;
  readonly loeschFehler = this.store.loeschFehler;
  readonly suche = signal('');

  readonly gefiltert = computed(() => {
    const begriff = this.suche().trim().toLowerCase();
    const koepfe = this.store.koepfe();
    if (!begriff) return koepfe;
    return koepfe.filter((kopf) => kopf.bezeichnung.toLowerCase().includes(begriff));
  });

  ngOnInit(): void {
    void this.store.listeLaden();
  }

  neueVorlage(): void {
    this.store.neueVorlage();
    void this.router.navigate(['/material/vorlagen/neu']);
  }

  async vorlageLoeschen(kopf: PruefvorlageKopf): Promise<void> {
    const bestaetigt = await this.dialogDienst.bestaetigen(
      `„${kopf.bezeichnung}" wird mit allen ${kopf.anzahlArtikel} Artikeln endgültig gelöscht. ` +
        'Bereits durchgeführte Checks bleiben unverändert erhalten, weil sie ihre eigene ' +
        'Momentaufnahme der Liste tragen.',
      'Prüfvorlage löschen',
      'Endgültig löschen',
    );
    if (!bestaetigt) return;
    await this.store.vorlageLoeschen(kopf.id);
  }
}
