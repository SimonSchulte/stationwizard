import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ERFASSUNG_TOKEN_MUSTER, tokenAusPfad } from './token-aus-pfad';
import { leseGemerktenNamen, merkeNamen, vergissNamen } from './gemerkter-name';
import { ladeFahrzeug, sendeMeldung, type OeffentlichesFahrzeug } from './oeffentlich-api';

type Zustand = 'laedt' | 'formular' | 'sendet' | 'gesendet' | 'unbekannt';

const NAME_MIN = 2;
const NAME_MAX = 60;
const BEMERKUNG_MAX = 200;
const STAND_MAX = 9_999_999;

/**
 * Die gesamte öffentliche Meldeseite in einer Komponente.
 *
 * Sie kennt genau ein Fahrzeug – das aus dem Token im Pfad – und bietet keinen
 * Weg in die App: kein Router, keine Navigation, kein Abmelden, kein Link.
 *
 * Bewusst ohne Datumsfeld: den Ablesetag setzt der Server als Berliner
 * Kalendertag. Das nimmt die Rückdatierung aus einer nicht angemeldeten Quelle
 * als Missbrauchsfläche vollständig heraus, und am Fahrzeug wird ohnehin sofort
 * gemeldet.
 *
 * Ebenso bewusst ohne Plausibilitätsprüfung gegen den letzten bekannten Stand:
 * den kennt diese Seite nicht und darf ihn nicht kennen (er würde die
 * Fahrzeugnutzung offenlegen und erlauben, die eigene Zahl passend zu wählen).
 * Geprüft wird bei der Freigabe, durch eine geprüfte Person mit vollem Kontext.
 */
@Component({
  selector: 'oeff-meldung',
  templateUrl: './meldung-seite.html',
  // Kein `styleUrl`: die Stile stehen global in `oeffentlich/src/styles.less`,
  // damit Angular sie nicht zur Laufzeit als inline `<style>` einfügt und die
  // Content-Security-Policy ohne `unsafe-inline` auskommt.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeldungSeite {
  readonly zustand = signal<Zustand>('laedt');
  readonly fahrzeug = signal<OeffentlichesFahrzeug | null>(null);
  readonly fehler = signal('');

  readonly name = signal('');
  readonly standRoh = signal('');
  readonly bemerkung = signal('');

  readonly nameLaenge = computed(() => this.name().trim().length);
  readonly nameOk = computed(() => this.nameLaenge() >= NAME_MIN && this.nameLaenge() <= NAME_MAX);

  readonly stand = computed<number | null>(() => {
    const roh = this.standRoh().trim();
    if (roh === '') return null;
    const wert = Number(roh);
    if (!Number.isInteger(wert) || wert < 0 || wert > STAND_MAX) return null;
    return wert;
  });

  readonly bemerkungZuLang = computed(() => this.bemerkung().length > BEMERKUNG_MAX);
  readonly absendbar = computed(
    () =>
      this.zustand() === 'formular' &&
      this.nameOk() &&
      this.stand() !== null &&
      !this.bemerkungZuLang(),
  );

  /** Öffentlich, damit Tests auf das erste Laden warten können (wie `KmErfassung.bereit`). */
  readonly bereit: Promise<void>;

  private readonly token = tokenAusPfad(location.pathname);

  constructor() {
    this.name.set(leseGemerktenNamen());
    this.bereit = this.laden();
  }

  private async laden(): Promise<void> {
    if (!this.token || !ERFASSUNG_TOKEN_MUSTER.test(this.token)) {
      this.zustand.set('unbekannt');
      return;
    }
    try {
      this.fahrzeug.set(await ladeFahrzeug(this.token));
      this.zustand.set('formular');
    } catch {
      // Unbekanntes Token, gelöschtes Fahrzeug und Netzfehler sehen hier
      // gleich aus; der Server unterscheidet sie bewusst ebenfalls nicht.
      this.zustand.set('unbekannt');
    }
  }

  async absenden(): Promise<void> {
    const stand = this.stand();
    if (!this.absendbar() || stand === null || !this.token) return;
    this.zustand.set('sendet');
    this.fehler.set('');
    try {
      await sendeMeldung(this.token, {
        name: this.name().trim(),
        stand,
        bemerkung: this.bemerkung().trim(),
      });
      merkeNamen(this.name().trim());
      this.zustand.set('gesendet');
    } catch (ursache) {
      this.fehler.set(
        ursache instanceof Error ? ursache.message : 'Die Meldung konnte nicht übermittelt werden.',
      );
      this.zustand.set('formular');
    }
  }

  namenVergessen(): void {
    vergissNamen();
    this.name.set('');
  }

  /** Nach einer gesendeten Meldung erneut melden, ohne die Seite neu zu laden. */
  weitereMeldung(): void {
    this.standRoh.set('');
    this.bemerkung.set('');
    this.fehler.set('');
    this.zustand.set('formular');
  }
}
