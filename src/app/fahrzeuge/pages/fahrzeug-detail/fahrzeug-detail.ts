import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DatePipe } from '@angular/common';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { heuteIso } from '../../../kern/kalender/datum';
import { EIGENTUEMER, Fahrzeugstamm, Wartungstermin } from '../../models/fahrzeug.model';
import { EIGENTUEMER_LABEL } from '../../services/eigentuemer-label';
import { istGueltigeFin } from '../../services/fahrzeug-pruefung';
import { sollKmProJahr } from '../../services/kilometer-soll';
import { ermittleWartungsstatus, WartungsAmpel } from '../../services/wartungsstatus';
import { FahrzeugStoreService } from '../../services/fahrzeug-store.service';

function neuerWartungstermin(art: 'hu' | 'frei'): Wartungstermin {
  return {
    id: crypto.randomUUID(),
    art,
    bezeichnung: art === 'hu' ? 'Hauptuntersuchung' : '',
    faelligAm: heuteIso(),
    erinnerungTage: 30,
    erledigtAm: null,
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fahrzeug-detail',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatToolbarModule,
  ],
  templateUrl: './fahrzeug-detail.html',
  styleUrl: './fahrzeug-detail.less',
})
export class FahrzeugDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);
  readonly store = inject(FahrzeugStoreService);

  readonly EIGENTUEMER = EIGENTUEMER;
  readonly EIGENTUEMER_LABEL = EIGENTUEMER_LABEL;
  readonly heute = heuteIso();

  /** Reagiert auf einen Wechsel des Routenparameters, falls die Detailseite wiederverwendet wird. */
  private readonly routenId = toSignal(
    this.route.paramMap.pipe(
      map((paramMap) => paramMap.get('id')),
      distinctUntilChanged(),
    ),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  readonly istFin = computed(() => {
    const fin = this.store.entwurf()?.fahrgestellnummer;
    return !fin || istGueltigeFin(fin);
  });

  readonly jahressoll = computed(() => {
    const eigentuemer = this.store.entwurf()?.eigentuemer;
    return eigentuemer ? sollKmProJahr(eigentuemer) : null;
  });

  readonly kannSpeichern = computed(() => {
    const entwurf = this.store.entwurf();
    return (
      !!entwurf &&
      entwurf.bezeichnung.trim().length > 0 &&
      entwurf.kennzeichen.trim().length > 0 &&
      this.istFin() &&
      !this.store.speichertGerade()
    );
  });

  constructor() {
    effect(() => {
      const id = this.routenId();
      if (id === 'neu' || id === null) {
        this.store.neuesFahrzeugBeginnen();
      } else {
        void this.store.fahrzeugLaden(id);
      }
    });
  }

  aktualisieren<K extends keyof Fahrzeugstamm>(feld: K, wert: Fahrzeugstamm[K]): void {
    this.store.entwurfAktualisieren({ [feld]: wert } as Partial<Fahrzeugstamm>);
  }

  wartungAktualisieren(id: string, patch: Partial<Wartungstermin>): void {
    const liste = this.store.entwurf()?.wartungstermine ?? [];
    this.store.wartungstermineAktualisieren(
      liste.map((termin) => (termin.id === id ? { ...termin, ...patch } : termin)),
    );
  }

  wartungVorlaufAktualisieren(id: string, wert: string): void {
    const erinnerungTage = Number(wert);
    this.wartungAktualisieren(id, {
      erinnerungTage: Number.isFinite(erinnerungTage) && erinnerungTage >= 0 ? erinnerungTage : 0,
    });
  }

  wartungAlsErledigtMarkieren(id: string, erledigt: boolean): void {
    this.wartungAktualisieren(id, { erledigtAm: erledigt ? heuteIso() : null });
  }

  wartungEntfernen(id: string): void {
    const liste = this.store.entwurf()?.wartungstermine ?? [];
    this.store.wartungstermineAktualisieren(liste.filter((termin) => termin.id !== id));
  }

  wartungHinzufuegen(art: 'hu' | 'frei'): void {
    const liste = this.store.entwurf()?.wartungstermine ?? [];
    this.store.wartungstermineAktualisieren([...liste, neuerWartungstermin(art)]);
  }

  wartungAmpel(termin: Wartungstermin): WartungsAmpel {
    return ermittleWartungsstatus(termin, this.heute).ampel;
  }

  hatOffeneHu(): boolean {
    return (this.store.entwurf()?.wartungstermine ?? []).some(
      (t) => t.art === 'hu' && t.erledigtAm === null,
    );
  }

  async speichern(): Promise<void> {
    const warNeu = this.store.istNeu();
    const erfolg = await this.store.speichern();
    if (erfolg && warNeu) {
      const id = this.store.entwurf()?.id;
      if (id) await this.router.navigate(['/fahrzeuge', id], { replaceUrl: true });
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
}
