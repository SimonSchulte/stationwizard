import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DialogDienst } from '../../kern/dialog/dialog-dienst';
import { MeldungsDienst } from '../../kern/zustand/meldungs-dienst';
import { SystemkonfigurationStoreService } from '../../systemkonfiguration/services/systemkonfiguration-store.service';
import {
  SendenDialog,
  SendenDialogDaten,
  SendenErgebnis,
} from '../components/senden-dialog/senden-dialog';
import { STUFE_ANGEBOTE } from '../models/vorgang.model';
import { SchadensmeldungPdfService } from './schadensmeldung-pdf.service';
import { VorgangStoreService } from './vorgang-store.service';

/** Bytes als Base64, in Blöcken, damit große Argumentlisten für `String.fromCharCode` vermieden werden. */
export function alsBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

/**
 * „Per E-Mail senden“ und „Einreichen“: wählt Empfänger und Anhänge, erzeugt im Browser das PDF der
 * gespeicherten, unterschriebenen Meldung und lässt den Worker versenden. Die Stufe „Eingereicht“
 * setzt der Worker erst nach erfolgreichem Versand.
 */
@Injectable({ providedIn: 'root' })
export class VorgangVersandService {
  private readonly store = inject(VorgangStoreService);
  private readonly dialog = inject(MatDialog);
  private readonly hinweise = inject(DialogDienst);
  private readonly konfiguration = inject(SystemkonfigurationStoreService);
  private readonly pdf = inject(SchadensmeldungPdfService);
  private readonly meldungen = inject(MeldungsDienst);

  /** Ob das Senden den Vorgang einreicht: genau auf Stufe „Angebote eingeholt“. */
  einreichenMoeglich(): boolean {
    return this.store.aktuell()?.daten.vorgang.stufe === STUFE_ANGEBOTE;
  }

  async senden(): Promise<boolean> {
    const stand = this.store.aktuell();
    const meldung = stand?.daten.meldung;
    if (!stand || !meldung) return false;
    if (this.store.ungespeichert()) {
      this.meldungen.warnung('Zuerst die Änderungen an der Meldung speichern.');
      return false;
    }

    await this.konfiguration.laden();
    const empfaenger = (this.konfiguration.gespeicherteEinstellungen()?.vorgangEmpfaenger ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a !== '');
    if (empfaenger.length === 0) {
      await this.hinweise.hinweis(
        'Es sind noch keine Empfänger festgelegt. Die Zugführung legt sie in der Systemkonfiguration im Reiter „E-Mail“ fest.',
        'Keine Empfänger',
      );
      return false;
    }

    const einreichen = this.einreichenMoeglich();
    const referenz = this.dialog.open<SendenDialog, SendenDialogDaten, SendenErgebnis | null>(
      SendenDialog,
      {
        data: { einreichen, empfaenger, angebote: stand.daten.angebote },
        width: '520px',
        maxWidth: '95vw',
      },
    );
    const wahl = await firstValueFrom(referenz.afterClosed());
    if (!wahl) return false;

    let pdf: Uint8Array;
    try {
      pdf = await this.pdf.erzeuge(meldung.inhalt, stand.daten.unterschriften);
    } catch (fehler) {
      this.meldungen.fehler(
        fehler instanceof Error ? fehler.message : 'Das PDF konnte nicht erzeugt werden.',
      );
      return false;
    }

    const ok = await this.store.senden({
      modus: einreichen ? 'einreichen' : 'senden',
      pdf: alsBase64(pdf),
      ...wahl,
    });
    if (ok) {
      this.meldungen.erfolg(
        einreichen ? 'Eingereicht: Die Meldung wurde gesendet.' : 'Die Meldung wurde gesendet.',
      );
    } else {
      this.meldungen.fehler(this.store.aktionFehler());
    }
    return ok;
  }
}
