import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Checkposition } from '../../models/check.model';
import { CheckEinreichung } from '../../models/einreichung.model';
import { HERKUNFT_LABEL } from '../../models/pruefvorlage.model';
import { artikelVerfallsstatus, heuteBerlin } from '../../services/check-status';
import { EinreichungStoreService } from '../../services/einreichung-store.service';

/**
 * Freigabe öffentlich eingereichter Fahrzeugchecks.
 *
 * Mehrere auf einmal freigeben ist der Regelfall; abgelehnt wird einzeln und
 * mit Grund – eine Sammelablehnung ohne individuelle Begründung wäre keine
 * Entscheidung.
 *
 * Aufgeklappt werden nur die **Abweichungen** einer Meldung. Hundert Zeilen
 * „in Ordnung" je Karte wären unbrauchbar.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-check-freigabe',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatIconModule,
    MatToolbarModule,
  ],
  templateUrl: './check-freigabe.html',
  styleUrl: './check-freigabe.less',
})
export class CheckFreigabe implements OnInit {
  readonly store = inject(EinreichungStoreService);
  private readonly dialogDienst = inject(DialogDienst);

  readonly offene = this.store.offene;
  readonly laedt = this.store.laedt;
  readonly fehler = this.store.fehler;
  readonly meldung = this.store.meldung;
  readonly arbeitet = this.store.arbeitet;
  readonly herkunftLabel = HERKUNFT_LABEL;

  private readonly heute = heuteBerlin();
  readonly aufgeklappt = signal<ReadonlySet<string>>(new Set());

  /** Id der Meldung, für die gerade ein Ablehnungsgrund eingegeben wird. */
  readonly ablehnungFuer = signal<string | null>(null);
  readonly ablehnungsgrund = signal('');

  readonly anzahlAusgewaehlt = this.store.anzahlAusgewaehlt;
  readonly alleAusgewaehlt = this.store.alleAusgewaehlt;

  readonly hatAuswahl = computed(() => this.anzahlAusgewaehlt() > 0);

  ngOnInit(): void {
    void this.store.laden();
  }

  istAusgewaehlt(id: string): boolean {
    return this.store.ausgewaehlt().has(id);
  }

  befunde(eintrag: CheckEinreichung): string {
    const teile: string[] = [];
    if (eintrag.fehlmengen) teile.push(`${eintrag.fehlmengen} Fehlmengen`);
    if (eintrag.unbrauchbar) teile.push(`${eintrag.unbrauchbar} unbrauchbar`);
    if (eintrag.abgelaufen) teile.push(`${eintrag.abgelaufen} abgelaufen`);
    return teile.length ? teile.join(' · ') : 'ohne Beanstandung';
  }

  istBeanstandet(eintrag: CheckEinreichung): boolean {
    return Boolean(eintrag.fehlmengen || eintrag.unbrauchbar || eintrag.abgelaufen);
  }

  async aufklappen(id: string): Promise<void> {
    const naechste = new Set(this.aufgeklappt());
    naechste.add(id);
    this.aufgeklappt.set(naechste);
    await this.store.detailLaden(id);
  }

  zuklappen(id: string): void {
    const naechste = new Set(this.aufgeklappt());
    naechste.delete(id);
    this.aufgeklappt.set(naechste);
  }

  /** Nur das, was von der Soll-Liste abweicht. */
  abweichungen(id: string): Checkposition[] {
    const detail = this.store.details()[id];
    if (!detail) return [];
    return detail.positionen.filter((position) => {
      if (position.istMenge < position.sollMenge || position.unbrauchbar || !position.geprueft) {
        return true;
      }
      if (!detail.verfallsdatumErfasst || !position.verfallsdatumPflicht) return false;
      const status = artikelVerfallsstatus(position.verfallsdaten, this.heute);
      return status === 'abgelaufen' || status === 'laeuft-ab';
    });
  }

  befundEinerPosition(position: Checkposition): string {
    const teile: string[] = [];
    if (!position.geprueft) teile.push('nicht geprüft');
    const fehlt = position.sollMenge - position.istMenge;
    if (fehlt > 0) teile.push(`${fehlt} fehlen (${position.istMenge} von ${position.sollMenge})`);
    if (position.unbrauchbar) teile.push('unbrauchbar');
    const status = artikelVerfallsstatus(position.verfallsdaten, this.heute);
    if (status === 'abgelaufen') teile.push('Verfallsdatum abgelaufen');
    else if (status === 'laeuft-ab') teile.push('Verfallsdatum läuft bald ab');
    return teile.join(' · ');
  }

  async freigeben(): Promise<void> {
    const anzahl = this.anzahlAusgewaehlt();
    const bestaetigt = await this.dialogDienst.bestaetigen(
      anzahl === 1
        ? 'Die ausgewählte Meldung wird zu einem gültigen Check. Als erfassende Person werden ' +
            'dabei Sie eingetragen; der selbst angegebene Name der meldenden Person bleibt ' +
            'daneben erhalten.'
        : `${anzahl} Meldungen werden zu gültigen Checks. Als erfassende Person werden dabei ` +
            'Sie eingetragen; die selbst angegebenen Namen bleiben daneben erhalten.',
      'Prüfungen freigeben',
      'Freigeben',
    );
    if (!bestaetigt) return;
    await this.store.freigeben();
  }

  /** Öffnet das Grundfeld; abgelehnt wird erst mit einer echten Begründung. */
  ablehnungBeginnen(id: string): void {
    this.ablehnungFuer.set(id);
    this.ablehnungsgrund.set('');
  }

  ablehnungAbbrechen(): void {
    this.ablehnungFuer.set(null);
    this.ablehnungsgrund.set('');
  }

  async ablehnungBestaetigen(eintrag: CheckEinreichung): Promise<void> {
    const grund = this.ablehnungsgrund().trim();
    if (grund === '') return;
    const bestaetigt = await this.dialogDienst.bestaetigen(
      `Die Meldung zu „${eintrag.behaelterBezeichnung}" von ${eintrag.eingereichtVonName} wird ` +
        'verworfen. Sie wird dadurch nie ein Check.',
      'Meldung ablehnen',
      'Ablehnen',
    );
    if (!bestaetigt) return;
    if (await this.store.ablehnen(eintrag.id, grund)) this.ablehnungAbbrechen();
  }
}
