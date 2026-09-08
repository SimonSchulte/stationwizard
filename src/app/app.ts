import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Benutzerkontext } from './kern/benutzerkontext';
import { WorkerClient } from './kern/worker-client';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatIconModule, MatProgressBarModule],
  templateUrl: './app.html',
  styleUrl: './app.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly benutzer = inject(Benutzerkontext);
  protected readonly worker = inject(WorkerClient);

  constructor() {
    void this.benutzer.laden();
  }
}
