import { zeitAlsMinuten } from '../../kern/kalender/datum';
import type { Angebot } from '../models/angebot.model';

/** Ob `von`/`bis` gültige `HH:MM`-Uhrzeiten mit `bis > von` bilden (kein Tagesüberlauf). */
export function istGueltigeSchichtzeit(von: string, bis: string): boolean {
  const vonMin = zeitAlsMinuten(von);
  const bisMin = zeitAlsMinuten(bis);
  return vonMin !== null && bisMin !== null && bisMin > vonMin;
}

/**
 * Fachliche Vorabprüfung vor dem Speichern, mit denselben Regeln wie der Worker (der sonst nur
 * ein knappes 400 liefert): Jede Position braucht eine Bezeichnung, eine ganzzahlige Anzahl ab 1,
 * einen Preis ab 0 und – bei Einsatzkräften – Stunden über 0; jede Schicht eine gültige Zeitspanne.
 * Leere Liste = speicherbar.
 */
export function angebotProbleme(angebot: Angebot): string[] {
  const probleme: string[] = [];
  angebot.schichten.forEach((schicht, index) => {
    const nummer = index + 1;
    if (!istGueltigeSchichtzeit(schicht.von, schicht.bis)) {
      probleme.push(`Schicht ${nummer}: Die Zeitspanne ist ungültig (Ende nach Beginn).`);
    }
    schicht.positionen.forEach((position, stelle) => {
      const wo = `Schicht ${nummer}, Position ${stelle + 1}`;
      if (!position.bezeichnung.trim()) probleme.push(`${wo}: Eine Bezeichnung fehlt.`);
      if (!Number.isInteger(position.anzahl) || position.anzahl < 1) {
        probleme.push(`${wo}: Die Anzahl muss eine ganze Zahl ab 1 sein.`);
      }
      if (!Number.isInteger(position.einzelpreisCent) || position.einzelpreisCent < 0) {
        probleme.push(`${wo}: Der Preis darf nicht negativ sein.`);
      }
      if (position.art === 'einsatzkraft' && !((position.stunden ?? 0) > 0)) {
        probleme.push(`${wo}: Die Stunden müssen größer als 0 sein.`);
      }
    });
  });
  return probleme;
}
