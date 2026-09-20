import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DatePipe } from '@angular/common';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { heuteIso } from '../../../kern/kalender/datum';
import { AngebotKalkulationstabelle } from '../../components/angebot-kalkulationstabelle/angebot-kalkulationstabelle';
import { SchichtEditor } from '../../components/schicht-editor/schicht-editor';
import { Angebot, Schicht } from '../../models/angebot.model';
import {
  angebotAlsHtmlTabelle,
  angebotAlsKlartextTabelle,
} from '../../services/angebot-word-export';
import { AngebotStoreService } from '../../services/angebot-store.service';
import { PreiskatalogStoreService } from '../../services/preiskatalog-store.service';
import { TabellenZwischenablageService } from '../../services/tabellen-zwischenablage';
import { centZuEuroEingabe, euroEingabeZuCent } from '../../services/waehrung';

function neueSchicht(): Schicht {
  return { id: crypto.randomUUID(), datum: heuteIso(), von: '08:00', bis: '20:00', positionen: [] };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-angebot-detail',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatToolbarModule,
    AngebotKalkulationstabelle,
    SchichtEditor,
  ],
  templateUrl: './angebot-detail.html',
  styleUrl: './angebot-detail.less',
})
export class AngebotDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);
  private readonly zwischenablage = inject(TabellenZwischenablageService);
  readonly store = inject(AngebotStoreService);
  readonly preiskatalogStore = inject(PreiskatalogStoreService);

  readonly centZuEuroEingabe = centZuEuroEingabe;

  private readonly routenId = toSignal(
    this.route.paramMap.pipe(
      map((paramMap) => paramMap.get('id')),
      distinctUntilChanged(),
    ),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  constructor() {
    void this.preiskatalogStore.laden();
    effect(() => {
      const id = this.routenId();
      if (id === 'neu' || id === null) {
        this.store.neuesAngebotBeginnen();
      } else {
        void this.store.angebotLaden(id);
      }
    });
  }

  aktualisieren<K extends keyof Angebot>(feld: K, wert: Angebot[K]): void {
    this.store.entwurfAktualisieren({ [feld]: wert } as Partial<Angebot>);
  }

  schichtHinzufuegen(): void {
    const schichten = this.store.entwurf()?.schichten ?? [];
    this.store.schichtenAktualisieren([...schichten, neueSchicht()]);
  }

  schichtAktualisieren(geaendert: Schicht): void {
    const schichten = this.store.entwurf()?.schichten ?? [];
    this.store.schichtenAktualisieren(
      schichten.map((schicht) => (schicht.id === geaendert.id ? geaendert : schicht)),
    );
  }

  schichtEntfernen(id: string): void {
    const schichten = this.store.entwurf()?.schichten ?? [];
    this.store.schichtenAktualisieren(schichten.filter((schicht) => schicht.id !== id));
  }

  pauschalpreisAktivAktualisieren(aktiv: boolean): void {
    const entwurf = this.store.entwurf();
    this.store.entwurfAktualisieren({
      pauschalpreisAktiv: aktiv,
      pauschalpreisCent: aktiv
        ? (entwurf?.pauschalpreisCent ?? 0)
        : (entwurf?.pauschalpreisCent ?? null),
    });
  }

  pauschalpreisAktualisieren(wert: string): void {
    const cent = euroEingabeZuCent(wert);
    if (cent === null) return;
    this.aktualisieren('pauschalpreisCent', cent);
  }

  async speichern(): Promise<void> {
    const warNeu = this.store.istNeu();
    const erfolg = await this.store.speichern();
    if (erfolg && warNeu) {
      const id = this.store.entwurf()?.id;
      if (id) await this.router.navigate(['/angebotswesen/angebote', id], { replaceUrl: true });
    }
  }

  async nachKonfliktNeuLaden(): Promise<void> {
    const id = this.store.entwurf()?.id;
    if (!id) return;
    if (
      !(await this.dialogDienst.bestaetigen(
        'Die lokalen Änderungen gehen dabei verloren. Zum Sichern zuerst die Angaben notieren.',
        'Aktuellen Stand laden',
        'Verwerfen und laden',
      ))
    )
      return;
    await this.store.neuLadenNachKonflikt(id);
  }

  async tabelleKopieren(): Promise<void> {
    const entwurf = this.store.entwurf();
    if (!entwurf) return;
    await this.zwischenablage.kopieren(
      angebotAlsHtmlTabelle(entwurf),
      angebotAlsKlartextTabelle(entwurf),
    );
  }
}
