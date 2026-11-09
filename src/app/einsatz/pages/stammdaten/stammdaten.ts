import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Meldung } from '../../../kern/zustand/zustand';
import { ArtikelTabelle } from '../../components/artikel-tabelle/artikel-tabelle';
import { LagerListe } from '../../components/lager-liste/lager-liste';
import { Artikel, Lager } from '../../models/stammdaten.model';
import { StammdatenStoreService } from '../../services/stammdaten-store.service';

/**
 * Stammdaten der Einsatzplanung (`/verwaltung/einsatz-stammdaten`): Reiter „Lager“ (Reihenfolge =
 * Laufweg) und „Artikel“ (Katalog mit Heimatlager). Hält den Zustand im Store, die Reiter sind
 * rein darstellend. Rechte vorerst alle, Rollen später.
 */
@Component({
  selector: 'app-stammdaten',
  imports: [
    ArtikelTabelle,
    LagerListe,
    Ladeanzeige,
    Meldung,
    MatButtonModule,
    MatTabsModule,
    Seitenkopf,
  ],
  templateUrl: './stammdaten.html',
  styleUrl: './stammdaten.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Stammdaten implements OnInit {
  protected readonly store = inject(StammdatenStoreService);
  private readonly dialog = inject(DialogDienst);

  ngOnInit(): void {
    void this.store.laden();
  }

  protected lagerAnlegen(name: string): void {
    void this.store.lagerAnlegen(name);
  }

  protected lagerUmbenennen(ereignis: { lager: Lager; name: string }): void {
    void this.store.lagerUmbenennen(ereignis.lager, ereignis.name);
  }

  protected lagerVerschieben(ereignis: { von: number; nach: number }): void {
    void this.store.lagerVerschieben(ereignis.von, ereignis.nach);
  }

  protected async lagerLoeschen(lager: Lager): Promise<void> {
    const bestaetigt = await this.dialog.bestaetigen(
      `Das Lager „${lager.name}“ wird entfernt.`,
      'Lager löschen',
      'Löschen',
    );
    if (bestaetigt) await this.store.lagerLoeschen(lager);
  }

  protected async artikelLoeschen(artikel: Artikel): Promise<void> {
    const bestaetigt = await this.dialog.bestaetigen(
      `Der Artikel „${artikel.name}“ wird aus dem Katalog entfernt.`,
      'Artikel löschen',
      'Löschen',
    );
    if (bestaetigt) await this.store.artikelLoeschen(artikel);
  }
}
