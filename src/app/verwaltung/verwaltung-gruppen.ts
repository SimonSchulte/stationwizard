/**
 * Gruppierung der Verwaltungsaufgaben. Einzige Quelle für die Verwaltungs-Startseite und den
 * Zweig „Verwaltung“ im Seitenmenü, damit beide nicht auseinanderlaufen.
 */
export interface VerwaltungEintrag {
  titel: string;
  icon: string;
  ziel: string;
  /** Beschriftung der Aktionszeile der Karte. */
  aktion: string;
  beschreibung: string;
}

export interface VerwaltungGruppe {
  id: string;
  titel: string;
  icon: string;
  beschreibung: string;
  eintraege: readonly VerwaltungEintrag[];
}

export const VERWALTUNG_GRUPPEN: readonly VerwaltungGruppe[] = [
  {
    id: 'zugang',
    titel: 'Zugang und System',
    icon: 'tune',
    beschreibung: 'Wer welche Rolle hat und wie der Betrieb eingestellt ist.',
    eintraege: [
      {
        titel: 'Benutzerverwaltung',
        icon: 'manage_accounts',
        ziel: '/verwaltung/benutzer',
        aktion: 'Benutzerverwaltung öffnen',
        beschreibung:
          'Wer sich bereits angemeldet hat einsehen und eine Rolle zuweisen. Wer sich anmelden darf, entscheidet weiterhin die Zugriffsliste in Cloudflare Access.',
      },
      {
        titel: 'Systemkonfiguration',
        icon: 'settings',
        ziel: '/verwaltung/systemkonfiguration',
        aktion: 'Systemkonfiguration öffnen',
        beschreibung:
          'Betriebseinstellungen wie den Mailversand-Weg des Kilometerstandsberichts setzen. Zugangsdaten bleiben davon unberührt; sie stehen ausschließlich am Worker. Vorschau und Versand selbst stehen im Fahrzeugmodul unter „Kilometerübersicht“.',
      },
    ],
  },
  {
    id: 'vorlagen',
    titel: 'Dokumentvorlagen',
    icon: 'description',
    beschreibung:
      'Word- und PDF-Formulare, die die Fachmodule beim Erstellen von Dokumenten füllen.',
    eintraege: [
      {
        titel: 'Führerschein-Vorlage',
        icon: 'description',
        ziel: '/verwaltung/fuehrerschein-vorlage',
        aktion: 'Vorlage öffnen',
        beschreibung:
          'Die Word-Vorlage hinterlegen oder ersetzen, mit der die Führerscheinliste im Personalmodul Name, Führerscheindatum und -nummer füllt.',
      },
      {
        titel: 'Ehrungsantrag-Vorlage',
        icon: 'picture_as_pdf',
        ziel: '/verwaltung/ehrungsantrag-vorlage',
        aktion: 'Vorlage öffnen',
        beschreibung:
          'Das PDF-Formular „Antrag auf Verleihung einer Auszeichnung“ hinterlegen oder ersetzen, das die Seite „Offene Ehrungen“ je Antrag füllt.',
      },
      {
        titel: 'Schadensmeldung-Vorlage',
        icon: 'picture_as_pdf',
        ziel: '/verwaltung/schadensmeldung-vorlage',
        aktion: 'Vorlage öffnen',
        beschreibung:
          'Das PDF-Formular „Schadens- und Verlustmeldung“ (Anlage 5) hinterlegen oder ersetzen, das die Meldung eines Vorgangs beim Drucken und Einreichen füllt.',
      },
    ],
  },
  {
    id: 'einsatzplanung',
    titel: 'Einsatzplanung',
    icon: 'groups',
    beschreibung: 'Vorlagen und Stammdaten für PEP und Aufbau.',
    eintraege: [
      {
        titel: 'Einsatz-Vorlagen',
        icon: 'library_books',
        ziel: '/verwaltung/einsatz-vorlagen',
        aktion: 'Vorlagen öffnen',
        beschreibung:
          'PEP- und Aufbau-Vorlagen der Einsatzplanung verwalten: PEP-Vorlagen aus einer Einsatzplandatei anlegen, Aufbau-Vorlagen im Aufbau-Editor bearbeiten, ansehen, umbenennen und löschen.',
      },
      {
        titel: 'Lager und Artikel',
        icon: 'warehouse',
        ziel: '/verwaltung/einsatz-stammdaten',
        aktion: 'Stammdaten öffnen',
        beschreibung:
          'Lager mit Reihenfolge (Laufweg) und den Artikelkatalog mit Heimatlager pflegen. Grundlage für Kisten, Wagen und die Zettel der Einsatzplanung.',
      },
      {
        titel: 'Packliste importieren',
        icon: 'upload_file',
        ziel: '/verwaltung/packliste-import',
        aktion: 'Excel-Datei übernehmen',
        beschreibung:
          'Eine Excel-Packliste einmalig als Aufbau-Vorlage übernehmen: Fahrzeuge, Wagen, Kisten und Artikel mit Lager und Platz.',
      },
    ],
  },
  {
    id: 'fahrzeuge-material',
    titel: 'Fahrzeuge und Material',
    icon: 'local_shipping',
    beschreibung: 'Stammdaten und Soll-Listen des Fuhrparks und der Materialverwaltung.',
    eintraege: [
      {
        titel: 'Fahrzeuge importieren',
        icon: 'upload_file',
        ziel: '/verwaltung/fahrzeuge-import',
        aktion: 'Import öffnen',
        beschreibung:
          'Fahrzeugstammdaten aus einer CSV-Datei anlegen, mit Vorschau und Bericht. Jedes Kennzeichen wird nur einmalig übernommen.',
      },
      {
        titel: 'Prüfvorlagen',
        icon: 'checklist',
        ziel: '/verwaltung/pruefvorlagen',
        aktion: 'Prüfvorlagen öffnen',
        beschreibung:
          'Die Soll-Listen der Materialverwaltung pflegen: Fächer, Artikel, Sollmengen und Herkunft. Ein bereits durchgeführter Fahrzeugcheck bleibt unverändert, weil er seine eigene Momentaufnahme der Liste trägt.',
      },
    ],
  },
  {
    id: 'kalender',
    titel: 'Kalender',
    icon: 'calendar_month',
    beschreibung: 'Einmalige Datenübernahme in den Kalender.',
    eintraege: [
      {
        titel: 'Kalender aus Excel übernehmen',
        icon: 'event_note',
        ziel: '/verwaltung/kalender-migration',
        aktion: 'Übernahme öffnen',
        beschreibung:
          'Die bisherige Excel-Arbeitsmappe der Ausbildungsplanung einmalig in die Kalender-Datenbank übernehmen. Nur möglich, solange die Datenbank leer ist.',
      },
    ],
  },
];
