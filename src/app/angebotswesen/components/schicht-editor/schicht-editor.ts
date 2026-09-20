import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { schichtStundenGenau } from '../../services/angebot-kalkulation';
import { Position, Schicht } from '../../models/angebot.model';
import { PreiskatalogEintrag } from '../../models/preiskatalog.model';
import { istGueltigeSchichtzeit } from '../../services/schicht-validierung';
import { centZuEuroEingabe, euroEingabeZuCent } from '../../services/waehrung';

function positionAusKatalog(eintrag: PreiskatalogEintrag, schicht: Schicht): Position {
  return {
    id: crypto.randomUUID(),
    herkunftEintragId: eintrag.id,
    art: eintrag.art,
    bezeichnung: eintrag.bezeichnung,
    einzelpreisCent: eintrag.einzelpreisCent,
    anzahl: 1,
    stunden: eintrag.art === 'einsatzkraft' ? schichtStundenGenau(schicht) : null,
  };
}

function positionManuell(schicht: Schicht): Position {
  return {
    id: crypto.randomUUID(),
    herkunftEintragId: null,
    art: 'einsatzkraft',
    bezeichnung: '',
    einzelpreisCent: 0,
    anzahl: 1,
    stunden: schichtStundenGenau(schicht),
  };
}

/**
 * Eine Schicht mit ihren Positionen. Emittiert bei jeder Änderung die
 * vollständige, aktualisierte `Schicht` – der Elternkomponente (`angebot-detail`)
 * obliegt nur das Einsetzen in die Schichtenliste des Entwurfs.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-schicht-editor',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './schicht-editor.html',
  styleUrl: './schicht-editor.less',
})
export class SchichtEditor {
  readonly schicht = input.required<Schicht>();
  readonly katalog = input.required<PreiskatalogEintrag[]>();

  readonly schichtGeaendert = output<Schicht>();
  readonly schichtEntfernt = output<void>();

  readonly centZuEuroEingabe = centZuEuroEingabe;

  readonly zeitGueltig = computed(() => {
    const s = this.schicht();
    return istGueltigeSchichtzeit(s.von, s.bis);
  });

  readonly stundenAnzeige = computed(() => {
    const s = this.schicht();
    return this.zeitGueltig() ? schichtStundenGenau(s) : null;
  });

  private aktualisiereSchicht(patch: Partial<Schicht>): void {
    this.schichtGeaendert.emit({ ...this.schicht(), ...patch });
  }

  datumAktualisieren(wert: string): void {
    if (!wert) return;
    this.aktualisiereSchicht({ datum: wert });
  }

  vonAktualisieren(wert: string): void {
    if (!wert) return;
    this.aktualisiereSchicht({ von: wert });
  }

  bisAktualisieren(wert: string): void {
    if (!wert) return;
    this.aktualisiereSchicht({ bis: wert });
  }

  katalogPositionHinzufuegen(eintragId: string): void {
    const eintrag = this.katalog().find((e) => e.id === eintragId);
    if (!eintrag) return;
    this.aktualisiereSchicht({
      positionen: [...this.schicht().positionen, positionAusKatalog(eintrag, this.schicht())],
    });
  }

  manuellePositionHinzufuegen(): void {
    this.aktualisiereSchicht({
      positionen: [...this.schicht().positionen, positionManuell(this.schicht())],
    });
  }

  positionAktualisieren(id: string, patch: Partial<Position>): void {
    this.aktualisiereSchicht({
      positionen: this.schicht().positionen.map((position) =>
        position.id === id ? { ...position, ...patch } : position,
      ),
    });
  }

  positionArtAktualisieren(position: Position, art: Position['art']): void {
    this.positionAktualisieren(position.id, {
      art,
      stunden: art === 'einsatzkraft' ? (position.stunden ?? this.stundenAnzeige() ?? 1) : null,
    });
  }

  positionPreisAktualisieren(position: Position, wert: string): void {
    const einzelpreisCent = euroEingabeZuCent(wert);
    if (einzelpreisCent === null) return;
    this.positionAktualisieren(position.id, { einzelpreisCent });
  }

  positionAnzahlAktualisieren(position: Position, wert: string): void {
    const anzahl = Number(wert);
    if (!Number.isInteger(anzahl) || anzahl < 1) return;
    this.positionAktualisieren(position.id, { anzahl });
  }

  positionStundenAktualisieren(position: Position, wert: string): void {
    const stunden = Number(wert.replace(',', '.'));
    if (!Number.isFinite(stunden) || stunden <= 0) return;
    this.positionAktualisieren(position.id, { stunden });
  }

  positionEntfernen(id: string): void {
    this.aktualisiereSchicht({
      positionen: this.schicht().positionen.filter((position) => position.id !== id),
    });
  }
}
