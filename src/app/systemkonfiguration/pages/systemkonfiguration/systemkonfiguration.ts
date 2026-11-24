import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { BenutzerverwaltungStoreService } from '../../../benutzerverwaltung/services/benutzerverwaltung-store.service';
import {
  Einstellungen,
  MATERIAL_ROLLEN,
  VORGANG_ROLLEN,
  ORGANISATION_ROLLEN,
  VERSANDWEGE,
  VERSANDWEG_HINWEIS,
  VERSANDWEG_LABEL,
  Versandweg,
} from '../../models/systemkonfiguration.model';
import { SystemkonfigurationStoreService } from '../../services/systemkonfiguration-store.service';
import { dateiHerunterladen } from '../../../kern/storage/datei-storage';
import {
  baueKontakte,
  kontakteAlsCsv,
  kontakteAlsVcard,
} from '../../../vorgaenge/services/postfach-kontakte';
import { PostfachStoreService } from '../../../vorgaenge/services/postfach-store.service';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Ladeanzeige, Meldung } from '../../../kern/zustand/zustand';

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
    Meldung,
    Ladeanzeige,
    Seitenkopf,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
  ],
  templateUrl: './systemkonfiguration.html',
  styleUrl: './systemkonfiguration.less',
})
export class Systemkonfiguration implements OnInit {
  private readonly store = inject(SystemkonfigurationStoreService);
  private readonly benutzerStore = inject(BenutzerverwaltungStoreService);
  private readonly postfach = inject(PostfachStoreService);
  private readonly meldungen = inject(MeldungsDienst);

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

  /** Reine Einblendregel wie oben; gesperrt wird serverseitig. */
  readonly darfOrganisationAendern = computed(() =>
    ORGANISATION_ROLLEN.includes(this.benutzerStore.eigeneRolle() ?? ''),
  );

  /** Reine Einblendregel wie oben; gesperrt wird serverseitig. */
  readonly darfVorgangAendern = computed(() =>
    VORGANG_ROLLEN.includes(this.benutzerStore.eigeneRolle() ?? ''),
  );

  ngOnInit(): void {
    void this.store.laden();
    void this.benutzerStore.listeLaden();
    void this.postfach.adressenLaden();
  }

  /** Erst anbietbar, wenn die Adressen geladen sind. */
  readonly kontakteBereit = computed(() => this.postfach.adressen() !== null);

  /** Alle Postfachadressen als Kontakte zum Import in Outlook & Co. */
  kontakteHerunterladen(format: 'csv' | 'vcf'): void {
    const adressen = this.postfach.adressen();
    if (!adressen) {
      this.meldungen.warnung('Die Adressen sind noch nicht geladen.');
      return;
    }
    const kontakte = baueKontakte(adressen);
    if (format === 'csv') {
      dateiHerunterladen(
        kontakteAlsCsv(kontakte),
        'postfach-kontakte.csv',
        'text/csv;charset=utf-8',
      );
    } else {
      dateiHerunterladen(
        kontakteAlsVcard(kontakte),
        'postfach-kontakte.vcf',
        'text/vcard;charset=utf-8',
      );
    }
  }

  organisationAendern(
    feld: 'organisationLandesverband' | 'organisationRegionalverband',
    wert: string,
  ): void {
    this.store.entwurfAendern({ [feld]: wert });
  }

  vorgangAendern(
    feld: 'vorgangEinheit' | 'vorgangEmpfaenger' | 'vorgangBetreff',
    wert: string,
  ): void {
    this.store.entwurfAendern({ [feld]: wert });
  }

  vorgangVersandwegAendern(wert: Versandweg): void {
    this.store.entwurfAendern({ vorgangVersandweg: wert });
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

  ampelGelbAendern(wert: number): void {
    this.store.entwurfAendern({ kmAmpelSchwellenwertGelbMonate: wert });
  }

  ampelRotAendern(wert: number): void {
    this.store.entwurfAendern({ kmAmpelSchwellenwertRotMonate: wert });
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
