import { Injectable } from '@angular/core';
import {
  Einsatzkraft,
  Medizinisch,
  Position,
  Taktisch,
  MEDIZINISCH_ORDER,
  TAKTISCH_ORDER,
} from '../models/planung.model';

export type MatchLevel = 'full' | 'partial' | 'mismatch' | 'neutral';

export interface Staerke {
  fuhrer: number;
  unterfuehrer: number;
  helfer: number;
  gesamt: number;
}

export const TAKTISCH_LABEL: Record<Taktisch, string> = {
  H: 'Helfer',
  KSH: 'Katastrophenschutzhelfer',
  GF: 'Gruppenführer',
  ZF: 'Zugführer',
  GdSA: 'Grundlagen der Stabsarbeit',
  VF: 'Verbandsführer',
};

export const MEDIZINISCH_LABEL: Record<Medizinisch, string> = {
  EH: 'Ersthelfer',
  SSD: 'Schulsanitätsdienst',
  SanH: 'Sanitätshelfer',
  RH: 'Rettungshelfer',
  RS: 'Rettungssanitäter',
  RA: 'Rettungsassistent',
  NotSan: 'Notfallsanitäter',
  A: 'Arzt',
  NA: 'Notarzt',
};

@Injectable({ providedIn: 'root' })
export class MatchService {
  matchLevel(position: Position, person: Einsatzkraft): MatchLevel {
    const req = position.requirements;
    let satisfied = 0;
    let total = 0;

    if (req.taktisch !== null) {
      total++;
      const reqIdx = TAKTISCH_ORDER.indexOf(req.taktisch);
      const personIdx = Math.max(
        -1,
        ...(person.tags.taktisch ?? []).map((t) => TAKTISCH_ORDER.indexOf(t)),
      );
      if (personIdx >= reqIdx) satisfied++;
    }

    if (req.medizinisch !== null) {
      total++;
      const reqIdx = MEDIZINISCH_ORDER.indexOf(req.medizinisch);
      const personIdx = Math.max(
        -1,
        ...(person.tags.medizinisch ?? []).map((t) => MEDIZINISCH_ORDER.indexOf(t)),
      );
      if (personIdx >= reqIdx) satisfied++;
    }

    if (total === 0) return 'full';
    if (satisfied === total) return 'full';
    if (satisfied > 0) return 'partial';
    return 'mismatch';
  }

  positionMatchClass(position: Position, einsatzkraft?: Einsatzkraft | null): MatchLevel {
    if (!einsatzkraft) return 'neutral';
    return this.matchLevel(position, einsatzkraft);
  }

  /** Im Browser folgen Qualifikationsfarben dem gemeinsamen Designsystem. */
  taktischColor(tag: Taktisch): { bg: string; fg: string } {
    const i = TAKTISCH_ORDER.indexOf(tag);
    if (i <= 1) return { bg: 'var(--ci-light-grey)', fg: 'var(--ci-dark-blue)' };
    if (i === 2) return { bg: 'var(--ci-blue)', fg: 'var(--ci-white)' };
    if (i <= 4) return { bg: 'var(--ci-red)', fg: 'var(--ci-white)' };
    return { bg: 'var(--ci-white)', fg: 'var(--ci-dark-blue)' };
  }

  medizinischColor(tag: Medizinisch): { bg: string; fg: string } {
    const i = MEDIZINISCH_ORDER.indexOf(tag);
    if (i <= 2) return { bg: 'var(--ci-light-grey)', fg: 'var(--ci-dark-blue)' };
    if (i === 3) return { bg: 'var(--ci-green)', fg: 'var(--ci-white)' };
    if (i === 4) return { bg: 'var(--ci-yellow)', fg: 'var(--ci-dark-blue)' };
    if (i <= 6) return { bg: 'var(--ci-red)', fg: 'var(--ci-white)' };
    return { bg: 'var(--ci-blue)', fg: 'var(--ci-white)' };
  }

  sollRole(t: Taktisch | null): 'fuhrer' | 'unterfuehrer' | 'helfer' {
    if (t === 'ZF' || t === 'VF') return 'fuhrer';
    if (t === 'GF') return 'unterfuehrer';
    return 'helfer';
  }

  istRole(person: Einsatzkraft): 'fuhrer' | 'unterfuehrer' | 'helfer' {
    const maxIdx = Math.max(
      -1,
      ...(person.tags.taktisch ?? []).map((t) => TAKTISCH_ORDER.indexOf(t)),
    );
    const top = maxIdx >= 0 ? TAKTISCH_ORDER[maxIdx] : null;
    if (top === 'ZF' || top === 'VF') return 'fuhrer';
    if (top === 'GF') return 'unterfuehrer';
    return 'helfer';
  }
}
