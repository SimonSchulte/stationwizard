import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { AufgabenStoreService } from '../../../aufgaben/services/aufgaben-store.service';
import { Ablesungseinreichung } from '../../models/fahrzeug.model';
import {
  pruefeAblesungPlausibilitaet,
  type AblesungHinweis,
} from '../../services/ablesung-pruefung';
import { ApiEinreichungStorage } from '../../storage/api-einreichung-storage';
import {
  EinreichungNichtOffenFehler,
  FreigabeVerweigertFehler,
} from '../../storage/einreichung-storage';

const HINWEIS_TEXT: Readonly<Record<'rueckschritt' | 'unplausibler-sprung', string>> = {
  rueckschritt:
    'Der gemeldete Stand liegt unter dem bisher bekannten. Das kann an einem Zahlendreher liegen – oder an einem getauschten Tacho.',
  'unplausibler-sprung':
    'Der Sprung zum bisher bekannten Stand ist ungewöhnlich groß. Das kann an einer langen Erfassungslücke liegen – oder an einem Tippfehler.',
};

/**
 * Freigabe der über den öffentlichen QR-Code eingegangenen Kilometermeldungen.
 *
 * Liegt fachlich beim Fahrzeugmodul, hängt aber an einer Route des
 * Aufgabenbereichs – dasselbe Muster wie der Fahrzeugimport, der unter
 * `fahrzeuge/pages/` liegt und an einer Verwaltungsroute hängt.
 *
 * Die Rollenprüfung findet serverseitig statt; diese Seite zeigt nur, was der
 * Worker geliefert hat, und meldet ein fachliches 403 als solches statt als
 * abgelaufene Sitzung.
 */
@Component({
  selector: 'app-ablesung-freigabe',
  imports: [DatePipe, DecimalPipe, MatIconModule, RouterLink],
  templateUrl: './ablesung-freigabe.html',
  styleUrl: './ablesung-freigabe.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AblesungFreigabe {
  private readonly storage = inject(ApiEinreichungStorage);
  private readonly dialog = inject(DialogDienst);
  private readonly aufgaben = inject(AufgabenStoreService);

  readonly einreichungen = signal<readonly Ablesungseinreichung[]>([]);
  readonly laedt = signal(true);
  readonly ladeFehler = signal('');
  readonly meldung = signal('');
  readonly entscheidetGerade = signal<string | null>(null);

  /** Id der Meldung, für die gerade ein Ablehnungsgrund erfasst wird. */
  readonly lehntAb = signal<string | null>(null);
  readonly grund = signal('');

  readonly leer = computed(() => !this.laedt() && this.einreichungen().length === 0);

  /** Öffentlich, damit Tests auf das erste Laden warten können. */
  readonly bereit: Promise<void>;

  constructor() {
    this.bereit = this.laden();
  }

  hinweisFuer(einreichung: Ablesungseinreichung): AblesungHinweis {
    if (einreichung.letzterStand === null) return null;
    return pruefeAblesungPlausibilitaet(einreichung.stand, { stand: einreichung.letzterStand });
  }

  hinweisText(hinweis: Exclude<AblesungHinweis, null>): string {
    return HINWEIS_TEXT[hinweis];
  }

  differenz(einreichung: Ablesungseinreichung): number | null {
    return einreichung.letzterStand === null ? null : einreichung.stand - einreichung.letzterStand;
  }

  async laden(): Promise<void> {
    this.laedt.set(true);
    this.ladeFehler.set('');
    try {
      this.einreichungen.set(await this.storage.ladeOffene());
    } catch (ursache) {
      this.ladeFehler.set(
        ursache instanceof Error ? ursache.message : 'Die Meldungen konnten nicht geladen werden.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  async freigeben(einreichung: Ablesungseinreichung): Promise<void> {
    const hinweis = this.hinweisFuer(einreichung);
    if (hinweis) {
      const weiter = await this.dialog.bestaetigen(
        `${this.hinweisText(hinweis)}\n\nDen gemeldeten Stand von ${einreichung.stand.toLocaleString('de-DE')} km trotzdem als neuen Kilometerstand übernehmen?`,
        'Auffälligen Wert freigeben',
        'Trotzdem freigeben',
      );
      if (!weiter) return;
    }
    await this.entscheide(einreichung, () => this.storage.freigeben(einreichung.id), 'freigegeben');
  }

  ablehnenBeginnen(einreichung: Ablesungseinreichung): void {
    this.lehntAb.set(einreichung.id);
    this.grund.set('');
  }

  ablehnenAbbrechen(): void {
    this.lehntAb.set(null);
    this.grund.set('');
  }

  async ablehnenBestaetigen(einreichung: Ablesungseinreichung): Promise<void> {
    const grund = this.grund().trim();
    await this.entscheide(
      einreichung,
      () => this.storage.ablehnen(einreichung.id, grund),
      'abgelehnt',
    );
    this.ablehnenAbbrechen();
  }

  private async entscheide(
    einreichung: Ablesungseinreichung,
    aktion: () => Promise<void>,
    ergebnis: 'freigegeben' | 'abgelehnt',
  ): Promise<void> {
    this.entscheidetGerade.set(einreichung.id);
    this.meldung.set('');
    try {
      await aktion();
      this.entferne(einreichung.id);
      this.meldung.set(`Meldung ${ergebnis}.`);
    } catch (ursache) {
      if (ursache instanceof EinreichungNichtOffenFehler) {
        // Jemand war schneller. Die Meldung ist erledigt, nur nicht von hier.
        this.entferne(einreichung.id);
        this.meldung.set(ursache.message);
        return;
      }
      if (ursache instanceof FreigabeVerweigertFehler) {
        this.meldung.set(ursache.message);
        return;
      }
      this.meldung.set(
        ursache instanceof Error
          ? ursache.message
          : 'Die Entscheidung konnte nicht gespeichert werden.',
      );
    } finally {
      this.entscheidetGerade.set(null);
    }
  }

  private entferne(id: string): void {
    this.einreichungen.update((liste) => liste.filter((e) => e.id !== id));
    // Die Marke in der Kopfzeile zieht über dasselbe Signal nach.
    this.aufgaben.entferne(`fahrzeug-kilometermeldung:${id}`);
  }
}
