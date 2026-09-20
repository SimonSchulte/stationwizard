import { zeitAlsMinuten } from '../../kern/kalender/datum';

/** Ob `von`/`bis` gültige `HH:MM`-Uhrzeiten mit `bis > von` bilden (kein Tagesüberlauf). */
export function istGueltigeSchichtzeit(von: string, bis: string): boolean {
  const vonMin = zeitAlsMinuten(von);
  const bisMin = zeitAlsMinuten(bis);
  return vonMin !== null && bisMin !== null && bisMin > vonMin;
}
