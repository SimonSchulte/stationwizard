import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { formatiereDatum } from '../../../kern/kalender/datum';
import type { HiorgEintrag } from '../../models/hiorg-kalender.model';
import type { Termin } from '../../models/plan.model';
import type { HiorgAbweichung } from '../../services/hiorg-abgleich';
import type { TagesKarte } from '../../services/tages-inhalt';
import { HiorgEintragKarte } from '../hiorg-eintrag-karte/hiorg-eintrag-karte';
import { TerminKarte } from '../termin-karte/termin-karte';

export interface TagDetailDaten {
  readonly datum: string;
  /** Der vollständige Tag: Plantermine und HiOrg-Einträge, ungekürzt. */
  readonly karten: readonly TagesKarte[];
  readonly feiertag: string | null;
}

/**
 * Was der Dialog dem Jahresplan als Auftrag zurückgibt. Der Dialog führt selbst
 * nichts aus: Alle Planänderungen laufen weiter über den Store im Jahresplan,
 * damit Rückgängig, Bestätigungen und Meldungen an einer Stelle bleiben.
 */
export type TagDetailErgebnis =
  | { readonly art: 'bearbeiten'; readonly terminId: string }
  | { readonly art: 'zuBacklog'; readonly termin: Termin }
  | { readonly art: 'loeschen'; readonly terminId: string }
  | { readonly art: 'anlegen'; readonly datum: string }
  | { readonly art: 'nameUebernehmen'; readonly abweichung: HiorgAbweichung }
  | { readonly art: 'terminAusHiorg'; readonly eintrag: HiorgEintrag };

/**
 * Der ganze Tag in voller Kartenbreite.
 *
 * Gegenstück zur Deckelung im Wochenraster: Dort zeigt eine Tageszelle höchstens
 * ein paar Karten, hier steht alles – ohne Sammelkarte und ohne „+N weitere".
 */
@Component({
  selector: 'app-tag-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HiorgEintragKarte,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatTooltipModule,
    TerminKarte,
  ],
  templateUrl: './tag-detail.html',
  styleUrl: './tag-detail.less',
})
export class TagDetail {
  readonly daten = inject<TagDetailDaten>(MAT_DIALOG_DATA);
  /** Jede Aktion schließt den Dialog und reicht den Auftrag an den Jahresplan zurück. */
  readonly schliesse = inject<MatDialogRef<TagDetail, TagDetailErgebnis>>(MatDialogRef);

  readonly titel = computed(() => formatiereDatum(this.daten.datum));
  readonly termine = computed(() => this.daten.karten.filter((k) => k.art === 'termin'));
  readonly hiorgEintraege = computed(() => this.daten.karten.filter((k) => k.art === 'hiorg'));
}
