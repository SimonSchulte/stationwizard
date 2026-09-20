import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import {
  PREISKATALOG_ARTEN,
  PreiskatalogArt,
  PreiskatalogEintrag,
} from '../../models/preiskatalog.model';
import { PreiskatalogStoreService } from '../../services/preiskatalog-store.service';
import { centZuEuroEingabe, euroEingabeZuCent } from '../../services/waehrung';

const PREISKATALOG_ART_LABEL: Readonly<Record<PreiskatalogArt, string>> = {
  einsatzkraft: 'Einsatzkraft (je Stunde)',
  fahrzeug: 'Fahrzeug (Pauschale je Schicht)',
};

function neuerEintragEingabe(): {
  id: string;
  bezeichnung: string;
  art: PreiskatalogArt;
  einzelpreisCent: number;
} {
  return {
    id: crypto.randomUUID(),
    bezeichnung: 'Neuer Eintrag',
    art: 'einsatzkraft',
    einzelpreisCent: 0,
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-preiskatalog',
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatToolbarModule,
  ],
  templateUrl: './preiskatalog.html',
  styleUrl: './preiskatalog.less',
})
export class Preiskatalog implements OnInit {
  private readonly dialogDienst = inject(DialogDienst);
  readonly store = inject(PreiskatalogStoreService);

  readonly PREISKATALOG_ARTEN = PREISKATALOG_ARTEN;
  readonly PREISKATALOG_ART_LABEL = PREISKATALOG_ART_LABEL;
  readonly centZuEuroEingabe = centZuEuroEingabe;

  ngOnInit(): void {
    void this.store.laden();
  }

  async neuerEintrag(): Promise<void> {
    await this.store.eintragSpeichern(neuerEintragEingabe(), null);
  }

  async bezeichnungAktualisieren(eintrag: PreiskatalogEintrag, wert: string): Promise<void> {
    const bezeichnung = wert.trim();
    if (!bezeichnung || bezeichnung === eintrag.bezeichnung) return;
    await this.speichern(eintrag, { bezeichnung });
  }

  async artAktualisieren(eintrag: PreiskatalogEintrag, wert: PreiskatalogArt): Promise<void> {
    if (wert === eintrag.art) return;
    await this.speichern(eintrag, { art: wert });
  }

  async preisAktualisieren(eintrag: PreiskatalogEintrag, wert: string): Promise<void> {
    const einzelpreisCent = euroEingabeZuCent(wert);
    if (einzelpreisCent === null || einzelpreisCent === eintrag.einzelpreisCent) return;
    await this.speichern(eintrag, { einzelpreisCent });
  }

  async eintragLoeschen(eintrag: PreiskatalogEintrag): Promise<void> {
    const bestaetigt = await this.dialogDienst.bestaetigen(
      `„${eintrag.bezeichnung}" wird endgültig aus dem Preiskatalog entfernt. Bereits gespeicherte Angebote sind davon nicht betroffen.`,
      'Eintrag löschen',
      'Endgültig löschen',
    );
    if (!bestaetigt) return;
    await this.store.eintragLoeschen(eintrag.id);
  }

  private async speichern(
    eintrag: PreiskatalogEintrag,
    patch: Partial<Pick<PreiskatalogEintrag, 'bezeichnung' | 'art' | 'einzelpreisCent'>>,
  ): Promise<void> {
    await this.store.eintragSpeichern(
      {
        id: eintrag.id,
        bezeichnung: eintrag.bezeichnung,
        art: eintrag.art,
        einzelpreisCent: eintrag.einzelpreisCent,
        ...patch,
      },
      eintrag.version,
    );
  }
}
