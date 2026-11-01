import { Planung, Position, Posten, Taktisch } from '../models/planung.model';

/** Führer / Unterführer / Helfer / Gesamt, wie in der Stärkemeldung. */
export interface Staerke {
  fuhrer: number;
  unterfuehrer: number;
  helfer: number;
  gesamt: number;
}

export type StaerkeRolle = 'fuhrer' | 'unterfuehrer' | 'helfer';

/** Status einer Ist-Zahl gegenüber ihrem Soll; zugleich die CSS-Klasse der Anzeige. */
export type StaerkeStatus = 'status-neutral' | 'status-under' | 'status-over' | 'status-met';

/** Rolle, die eine Position nach ihrer taktischen Anforderung im Soll zählt. */
export function sollRolle(taktisch: Taktisch | null): StaerkeRolle {
  if (taktisch === 'ZF' || taktisch === 'VF') return 'fuhrer';
  if (taktisch === 'GF') return 'unterfuehrer';
  return 'helfer';
}

function zaehle(positionen: readonly Position[]): Staerke {
  const staerke: Staerke = { fuhrer: 0, unterfuehrer: 0, helfer: 0, gesamt: positionen.length };
  for (const position of positionen) staerke[sollRolle(position.requirements.taktisch)]++;
  return staerke;
}

/** Soll eines Postens: jede Position zählt nach ihrer Anforderung. */
export function postenSoll(posten: Posten): Staerke {
  return zaehle(posten.positions);
}

/** Ist eines Postens: nur besetzte Positionen, gezählt nach ihrer Anforderung. */
export function postenIst(posten: Posten): Staerke {
  return zaehle(posten.positions.filter((position) => position.assigned));
}

export function planungSoll(planung: Planung): Staerke {
  return zaehle(planung.posten.flatMap((posten) => posten.positions));
}

export function planungIst(planung: Planung): Staerke {
  return zaehle(
    planung.posten.flatMap((posten) => posten.positions).filter((position) => position.assigned),
  );
}

export function staerkeStatus(ist: number, soll: number): StaerkeStatus {
  if (soll === 0 && ist === 0) return 'status-neutral';
  if (ist < soll) return 'status-under';
  if (ist > soll) return 'status-over';
  return 'status-met';
}
