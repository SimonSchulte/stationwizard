import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DialogDienst } from '../../../kern/dialog/dialog-dienst';
import { Angebot } from '../../models/angebot.model';
import { angebotGesamtCent } from '../../services/angebot-kalkulation';
import { AngebotStoreService } from '../../services/angebot-store.service';
import { formatEuro } from '../../services/waehrung';

interface AngebotZeile {
  angebot: Angebot;
  gesamtCent: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-angebot-liste',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatToolbarModule],
  templateUrl: './angebot-liste.html',
  styleUrl: './angebot-liste.less',
})
export class AngebotListe implements OnInit {
  private readonly store = inject(AngebotStoreService);
  private readonly router = inject(Router);
  private readonly dialogDienst = inject(DialogDienst);

  readonly laedt = this.store.listeLaedt;
  readonly fehler = this.store.listeFehler;
  readonly loeschtId = this.store.loeschtId;
  readonly formatEuro = formatEuro;

  readonly zeilen = computed<AngebotZeile[]>(() =>
    this.store
      .angebote()
      .map((angebot) => ({ angebot, gesamtCent: angebotGesamtCent(angebot) }))
      .sort((a, b) => a.angebot.bezeichnung.localeCompare(b.angebot.bezeichnung)),
  );

  ngOnInit(): void {
    void this.store.listeLaden();
  }

  neuesAngebot(): void {
    this.store.neuesAngebotBeginnen();
    void this.router.navigate(['/angebotswesen/angebote/neu']);
  }

  async angebotLoeschen(angebot: Angebot): Promise<void> {
    const bestaetigt = await this.dialogDienst.bestaetigen(
      `„${angebot.bezeichnung}" wird endgültig gelöscht.`,
      'Angebot löschen',
      'Endgültig löschen',
    );
    if (!bestaetigt) return;
    await this.store.angebotLoeschen(angebot.id);
  }
}
