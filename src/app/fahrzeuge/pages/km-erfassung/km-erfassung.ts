import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { heuteIso } from '../../../kern/kalender/datum';
import { KilometerQuelle, Fahrzeugstamm } from '../../models/fahrzeug.model';
import { AblesungStoreService } from '../../services/ablesung-store.service';
import { AblesungHinweis, pruefeAblesungPlausibilitaet } from '../../services/ablesung-pruefung';
import { ApiFahrzeugStorage } from '../../storage/api-fahrzeug-storage';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-km-erfassung',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './km-erfassung.html',
  styleUrl: './km-erfassung.less',
})
export class KmErfassung {
  private readonly route = inject(ActivatedRoute);
  private readonly storage = inject(ApiFahrzeugStorage);
  readonly ablesungStore = inject(AblesungStoreService);

  private readonly fahrzeugId = this.route.snapshot.paramMap.get('id') ?? '';
  private readonly quelle: KilometerQuelle =
    this.route.snapshot.queryParamMap.get('quelle') === 'qr' ? 'qr' : 'formular';

  readonly fahrzeug = signal<Fahrzeugstamm | null>(null);
  readonly ladeFehler = signal('');
  readonly ladeLaeuft = signal(true);

  readonly stand = signal('');
  readonly abgelesenAm = signal(heuteIso());
  readonly bemerkung = signal('');
  readonly erfolgreichErfasst = signal(false);

  readonly standZahl = computed<number | null>(() => {
    const wert = Number(this.stand());
    return this.stand().trim() !== '' && Number.isFinite(wert) && wert >= 0 ? wert : null;
  });

  readonly hinweis = computed<AblesungHinweis>(() => {
    const wert = this.standZahl();
    if (wert === null) return null;
    const letzte = this.ablesungStore.letzteAblesung();
    return pruefeAblesungPlausibilitaet(wert, letzte ? { stand: letzte.stand } : null);
  });

  /** Öffentlich, damit Tests deterministisch auf den Ladevorgang warten können. */
  readonly bereit: Promise<void>;

  constructor() {
    this.bereit = this.laden();
  }

  private async laden(): Promise<void> {
    this.ladeLaeuft.set(true);
    this.ladeFehler.set('');
    try {
      const [ergebnis] = await Promise.all([
        this.storage.ladeFahrzeug(this.fahrzeugId),
        this.ablesungStore.laden(this.fahrzeugId),
      ]);
      if (!ergebnis) {
        this.ladeFehler.set('Fahrzeug nicht gefunden.');
        return;
      }
      this.fahrzeug.set(ergebnis.daten);
    } catch (fehler) {
      this.ladeFehler.set(
        fehler instanceof Error ? fehler.message : 'Fahrzeug konnte nicht geladen werden.',
      );
    } finally {
      this.ladeLaeuft.set(false);
    }
  }

  async speichern(): Promise<void> {
    const stand = this.standZahl();
    if (stand === null) return;
    const erfolg = await this.ablesungStore.erfassen({
      fahrzeugId: this.fahrzeugId,
      abgelesenAm: this.abgelesenAm(),
      stand,
      quelle: this.quelle,
      korrigiert: null,
      bemerkung: this.bemerkung(),
    });
    if (erfolg) {
      this.erfolgreichErfasst.set(true);
      this.stand.set('');
      this.bemerkung.set('');
      this.abgelesenAm.set(heuteIso());
    }
  }

  weitereErfassung(): void {
    this.erfolgreichErfasst.set(false);
  }
}
