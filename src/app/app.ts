import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
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
import { AufgabenStoreService } from './aufgaben/services/aufgaben-store.service';
import { Benutzerkontext } from './kern/benutzerkontext';
import { WorkerClient } from './kern/worker-client';
import { VerlassenSchutz } from './kern/verlassen-schutz';

/** Eintrag der Hauptnavigation; Einträge mit `kinder` klappen als Baum auf. */
export interface NavKnoten {
  bezeichnung: string;
  icon: string;
  /** Ziel des Links; fehlt bei reinen Gruppenknoten. */
  link?: string;
  /** Aktiv nur bei genau diesem Pfad (Übersicht neben ihren Unterseiten). */
  exakt?: boolean;
  kinder?: NavKnoten[];
  /** 0 = oberste Ebene, 1 = Unterpunkt. */
  ebene: number;
  /** Zeigt die Zahl offener Aufgaben. */
  aufgabenMarke?: boolean;
}

const PERSONAL_KNOTEN: NavKnoten = {
  bezeichnung: 'Personal',
  icon: 'badge',
  ebene: 0,
  kinder: [
    { bezeichnung: 'Übersicht', icon: 'people', link: '/personal', exakt: true, ebene: 1 },
    { bezeichnung: 'Führerscheine', icon: 'drive_eta', link: '/personal/fuehrerscheine', ebene: 1 },
    {
      bezeichnung: 'Ehrungsmanager',
      icon: 'military_tech',
      link: '/personal/ehrungen',
      ebene: 1,
    },
  ],
};

const NAVIGATION: NavKnoten[] = [
  { bezeichnung: 'Kalender', icon: 'calendar_month', link: '/kalender', ebene: 0 },
  { bezeichnung: 'Einsatz', icon: 'groups', link: '/einsatz', ebene: 0 },
  PERSONAL_KNOTEN,
  { bezeichnung: 'Fahrzeuge', icon: 'local_shipping', link: '/fahrzeuge', ebene: 0 },
  { bezeichnung: 'Materialverwaltung', icon: 'inventory_2', link: '/material', ebene: 0 },
  { bezeichnung: 'Angebotswesen', icon: 'request_quote', link: '/angebotswesen', ebene: 0 },
  {
    bezeichnung: 'Offene Aufgaben',
    icon: 'task_alt',
    link: '/aufgaben',
    ebene: 0,
    aufgabenMarke: true,
  },
  { bezeichnung: 'Verwaltung', icon: 'admin_panel_settings', link: '/verwaltung', ebene: 0 },
];

@Component({
  selector: 'app-root',
  imports: [
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
  protected readonly benutzer = inject(Benutzerkontext);
  protected readonly worker = inject(WorkerClient);
  protected readonly aufgaben = inject(AufgabenStoreService);
  protected readonly aktuellesJahr = new Date().getFullYear();
  private readonly verlassenSchutz = inject(VerlassenSchutz);
  private readonly router = inject(Router);

  protected readonly navigation = NAVIGATION;
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
    // Wer auf einer Unterseite von Personal ist, sieht die Geschwister sofort aufgeklappt.
    effect(() => {
      if (this.pfad().startsWith('/personal')) this.baum()?.expand(PERSONAL_KNOTEN);
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
