import { istUmleitung, redigiere, ursachenText } from './diagnose';
import { leseZugangsdatum, type Zugangsdatum } from './zugangsdaten';

/**
 * Mailversand als ein Vertrag mit zwei Umsetzungen. Welcher Weg benutzt wird,
 * entscheidet die Systemkonfiguration; welcher überhaupt benutzbar ist,
 * entscheiden die am Worker vorhandenen Bindings. Ein dritter Anbieter wäre
 * ein weiterer Adapter hinter demselben `MailVersand`, keine Änderung an den
 * Aufrufern.
 *
 * SMTP ist in Workers nicht möglich (keine rohen TCP-Verbindungen); beide
 * Wege sind deshalb HTTP- beziehungsweise bindingbasiert.
 */

export type Versandweg = 'email-routing' | 'resend';

export const VERSANDWEGE: readonly Versandweg[] = ['email-routing', 'resend'];

export function istVersandweg(wert: unknown): wert is Versandweg {
  return typeof wert === 'string' && (VERSANDWEGE as readonly string[]).includes(wert);
}

export interface MailVersandKonfiguration {
  /**
   * Binding aus `[[send_email]]`. Fehlt, solange Email Routing nicht
   * eingerichtet und der Block in `wrangler.toml` nicht aktiviert ist.
   */
  MAIL_ROUTING?: SendEmail;
  /** Absenderadresse; muss zu einer im Cloudflare-Konto belegten Domain gehören. */
  MAIL_ABSENDER?: Zugangsdatum;
  /** Anzeigename des Absenders, reine Laufzeitvariable ohne Geheimnischarakter. */
  MAIL_ABSENDER_NAME?: string;
  /** API-Token des HTTP-Anbieters; nur für `resend` nötig. */
  MAIL_API_TOKEN?: Zugangsdatum;
}

export interface MailNachricht {
  an: string;
  betreff: string;
  /** Rückfallebene für Clients ohne HTML; beide Teile tragen denselben Inhalt. */
  text: string;
  html: string;
}

/**
 * Warum ein Versand nicht zustande kam. Bewusst mehr als „hat nicht geklappt":
 * Nichterreichbarkeit, Zeitüberschreitung, Weiterleitung und eine abgelehnte
 * Antwort verlangen völlig verschiedene Schritte beim Betreiber, und die
 * Oberfläche sieht davon nur den festen Diagnosecode (der `WorkerClient`
 * verwirft den Meldungstext des Workers). Jede Ursache braucht deshalb einen
 * eigenen Grund, sonst ist sie ohne Zugriff auf die Worker-Logs nicht zu
 * unterscheiden.
 */
export type VersandFehlerGrund =
  | 'konfiguration-fehlt'
  | 'zeitlimit'
  | 'nicht-erreichbar'
  | 'umleitung'
  | 'zugang-abgelehnt'
  | 'abgelehnt'
  /** Weg ohne HTTP-Antwort, bei dem sich die Ursache nicht eingrenzen lässt. */
  | 'upstream';

export class VersandFehler extends Error {
  constructor(
    readonly grund: VersandFehlerGrund,
    nachricht: string,
  ) {
    super(nachricht);
    this.name = 'VersandFehler';
  }
}

export interface MailVersand {
  sende(nachricht: MailNachricht): Promise<void>;
}

const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Fester Endpunkt statt einer konfigurierbaren URL: eine frei setzbare
 * Zieladresse wäre ein offener Weiterleitungspunkt für die im Token
 * steckenden Zugangsdaten (dieselbe Überlegung wie beim festen EFS-Ziel,
 * siehe CLAUDE.md).
 */
const RESEND_ENDPUNKT = 'https://api.resend.com/emails';

/** Wie bei Nextcloud/EFS: offene Upstream-Verbindungen nicht unbegrenzt halten. */
const VERSAND_ZEITGRENZE_MS = 15_000;

async function absender(umgebung: MailVersandKonfiguration): Promise<string | undefined> {
  const adresse = (await leseZugangsdatum(umgebung.MAIL_ABSENDER))?.trim();
  return adresse && EMAIL_MUSTER.test(adresse) ? adresse : undefined;
}

/**
 * Ein Tokenwert geht unverändert in den `Authorization`-Header. Zulässig sind
 * dort nur sichtbare ASCII-Zeichen; ein Zeilenumbruch, ein Steuerzeichen oder
 * ein Umlaut aus einem falsch kopierten Wert lässt `fetch()` mit einem
 * TypeError scheitern, bevor überhaupt eine Verbindung aufgebaut wird. Das ist
 * ein Konfigurationsfehler und darf nicht als „Anbieter nicht erreichbar"
 * erscheinen.
 */
const HEADERSICHER = /^[\x21-\x7e]+$/;

/**
 * Getrimmt, weil ein aus dem Dashboard kopiertes Token leicht eine
 * angehängte Zeilenumbruch- oder Leerraumsequenz mitbringt.
 */
async function resendToken(umgebung: MailVersandKonfiguration): Promise<string | undefined> {
  const token = (await leseZugangsdatum(umgebung.MAIL_API_TOKEN))?.trim();
  return token || undefined;
}

/**
 * Meldet, ob ein Weg am Worker tatsächlich eingerichtet ist. Bewusst nur ein
 * Ja/Nein je bekanntem Weg – keine Bindingliste, keine Secretnamen und keine
 * Secretlängen (siehe CLAUDE.md, "Worker und Zugangsschutz"). Die Oberfläche
 * braucht diese Auskunft, um einen nicht benutzbaren Weg ehrlich zu benennen,
 * statt den Versand erst beim Absenden scheitern zu lassen.
 */
export async function versandwegVerfuegbar(
  weg: Versandweg,
  umgebung: MailVersandKonfiguration,
): Promise<boolean> {
  if ((await absender(umgebung)) === undefined) return false;
  if (weg === 'email-routing') return umgebung.MAIL_ROUTING !== undefined;
  const token = await resendToken(umgebung);
  // Ein nicht headertaugliches Token ist genauso wenig benutzbar wie gar
  // keines – die Oberfläche soll das melden, bevor jemand auf Senden drückt.
  return token !== undefined && HEADERSICHER.test(token);
}

/** Wirft `VersandFehler('konfiguration-fehlt')`, wenn der Weg nicht eingerichtet ist. */
export async function waehleVersand(
  weg: Versandweg,
  umgebung: MailVersandKonfiguration,
): Promise<MailVersand> {
  const von = await absender(umgebung);
  if (von === undefined) {
    throw new VersandFehler(
      'konfiguration-fehlt',
      'Es ist keine gültige Absenderadresse am Worker hinterlegt.',
    );
  }
  const name = umgebung.MAIL_ABSENDER_NAME?.trim();

  if (weg === 'email-routing') {
    const binding = umgebung.MAIL_ROUTING;
    if (!binding) {
      throw new VersandFehler(
        'konfiguration-fehlt',
        'Cloudflare Email Routing ist für diesen Worker nicht eingerichtet.',
      );
    }
    return new EmailRoutingVersand(binding, von, name);
  }

  const token = await resendToken(umgebung);
  if (!token) {
    throw new VersandFehler(
      'konfiguration-fehlt',
      'Für den Versand über die Mail-API ist kein Token hinterlegt.',
    );
  }
  if (!HEADERSICHER.test(token)) {
    throw new VersandFehler(
      'konfiguration-fehlt',
      'Das hinterlegte Mail-API-Token enthält Zeichen, die in einem HTTP-Header ' +
        'nicht zulässig sind. Den Wert im Secrets Store ohne Zeilenumbruch und ' +
        'ohne Sonderzeichen neu hinterlegen.',
    );
  }
  return new ResendVersand(token, von, name);
}

/**
 * Cloudflare Email Routing über das `send_email`-Binding. Die Zieladresse muss
 * im Cloudflare-Konto als Zieladresse bestätigt sein, sonst lehnt Cloudflare
 * den Versand ab – das ist eine Eigenschaft des Wegs, keine Einschränkung
 * dieser Anwendung, und steht deshalb so in der Oberfläche.
 */
class EmailRoutingVersand implements MailVersand {
  constructor(
    private readonly binding: SendEmail,
    private readonly von: string,
    private readonly name: string | undefined,
  ) {}

  async sende(nachricht: MailNachricht): Promise<void> {
    try {
      await this.binding.send({
        from: this.name ? { name: this.name, email: this.von } : this.von,
        to: nachricht.an,
        subject: nachricht.betreff,
        text: nachricht.text,
        html: nachricht.html,
      });
    } catch (ursache) {
      // Der Upstream-Text kann die Empfängeradresse enthalten und wird
      // deshalb weder zurückgegeben noch protokolliert.
      console.error('MAIL_ROUTING_FEHLER', ursache instanceof Error ? ursache.name : 'unbekannt');
      throw new VersandFehler('upstream', 'Der Versand über Email Routing ist fehlgeschlagen.');
    }
  }
}

/** HTTP-Anbieter mit festem Endpunkt; das Token verlässt den Worker nie. */
class ResendVersand implements MailVersand {
  constructor(
    private readonly token: string,
    private readonly von: string,
    private readonly name: string | undefined,
  ) {}

  async sende(nachricht: MailNachricht): Promise<void> {
    // Eigener AbortController statt AbortSignal.timeout(): nur so lässt sich
    // nach dem Abbruch feststellen, ob das Zeitlimit zugeschlagen hat oder die
    // Verbindung selbst scheiterte – dieselbe Aufteilung wie bei EFS und
    // Nextcloud (siehe worker/src/efs.ts).
    const abbruch = new AbortController();
    const zeitlimit = setTimeout(() => abbruch.abort(), VERSAND_ZEITGRENZE_MS);
    try {
      let antwort: Response;
      try {
        antwort = await fetch(RESEND_ENDPUNKT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.name ? `${this.name} <${this.von}>` : this.von,
            to: [nachricht.an],
            subject: nachricht.betreff,
            text: nachricht.text,
            html: nachricht.html,
          }),
          // 'manual' folgt keiner Weiterleitung, macht sie aber als eigenen
          // Status sichtbar, statt sie als Transportfehler zu verschlucken.
          redirect: 'manual',
          signal: abbruch.signal,
        });
      } catch (ursache) {
        if (abbruch.signal.aborted) {
          console.error('MAIL_VERSAND_ZEITLIMIT');
          throw new VersandFehler(
            'zeitlimit',
            'Der Mailanbieter hat nicht rechtzeitig geantwortet.',
          );
        }
        // Fehlerklasse und -text, nie das Token: das trennt eine echte
        // Nichterreichbarkeit von einem ungültigen Header-Wert.
        console.error(
          'MAIL_VERSAND_NICHT_ERREICHBAR',
          redigiere(ursachenText(ursache), [this.token, this.von]),
        );
        throw new VersandFehler('nicht-erreichbar', 'Der Mailanbieter war nicht erreichbar.');
      }

      if (istUmleitung(antwort)) {
        // Weiterleitung bewusst nicht folgen: das Token darf nie an ein
        // fremdes Ziel gehen (siehe CLAUDE.md, fester Endpunkt).
        await antwort.body?.cancel();
        console.error('MAIL_VERSAND_UMLEITUNG', antwort.status);
        throw new VersandFehler(
          'umleitung',
          'Der Mailanbieter beantwortet den Versandendpunkt mit einer Weiterleitung.',
        );
      }
      if (!antwort.ok) {
        // Nur der Status, nie der Antwortkörper: er spiegelt Empfänger und
        // Absender und kann Teile des Tokens zurückmelden.
        console.error('MAIL_VERSAND_ABGELEHNT', antwort.status);
        await antwort.body?.cancel();
        if (antwort.status === 401 || antwort.status === 403) {
          // Der mit Abstand häufigste Einrichtungsfehler: Token ungültig oder
          // die Absenderdomain beim Anbieter nicht freigegeben.
          throw new VersandFehler(
            'zugang-abgelehnt',
            'Der Mailanbieter hat Token oder Absenderadresse nicht akzeptiert.',
          );
        }
        throw new VersandFehler('abgelehnt', 'Der Mailanbieter hat den Versand abgelehnt.');
      }
      await antwort.body?.cancel();
    } finally {
      clearTimeout(zeitlimit);
    }
  }
}
