import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Benutzerkontext } from './kern/benutzerkontext';
import { WorkerClient } from './kern/worker-client';
import { VerlassenSchutz } from './kern/verlassen-schutz';

@Component({
  selector: 'app-root',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSidenavModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly benutzer = inject(Benutzerkontext);
  protected readonly worker = inject(WorkerClient);
  protected readonly aktuellesJahr = new Date().getFullYear();
  private readonly verlassenSchutz = inject(VerlassenSchutz);

  constructor() {
    void this.benutzer.laden();
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
