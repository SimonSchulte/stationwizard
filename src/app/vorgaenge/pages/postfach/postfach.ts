import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Seitenkopf } from '../../../kern/seitenkopf/seitenkopf';
import { Leerzustand } from '../../../kern/zustand/leerzustand';
import { Ladeanzeige, Meldung } from '../../../kern/zustand/zustand';
import { MeldungsDienst } from '../../../kern/zustand/meldungs-dienst';
import { ANGEBOT_GROESSE_MAX, PostfachMail, istAngebotsdatei } from '../../models/postfach.model';
import { STUFE_EINGEREICHT, VORGANG_STUFEN } from '../../models/vorgang.model';
import { GelesenerAnhang, GelesenerMail, leseMail, notizVon } from '../../services/mail-leser';
import { PostfachStoreService } from '../../services/postfach-store.service';
import { vorgangFehlertext, VorgangStoreService } from '../../services/vorgang-store.service';
import { ApiVorgangStorage } from '../../storage/api-vorgang-storage';

/**
 * Das gemeinsame Postfach für Angebote: Mails ansehen und dem Vorgang „Fahrzeug/Material defekt“
 * zuordnen. Die Rohmail wird im Browser gelesen; nach der Zuordnung löscht der Worker sie, die
 * gewählten Anhänge bleiben als Angebote (mit Notiz zur Mail) am Vorgang.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-postfach',
  imports: [
    DatePipe,
    Ladeanzeige,
    Leerzustand,
    Meldung,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    Seitenkopf,
  ],
  templateUrl: './postfach.html',
  styleUrl: './postfach.less',
})
export class Postfach implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly meldungen = inject(MeldungsDienst);
  private readonly dialog = inject(DialogDienst);
  private readonly vorgangApi = inject(ApiVorgangStorage);
  readonly store = inject(PostfachStoreService);
  readonly vorgaenge = inject(VorgangStoreService);

  readonly angebotMax = ANGEBOT_GROESSE_MAX;
  readonly STUFEN = VORGANG_STUFEN;

  private readonly vorgabe = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('vorgang') ?? '')),
    {
      initialValue: this.route.snapshot.queryParamMap.get('vorgang') ?? '',
    },
  );

  readonly gewaehltId = signal<string | null>(null);
  readonly gewaehlt = computed<PostfachMail | null>(
    () =>
      this.store.mails().find((m) => m.id === this.gewaehltId()) ?? this.store.mails()[0] ?? null,
  );

  readonly vorschau = signal<GelesenerMail | null>(null);
  readonly vorschauLaedt = signal(false);
  readonly vorschauFehler = signal('');
  readonly angehakt = signal<ReadonlySet<number>>(new Set());
  readonly zielVorgang = signal('');
  readonly arbeitet = signal(false);

  /** Vorgänge, an die sich noch Angebote hängen lassen: bis zum Einreichen. */
  readonly ziele = computed(() =>
    this.vorgaenge
      .liste()
      .filter((v) => v.stufe < STUFE_EINGEREICHT)
      .map((v) => ({
        id: v.id,
        fahrzeugId: v.fahrzeugId,
        text: `${v.fahrzeugBezeichnung} · ${v.titel}`,
      })),
  );

  constructor() {
    // Mail wechselt: Vorschau laden und die Anhänge neu vorwählen.
    effect(() => {
      const mail = this.gewaehlt();
      this.vorschau.set(null);
      this.vorschauFehler.set('');
      this.angehakt.set(new Set());
      if (mail) void this.vorschauLaden(mail);
    });
    // Ziel vorbelegen: aus dem Link, sonst der einzige Vorgang des Fahrzeugs der Mail.
    effect(() => {
      const ziele = this.ziele();
      const mail = this.gewaehlt();
      const vorgabe = this.vorgabe();
      if (this.zielVorgang() && ziele.some((z) => z.id === this.zielVorgang())) return;
      const vorbelegt =
        ziele.find((z) => z.id === vorgabe) ??
        (mail?.fahrzeugId ? this.einzigesZiel(ziele, mail.fahrzeugId) : undefined);
      this.zielVorgang.set(vorbelegt?.id ?? '');
    });
  }

  ngOnInit(): void {
    void this.store.laden();
    void this.store.adressenLaden();
    void this.vorgaenge.listeLaden();
  }

  private einzigesZiel(ziele: { id: string; fahrzeugId: string }[], fahrzeugId: string) {
    const eigene = ziele.filter((z) => z.fahrzeugId === fahrzeugId);
    return eigene.length === 1 ? eigene[0] : undefined;
  }

  private async vorschauLaden(mail: PostfachMail): Promise<void> {
    this.vorschauLaedt.set(true);
    try {
      const gelesen = await leseMail(await this.store.rohmail(mail.id));
      if (this.gewaehlt()?.id !== mail.id) return;
      this.vorschau.set(gelesen);
      this.angehakt.set(
        new Set(gelesen.anhaenge.flatMap((a, i) => (this.unterstuetzt(a) ? [i] : []))),
      );
    } catch (fehler) {
      this.vorschauFehler.set(
        fehler instanceof Error && fehler.name !== 'WorkerFehler'
          ? 'Die Mail ließ sich nicht lesen.'
          : vorgangFehlertext(fehler),
      );
    } finally {
      this.vorschauLaedt.set(false);
    }
  }

  unterstuetzt(anhang: GelesenerAnhang): boolean {
    return istAngebotsdatei(anhang.name, anhang.medientyp) && anhang.groesse <= ANGEBOT_GROESSE_MAX;
  }

  grund(anhang: GelesenerAnhang): string {
    if (!istAngebotsdatei(anhang.name, anhang.medientyp)) return 'Nur PDF, PNG und JPEG';
    return anhang.groesse > ANGEBOT_GROESSE_MAX ? 'Größer als 10 MB' : '';
  }

  umschalten(index: number, an: boolean): void {
    this.angehakt.update((menge) => {
      const neu = new Set(menge);
      if (an) neu.add(index);
      else neu.delete(index);
      return neu;
    });
  }

  ansehen(anhang: GelesenerAnhang): void {
    const url = URL.createObjectURL(
      new Blob([anhang.inhalt as BlobPart], { type: anhang.medientyp }),
    );
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  groesse(byte: number): string {
    return byte < 1024 * 1024
      ? `${Math.max(1, Math.round(byte / 1024))} KB`
      : `${(byte / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }

  async zuordnen(): Promise<void> {
    const mail = this.gewaehlt();
    const gelesen = this.vorschau();
    const ziel = this.zielVorgang();
    if (!mail || !gelesen || !ziel) return;
    const gewaehlt = gelesen.anhaenge.filter((_, i) => this.angehakt().has(i));
    if (gewaehlt.length === 0) {
      this.meldungen.warnung('Bitte mindestens einen Anhang ankreuzen.');
      return;
    }
    this.arbeitet.set(true);
    try {
      const notiz = notizVon(gelesen);
      for (const anhang of gewaehlt) {
        await this.vorgangApi.angebotHochladen(
          ziel,
          new Blob([anhang.inhalt as BlobPart], { type: anhang.medientyp }),
          anhang.name,
          notiz,
        );
      }
      if (await this.store.ordneZu(mail.id, ziel)) {
        this.meldungen.erfolg(
          `${gewaehlt.length} ${gewaehlt.length === 1 ? 'Anhang' : 'Anhänge'} als Angebot übernommen, die Mail ist gelöscht.`,
        );
        void this.vorgaenge.listeLaden();
      } else {
        this.meldungen.fehler(this.store.fehler());
      }
    } catch (fehler) {
      this.meldungen.fehler(vorgangFehlertext(fehler));
    } finally {
      this.arbeitet.set(false);
    }
  }

  async verwerfen(): Promise<void> {
    const mail = this.gewaehlt();
    if (!mail) return;
    const ok = await this.dialog.bestaetigen(
      'Die Mail wird gelöscht und lässt sich nicht wiederherstellen.',
      'Mail verwerfen',
      'Verwerfen',
    );
    if (ok && !(await this.store.verwerfen(mail.id))) this.meldungen.fehler(this.store.fehler());
  }

  async adresseKopieren(adresse: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(adresse);
      this.meldungen.erfolg('Adresse kopiert.');
    } catch {
      this.meldungen.info(adresse);
    }
  }
}
