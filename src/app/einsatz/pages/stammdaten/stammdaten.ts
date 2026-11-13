import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Leerzustand, Meldung } from '../../../kern/zustand/zustand';
import { ArtikelTabelle } from '../../components/artikel-tabelle/artikel-tabelle';
import { LagerListe } from '../../components/lager-liste/lager-liste';
import { KisteEditor, KisteAenderung } from '../../components/kiste-editor/kiste-editor';
import { KisteListe } from '../../components/kiste-liste/kiste-liste';
import { Artikel, Kiste, Lager, Platz } from '../../models/stammdaten.model';
import { KistenDruckDienst } from '../../services/kisten-druck';
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
    KisteEditor,
    KisteListe,
    LagerListe,
    Ladeanzeige,
    Leerzustand,
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
  private readonly druck = inject(KistenDruckDienst);
  private readonly meldungen = inject(MeldungsDienst);

  /** Die in der Seite gewählte Kiste (nur Sitzungszustand). */
  protected readonly gewaehlteKisteId = signal<string | null>(null);
  protected readonly kisteUngespeichert = signal(false);
  protected readonly gewaehlteKiste = computed(
    () => this.store.kisten().find((k) => k.id === this.gewaehlteKisteId()) ?? null,
  );

  ngOnInit(): void {
    void this.store.laden();
  }

  /** Für den Route-Guard: der Editor einer Kiste hat ungespeicherte Änderungen. */
  hatUngespeichertes(): boolean {
    return this.kisteUngespeichert();
  }

  protected async kisteWaehlen(id: string): Promise<void> {
    if (id === this.gewaehlteKisteId()) return;
    if (this.kisteUngespeichert() && !(await this.aenderungenVerwerfen())) return;
    this.kisteUngespeichert.set(false);
    this.gewaehlteKisteId.set(id);
  }

  protected async kisteAnlegen(name: string): Promise<void> {
    if (this.kisteUngespeichert() && !(await this.aenderungenVerwerfen())) return;
    const neu = await this.store.kisteAnlegen(name);
    if (neu) {
      this.kisteUngespeichert.set(false);
      this.gewaehlteKisteId.set(neu.id);
    }
  }

  protected async kisteSpeichern(kiste: Kiste, aenderung: KisteAenderung): Promise<void> {
    await this.store.kisteSpeichern(kiste, aenderung);
  }

  protected async kisteLoeschen(kiste: Kiste): Promise<void> {
    const bestaetigt = await this.dialog.bestaetigen(
      `Die Kiste „${kiste.name}“ wird entfernt. Der Inhalt geht damit verloren.`,
      'Kiste löschen',
      'Löschen',
    );
    if (!bestaetigt) return;
    if (await this.store.kisteLoeschen(kiste)) {
      this.kisteUngespeichert.set(false);
      this.gewaehlteKisteId.set(null);
    }
  }

  /** Druckt den gespeicherten Stand der Kiste (der Editor sperrt den Druck bei Änderungen). */
  protected async kisteDrucken(art: 'schild' | 'zettel', kiste: Kiste): Promise<void> {
    const daten = { artikel: this.store.artikelNachId(), lager: this.store.lagerNachId() };
    try {
      if (art === 'schild') await this.druck.schildDrucken([kiste], daten);
      else await this.druck.zettelDrucken([kiste], daten);
    } catch {
      this.meldungen.fehler('Der Druck konnte nicht erstellt werden.');
    }
  }

  private aenderungenVerwerfen(): Promise<boolean> {
    return this.dialog.bestaetigen(
      'Die Kiste hat Änderungen, die noch nicht gespeichert sind. Sie gehen verloren.',
      'Ungespeicherte Änderungen',
      'Verwerfen',
    );
  }

  protected lagerAnlegen(name: string): void {
    void this.store.lagerAnlegen(name);
  }

  protected lagerUmbenennen(ereignis: { lager: Lager; name: string }): void {
    void this.store.lagerUmbenennen(ereignis.lager, ereignis.name);
  }

  protected lagerPlaetze(ereignis: { lager: Lager; plaetze: Platz[] }): void {
    void this.store.lagerPlaetzeSpeichern(ereignis.lager, ereignis.plaetze);
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
