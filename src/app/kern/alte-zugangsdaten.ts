/** Entfernt ausschließlich die früheren Zugangsdaten dieser Origin, ohne sie zu lesen. */
export function entferneAlteZugangsdaten(): void {
  for (const schluessel of ['pep_efs_api_key', 'ausbildungsplaner.nextcloud']) {
    try {
      localStorage.removeItem(schluessel);
    } catch {
      // Gesperrter Browserspeicher verhindert weder Login noch lokale Dateibearbeitung.
    }
  }
}
