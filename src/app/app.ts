import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { VERWALTUNG_GRUPPEN } from './verwaltung/verwaltung-gruppen';
import { Zaehlmarke } from './kern/zaehlmarke/zaehlmarke';
import { PostfachZaehler } from './vorgaenge/services/postfach-zaehler';
import { AufgabenStoreService } from './kern/aufgaben/aufgaben-store.service';
import { Benutzerkontext } from './kern/benutzerkontext';
import { WorkerClient } from './kern/worker-client';
import { UnterschriftDialogDienst } from './kern/unterschrift/unterschrift-dialog-dienst';
import { DialogDienst } from './kern/dialog/dialog-dienst';
import { MeldungsDienst } from './kern/zustand/meldungs-dienst';
import { VerlassenSchutz } from './kern/verlassen-schutz';
import { Meldung } from './kern/zustand/zustand';

/** Eintrag der Hauptnavigation; Einträge mit `kinder` klappen als Baum auf. */
export interface NavKnoten {
  bezeichnung: string;
  icon: string;
  /** Ziel des Links; fehlt bei reinen Gruppenknoten. */
  link?: string;
  /** Aktiv nur bei genau diesem Pfad (Übersicht neben ihren Unterseiten). */
  exakt?: boolean;
  kinder?: NavKnoten[];
  /** 0 = oberste Ebene, 1 und 2 = Unterpunkte. */
  ebene: number;
  /** Zeigt eine Zählmarke: offene Aufgaben beziehungsweise Mails im Postfach. */
  marke?: 'aufgaben' | 'postfach';
  /** Pfadpräfix, unter dem eine Gruppe aufgeklappt wird; Standard sind die Links der Kinder. */
  pfadPraefix?: string;
}

const unterpunkt = (
  bezeichnung: string,
  icon: string,
  link: string,
  optionen: Partial<NavKnoten> = {},
): NavKnoten => ({ bezeichnung, icon, link, ebene: 1, ...optionen });

const KALENDER_KNOTEN: NavKnoten = {
  bezeichnung: 'Kalender',
  icon: 'calendar_month',
  ebene: 0,
  kinder: [
    unterpunkt('Kalender', 'calendar_month', '/kalender', { exakt: true }),
    unterpunkt('Jahresübernahme', 'event_repeat', '/kalender/uebernahme'),
  ],
};

const EINSATZPLANUNG_KNOTEN: NavKnoten = {
  bezeichnung: 'Einsatzplanung',
  icon: 'groups',
  ebene: 0,
  kinder: [unterpunkt('Einsätze', 'event', '/einsatzplanung', { exakt: true })],
};

const PERSONAL_KNOTEN: NavKnoten = {
  bezeichnung: 'Personal',
  icon: 'badge',
  ebene: 0,
  kinder: [
    unterpunkt('Übersicht', 'people', '/personal', { exakt: true }),
    unterpunkt('Führerscheine', 'drive_eta', '/personal/fuehrerscheine'),
    unterpunkt('Ehrungsmanager', 'military_tech', '/personal/ehrungen', { exakt: true }),
    unterpunkt('Offene Ehrungen', 'pending_actions', '/personal/offene-ehrungen'),
  ],
};

const FAHRZEUGE_KNOTEN: NavKnoten = {
  bezeichnung: 'Fahrzeuge',
  icon: 'local_shipping',
  ebene: 0,
  pfadPraefix: '/fahrzeuge',
  kinder: [
    unterpunkt('Übersicht', 'dashboard', '/fahrzeuge', { exakt: true }),
    unterpunkt('Fahrzeugliste', 'list', '/fahrzeuge/liste'),
    unterpunkt('Fahrzeug anlegen', 'add', '/fahrzeuge/neu'),
  ],
};

const MATERIAL_KNOTEN: NavKnoten = {
  bezeichnung: 'Materialverwaltung',
  icon: 'inventory_2',
  ebene: 0,
  pfadPraefix: '/material',
  kinder: [
    unterpunkt('Übersicht', 'dashboard', '/material', { exakt: true }),
    unterpunkt('Behälter anlegen', 'add_box', '/material/behaelter/neu'),
    unterpunkt('Prüfvorlagen', 'checklist', '/material/vorlagen'),
  ],
};

const ANGEBOTSWESEN_KNOTEN: NavKnoten = {
  bezeichnung: 'Angebotswesen',
  icon: 'request_quote',
  ebene: 0,
  pfadPraefix: '/angebotswesen',
  kinder: [
    unterpunkt('Übersicht', 'dashboard', '/angebotswesen', { exakt: true }),
    unterpunkt('Angebote', 'request_quote', '/angebotswesen/angebote', { exakt: true }),
    unterpunkt('Angebot anlegen', 'add', '/angebotswesen/angebote/neu'),
    unterpunkt('Preiskatalog', 'sell', '/angebotswesen/preiskatalog'),
  ],
};

const AUFGABEN_KNOTEN: NavKnoten = {
  bezeichnung: 'Offene Aufgaben',
  icon: 'task_alt',
  ebene: 0,
  marke: 'aufgaben',
  pfadPraefix: '/aufgaben',
  kinder: [
    unterpunkt('Übersicht', 'task_alt', '/aufgaben', { exakt: true }),
    unterpunkt('Kilometermeldungen', 'speed', '/aufgaben/kilometermeldungen'),
    unterpunkt('Fahrzeugchecks', 'fact_check', '/aufgaben/fahrzeugchecks'),
  ],
};

const VORGAENGE_KNOTEN: NavKnoten = {
  bezeichnung: 'Postfach',
  icon: 'inbox',
  link: '/vorgaenge/postfach',
  ebene: 0,
  marke: 'postfach',
};

/** Verwaltung: dieselben Gruppen wie auf der Startseite, jeweils mit allen Unterseiten. */
const VERWALTUNG_KNOTEN: NavKnoten = {
  bezeichnung: 'Verwaltung',
  icon: 'admin_panel_settings',
  ebene: 0,
  pfadPraefix: '/verwaltung',
  kinder: [
    unterpunkt('Übersicht', 'dashboard', '/verwaltung', { exakt: true }),
    ...VERWALTUNG_GRUPPEN.map((gruppe): NavKnoten => ({
      bezeichnung: gruppe.titel,
      icon: gruppe.icon,
      ebene: 1,
      kinder: gruppe.eintraege.map((eintrag) =>
        unterpunkt(eintrag.titel, eintrag.icon, eintrag.ziel, { ebene: 2 }),
      ),
    })),
  ],
};

export const NAVIGATION: NavKnoten[] = [
  KALENDER_KNOTEN,
  EINSATZPLANUNG_KNOTEN,
  PERSONAL_KNOTEN,
  FAHRZEUGE_KNOTEN,
  MATERIAL_KNOTEN,
  ANGEBOTSWESEN_KNOTEN,
  AUFGABEN_KNOTEN,
  VORGAENGE_KNOTEN,
  VERWALTUNG_KNOTEN,
];

/** Alle Knoten mit Kindern, auch verschachtelte, für das automatische Aufklappen. */
function gruppenknoten(knoten: readonly NavKnoten[]): NavKnoten[] {
  return knoten.flatMap((k) => (k.kinder ? [k, ...gruppenknoten(k.kinder)] : []));
}

function enthaeltLink(knoten: NavKnoten, pfad: string): boolean {
  if (knoten.link && (pfad === knoten.link || pfad.startsWith(knoten.link + '/'))) return true;
  return !!knoten.kinder?.some((kind) => enthaeltLink(kind, pfad));
}

const GRUPPENKNOTEN = gruppenknoten(NAVIGATION);

@Component({
  selector: 'app-root',
  imports: [
    Meldung,
    Zaehlmarke,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatSidenavModule,
    MatTreeModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected unterschriftBearbeiten(): void {
    void this.unterschriftDialog.bearbeiten(this.benutzer.anzeigename());
  }

  protected async anzeigenameBearbeiten(): Promise<void> {
    const neu = await this.dialog.eingabe(
      'Dieser Name überschreibt den Namen aus der Anmeldung. Er erscheint in Ausgaben (etwa Unterschriften und Versandtexten) und in Logeinträgen. Leer lassen, um wieder den Namen aus der Anmeldung zu verwenden.',
      'Anzeigename',
      'Anzeigename',
      {
        wert: this.benutzer.eigenerName() ?? '',
        leerErlaubt: true,
        maxLaenge: 60,
        bestaetigenLabel: 'Speichern',
      },
    );
    if (neu === null) return;
    try {
      await this.benutzer.anzeigenameSetzen(neu === '' ? null : neu);
      this.meldungen.erfolg(neu === '' ? 'Anzeigename zurückgesetzt.' : 'Anzeigename gespeichert.');
    } catch {
      this.meldungen.fehler('Der Anzeigename konnte nicht gespeichert werden.');
    }
  }

  protected readonly benutzer = inject(Benutzerkontext);
  private readonly dialog = inject(DialogDienst);
  private readonly meldungen = inject(MeldungsDienst);
  protected readonly worker = inject(WorkerClient);
  protected readonly aufgaben = inject(AufgabenStoreService);
  protected readonly postfach = inject(PostfachZaehler);
  protected readonly aktuellesJahr = new Date().getFullYear();
  private readonly verlassenSchutz = inject(VerlassenSchutz);
  private readonly router = inject(Router);
  private readonly unterschriftDialog = inject(UnterschriftDialogDienst);

  protected readonly navigation = NAVIGATION;
  /** Alles, was im Kopf als Marke auftaucht: Aufgaben und Postfach. */
  protected readonly kopfZaehler = computed(() => this.aufgaben.anzahl() + this.postfach.offen());
  protected readonly markenAnzahl = (knoten: NavKnoten): number =>
    knoten.marke === 'aufgaben'
      ? this.aufgaben.anzahl()
      : knoten.marke === 'postfach'
        ? this.postfach.offen()
        : 0;
  protected readonly kinderVon = (knoten: NavKnoten): NavKnoten[] => knoten.kinder ?? [];
  protected readonly hatKinder = (_index: number, knoten: NavKnoten): boolean =>
    !!knoten.kinder?.length;
  private readonly baum = viewChild(MatTree<NavKnoten>);
  private readonly pfad = toSignal(
    this.router.events.pipe(
      filter((ereignis): ereignis is NavigationEnd => ereignis instanceof NavigationEnd),
      map((ereignis) => ereignis.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    // Wer auf einer Unterseite ist, sieht den Zweig mit ihr sofort aufgeklappt.
    effect(() => {
      const pfad = this.pfad().split(/[?#]/)[0] ?? '';
      const baum = this.baum();
      if (!baum) return;
      for (const gruppe of GRUPPENKNOTEN) {
        const passt = gruppe.pfadPraefix
          ? pfad === gruppe.pfadPraefix || pfad.startsWith(gruppe.pfadPraefix + '/')
          : enthaeltLink(gruppe, pfad);
        if (passt) baum.expand(gruppe);
      }
    });
    void this.benutzer.laden();
    // Eigenes catch: ein Fehler beim Zählen offener Aufgaben darf die Shell nie
    // blockieren – dasselbe Prinzip wie beim Profilbild.
    void this.aufgaben.laden().catch(() => undefined);
  }

  @HostListener('window:beforeunload', ['$event'])
  verlassenPruefen(ereignis: BeforeUnloadEvent): void {
    if (this.verlassenSchutz.hatUngesicherteAenderungen()) {
      ereignis.preventDefault();
      ereignis.returnValue = '';
    }
  }

  protected zumInhalt(ereignis: Event, inhalt: HTMLElement): void {
    ereignis.preventDefault();
    inhalt.focus();
  }
}
