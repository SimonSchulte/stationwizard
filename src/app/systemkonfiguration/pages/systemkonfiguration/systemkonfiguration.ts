import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { BenutzerverwaltungStoreService } from '../../../benutzerverwaltung/services/benutzerverwaltung-store.service';
import {
  Einstellungen,
  MATERIAL_ROLLEN,
  VERSANDWEGE,
  VERSANDWEG_HINWEIS,
  VERSANDWEG_LABEL,
  Versandweg,
} from '../../models/systemkonfiguration.model';
import { SystemkonfigurationStoreService } from '../../services/systemkonfiguration-store.service';

/**
 * Systemkonfiguration: einziger Ort, an dem Betriebseinstellungen gesetzt
 * werden, aufgeteilt in ein Menü je Themenbereich (aktuell nur „Email
 * Versand"). Vorschau und Versand des Kilometerstandsberichts selbst laufen
 * im Fahrzeugmodul, Reiter „Kilometerübersicht" – hier steht nur noch, wohin
 * und worüber gesendet wird.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-systemkonfiguration',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatToolbarModule,
  ],
  templateUrl: './systemkonfiguration.html',
  styleUrl: './systemkonfiguration.less',
})
export class Systemkonfiguration implements OnInit {
  private readonly store = inject(SystemkonfigurationStoreService);
  private readonly benutzerStore = inject(BenutzerverwaltungStoreService);

  readonly versandwege = VERSANDWEGE;
  readonly versandwegLabel = VERSANDWEG_LABEL;
  readonly versandwegHinweis = VERSANDWEG_HINWEIS;

  readonly entwurf = this.store.entwurf;
  readonly laedt = this.store.laedt;
  readonly ladeFehler = this.store.ladeFehler;
  readonly speichert = this.store.speichert;
  readonly speicherFehler = this.store.speicherFehler;
  readonly gespeichert = this.store.gespeichert;
  readonly ungespeichert = this.store.ungespeichert;

  /**
   * Reine Einblendregel: gesperrt wird serverseitig. Die Rolle steht erst
   * fest, wenn die Benutzerliste geladen ist – vorher gilt "nicht erlaubt",
   * damit die Felder nicht kurz bedienbar wirken.
   */
  readonly darfMaterialAendern = computed(() =>
    MATERIAL_ROLLEN.includes(this.benutzerStore.eigeneRolle() ?? ''),
  );

  ngOnInit(): void {
    void this.store.laden();
    void this.benutzerStore.listeLaden();
  }

  materialAendern(feld: keyof Einstellungen, wert: string): void {
    this.store.entwurfAendern({ [feld]: wert });
  }

  materialVersandwegAendern(wert: Versandweg): void {
    this.store.entwurfAendern({ materialVersandweg: wert });
  }

  empfaengerAendern(wert: string): void {
    this.store.entwurfAendern({ kmBerichtEmpfaenger: wert });
  }

  betreffAendern(wert: string): void {
    this.store.entwurfAendern({ kmBerichtBetreff: wert });
  }

  versandwegAendern(wert: Versandweg): void {
    this.store.entwurfAendern({ kmBerichtVersandweg: wert });
  }

  istVerfuegbar(weg: Versandweg): boolean {
    return this.store.istVerfuegbar(weg);
  }

  speichern(): void {
    void this.store.speichern();
  }

  verwerfen(): void {
    this.store.entwurfVerwerfen();
  }
}
