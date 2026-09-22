import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import {
  HERKUENFTE,
  HERKUNFT_LABEL,
  Herkunft,
  PruefArtikel,
  anzahlArtikel,
} from '../../models/pruefvorlage.model';
import {
  PruefvorlageStoreService,
  neuerArtikel,
  neuesFach,
} from '../../services/pruefvorlage-store.service';

/**
 * Bearbeitet eine Prüfvorlage als Ganzes: Kopfdaten, Fächer und Artikel. Der
 * gesamte Baum wird in einem Schreibvorgang gespeichert, wie ein Angebot mit
 * seinen Schichten – das hält die Zahl der Schreibzugriffe klein und macht die
 * optimistische Sperre auf Vorlagenebene möglich.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vorlage-editor',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatToolbarModule,
  ],
  templateUrl: './vorlage-editor.html',
  styleUrl: './vorlage-editor.less',
})
export class VorlageEditor {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(PruefvorlageStoreService);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);

  /**
   * Vorlagen-Id aus der Route, oder `neu` für eine noch nicht gespeicherte
   * Vorlage. Über `ActivatedRoute` statt über einen Signal-Input: der Router
   * ist ohne `withComponentInputBinding()` eingerichtet, ein `input.required`
   * bliebe deshalb ungesetzt und die Seite stürbe mit NG0950.
   */
  private readonly routenId = toSignal(
    this.route.paramMap.pipe(
      map((paramMap) => paramMap.get('id')),
      distinctUntilChanged(),
    ),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  readonly entwurf = this.store.entwurf;
  readonly laedt = this.store.ladeLaeuft;
  readonly ladeFehler = this.store.ladeFehler;
  readonly speichertGerade = this.store.speichertGerade;
  readonly speicherFehler = this.store.speicherFehler;
  readonly speicherKonflikt = this.store.speicherKonflikt;
  readonly hatAenderungen = this.store.hatUngesicherteAenderungen;

  readonly herkuenfte = HERKUENFTE;
  readonly herkunftLabel = HERKUNFT_LABEL;

  readonly artikelGesamt = computed(() => anzahlArtikel(this.entwurf()?.faecher ?? []));

  /** Ohne Bezeichnung und ohne einen einzigen Artikel ist die Vorlage nicht brauchbar. */
  readonly speicherbar = computed(() => {
    const entwurf = this.entwurf();
    if (!entwurf || entwurf.bezeichnung.trim() === '') return false;
    if (entwurf.faecher.length === 0) return false;
    return entwurf.faecher.every(
      (fach) =>
        fach.bezeichnung.trim() !== '' &&
        fach.artikel.length > 0 &&
        fach.artikel.every((artikel) => artikel.bezeichnung.trim() !== ''),
    );
  });

  constructor() {
    effect(() => {
      const id = this.routenId();
      // Eine bereits geladene Vorlage nicht erneut holen: nach dem Anlegen
      // ersetzt `speichern()` die Route `neu` durch die echte Id, ohne die
      // Komponente neu zu erzeugen. Ohne diese Abfrage liefe der Effekt ein
      // zweites Mal und überschriebe den gerade weiterbearbeiteten Entwurf mit
      // einem veralteten Stand (siehe AngebotDetail in CLAUDE.md).
      if (id === 'neu' || id === null) {
        if (!this.store.entwurf()) this.store.neueVorlage();
        return;
      }
      if (this.store.geladen()?.daten.id !== id) void this.store.vorlageLaden(id);
    });
  }

  kopfAendern(feld: 'bezeichnung' | 'beschreibung' | 'grundlage', wert: string): void {
    this.store.entwurfAendern((vorlage) => ({ ...vorlage, [feld]: wert }));
  }

  fachHinzufuegen(): void {
    this.store.entwurfAendern((vorlage) => ({
      ...vorlage,
      faecher: [...vorlage.faecher, neuesFach()],
    }));
  }

  fachAendern(fachId: string, bezeichnung: string): void {
    this.store.entwurfAendern((vorlage) => {
      const fach = vorlage.faecher.find((eintrag) => eintrag.id === fachId);
      if (fach) fach.bezeichnung = bezeichnung;
      return vorlage;
    });
  }

  async fachEntfernen(fachId: string, bezeichnung: string): Promise<void> {
    const bestaetigt = await this.dialogDienst.bestaetigen(
      `Das Fach „${bezeichnung || 'ohne Bezeichnung'}" wird mit allen Artikeln entfernt.`,
      'Fach entfernen',
      'Entfernen',
    );
    if (!bestaetigt) return;
    this.store.entwurfAendern((vorlage) => ({
      ...vorlage,
      faecher: vorlage.faecher.filter((fach) => fach.id !== fachId),
    }));
  }

  fachVerschieben(fachId: string, richtung: -1 | 1): void {
    this.store.entwurfAendern((vorlage) => {
      const index = vorlage.faecher.findIndex((fach) => fach.id === fachId);
      const ziel = index + richtung;
      if (index < 0 || ziel < 0 || ziel >= vorlage.faecher.length) return vorlage;
      const [fach] = vorlage.faecher.splice(index, 1);
      vorlage.faecher.splice(ziel, 0, fach!);
      return vorlage;
    });
  }

  artikelHinzufuegen(fachId: string): void {
    this.store.entwurfAendern((vorlage) => {
      vorlage.faecher.find((fach) => fach.id === fachId)?.artikel.push(neuerArtikel());
      return vorlage;
    });
  }

  artikelAendern<F extends keyof PruefArtikel>(
    fachId: string,
    artikelId: string,
    feld: F,
    wert: PruefArtikel[F],
  ): void {
    this.store.entwurfAendern((vorlage) => {
      const artikel = vorlage.faecher
        .find((fach) => fach.id === fachId)
        ?.artikel.find((eintrag) => eintrag.id === artikelId);
      if (artikel) artikel[feld] = wert;
      return vorlage;
    });
  }

  sollmengeAendern(fachId: string, artikelId: string, wert: string): void {
    const zahl = Number.parseInt(wert, 10);
    if (!Number.isInteger(zahl) || zahl < 1) return;
    this.artikelAendern(fachId, artikelId, 'sollMenge', zahl);
  }

  herkunftAendern(fachId: string, artikelId: string, wert: Herkunft): void {
    this.artikelAendern(fachId, artikelId, 'herkunft', wert);
  }

  artikelEntfernen(fachId: string, artikelId: string): void {
    this.store.entwurfAendern((vorlage) => {
      const fach = vorlage.faecher.find((eintrag) => eintrag.id === fachId);
      if (fach) fach.artikel = fach.artikel.filter((artikel) => artikel.id !== artikelId);
      return vorlage;
    });
  }

  async speichern(): Promise<void> {
    const warNeu = this.store.istNeu();
    const entwurf = this.entwurf();
    if (!(await this.store.speichern()) || !entwurf) return;
    if (warNeu) {
      // Von `neu` auf die echte Id wechseln, ohne einen Verlaufseintrag und
      // ohne die Komponente neu zu erzeugen.
      void this.router.navigate(['/material/vorlagen', entwurf.id], { replaceUrl: true });
    }
  }

  async standAnzeigen(): Promise<void> {
    const entwurf = this.entwurf();
    if (!entwurf) return;
    const gespeichert = await this.store.neuLadenNachKonflikt(entwurf.id);
    await this.dialogDienst.hinweis(
      gespeichert
        ? `Gespeichert ist zurzeit „${gespeichert.bezeichnung}" mit ${anzahlArtikel(
            gespeichert.faecher,
          )} Artikeln (zuletzt geändert von ${gespeichert.geaendertVon}). ` +
            'Ihre Änderungen bleiben erhalten; erneutes Speichern überschreibt jetzt diesen Stand.'
        : 'Die Prüfvorlage ist zwischenzeitlich gelöscht worden.',
      'Gespeicherter Stand',
    );
  }
}
