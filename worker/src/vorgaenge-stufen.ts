import {
  LETZTE_STUFE,
  STUFE_ANGEBOTE,
  STUFE_EINGEREICHT,
  STUFE_GENEHMIGT,
  VORGANG_STUFEN,
} from './vorgaenge-gemeinsam';

export interface StufenZustand {
  /** -1 = Meldung noch nicht vollständig, sonst 0 bis 5. */
  stufe: number;
  angebote: number;
}

export interface StufenAblehnung {
  code: string;
  nachricht: string;
  status: number;
}

/**
 * Prüft einen Stufenwechsel über `POST …/stufe`. Reine Funktion ohne Datenbank, damit jede Regel
 * einzeln prüfbar ist. Erlaubt ist immer nur der nächste oder der vorherige Schritt:
 *
 * - Stufe 0 entsteht ausschließlich automatisch, sobald die Meldung vollständig ist.
 * - „Eingereicht“ entsteht ausschließlich über `POST …/einreichen` (Mail und Stufe gemeinsam).
 * - „Angebote eingeholt“ verlangt mindestens ein Angebot.
 * - „Genehmigt“ und jeder Schritt zurück ab „Eingereicht“ sind der Zugführung vorbehalten.
 */
export function pruefeStufenwechsel(
  zustand: StufenZustand,
  nach: unknown,
  darfFreigeben: boolean,
): StufenAblehnung | null {
  if (typeof nach !== 'number' || !Number.isInteger(nach) || nach < 0 || nach > LETZTE_STUFE) {
    return { code: 'VORGANG_UNGUELTIG', nachricht: 'Ungültige Stufe.', status: 400 };
  }
  const { stufe } = zustand;
  if (nach === stufe) {
    return {
      code: 'VORGANG_STUFE_UNVERAENDERT',
      nachricht: 'Diese Stufe ist schon erreicht.',
      status: 409,
    };
  }
  if (stufe < 0) {
    return {
      code: 'VORGANG_MELDUNG_UNVOLLSTAENDIG',
      nachricht: 'Zuerst die Schadensmeldung vollständig ausfüllen.',
      status: 409,
    };
  }

  if (nach === stufe + 1) {
    if (nach === STUFE_EINGEREICHT) {
      return {
        code: 'VORGANG_NUR_UEBER_EINREICHEN',
        nachricht: 'Eingereicht wird nur durch „Einreichen per E-Mail“.',
        status: 409,
      };
    }
    if (nach === STUFE_ANGEBOTE && zustand.angebote < 1) {
      return {
        code: 'VORGANG_ANGEBOT_FEHLT',
        nachricht: 'Ohne mindestens ein Angebot geht es nicht weiter.',
        status: 409,
      };
    }
    if (nach === STUFE_GENEHMIGT && !darfFreigeben) {
      return {
        code: 'VORGANG_GENEHMIGUNG_NICHT_ERLAUBT',
        nachricht: 'Genehmigt setzt nur die Zugführung.',
        status: 403,
      };
    }
    return null;
  }

  if (nach === stufe - 1 && nach >= 0) {
    if (stufe >= STUFE_EINGEREICHT && !darfFreigeben) {
      return {
        code: 'VORGANG_ZURUECK_NICHT_ERLAUBT',
        nachricht: 'Ab „Eingereicht“ nimmt nur die Zugführung eine Stufe zurück.',
        status: 403,
      };
    }
    return null;
  }

  return {
    code: 'VORGANG_STUFE_UEBERSPRUNGEN',
    nachricht: `Von „${VORGANG_STUFEN[stufe]}“ geht es nur eine Stufe weiter oder zurück.`,
    status: 409,
  };
}
