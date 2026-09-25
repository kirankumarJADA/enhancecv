// Small shared helpers for template routes (kept out of the router file).

import type { ResumeData } from '../types';

/** Derive years of experience from the earliest employment year on the CV. */
export function yearsOfExperienceHint(master: ResumeData): number | null {
  let earliest: number | null = null;
  for (const e of master.experience) {
    const m = (e.startDate || '').match(/(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      if (y > 1950 && y <= new Date().getFullYear() && (earliest === null || y < earliest)) earliest = y;
    }
  }
  return earliest === null ? null : Math.max(0, new Date().getFullYear() - earliest);
}
