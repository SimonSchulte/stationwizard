/** Wird geworfen, wenn die Version beim Speichern nicht mehr aktuell ist (HTTP 412). */
export class EinsatzplanungKonfliktFehler extends Error {
  constructor(readonly ressource: string) {
    super(
      `${ressource} wurde zwischenzeitlich geändert. Der lokale Stand bleibt erhalten; bitte den aktuellen Stand laden und die Änderungen zusammenführen.`,
    );
    this.name = 'EinsatzplanungKonfliktFehler';
  }
}

const BEREITS_VORHANDEN_TEXTE: Record<string, string> = {
  EINSATZPLANUNG_VERANSTALTUNG_VERGEBEN: 'Zu dieser Veranstaltung gibt es bereits einen Einsatz.',
  EINSATZPLANUNG_BEREITS_VORHANDEN: 'Dieser Eintrag existiert bereits.',
};

/** HTTP 409: Id oder Aufbau existiert schon, oder die HiOrg-Veranstaltung ist vergeben. */
export class EinsatzplanungBereitsVorhandenFehler extends Error {
  constructor(
    /** Fester Diagnosecode des Workers, sofern geliefert. */
    readonly code: string | null,
  ) {
    super(
      (code ? BEREITS_VORHANDEN_TEXTE[code] : null) ??
        BEREITS_VORHANDEN_TEXTE['EINSATZPLANUNG_BEREITS_VORHANDEN'],
    );
    this.name = 'EinsatzplanungBereitsVorhandenFehler';
  }

  get veranstaltungVergeben(): boolean {
    return this.code === 'EINSATZPLANUNG_VERANSTALTUNG_VERGEBEN';
  }
}
