import { Einstellungen, Systemkonfiguration } from '../models/systemkonfiguration.model';

/**
 * Vertrag für die Persistenz der Systemkonfiguration. Gespeichert wird immer
 * der vollständige Satz Einstellungen, nie ein Teil davon – der Worker kennt
 * kein teilweises Patchen.
 */
export interface SystemkonfigurationStorage {
  laden(): Promise<Systemkonfiguration>;
  speichern(einstellungen: Einstellungen): Promise<Systemkonfiguration>;
}
