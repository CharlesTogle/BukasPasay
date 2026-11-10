/**
 * Which office each FRO row is, from data/pasay-gov/fro-offices.json: the
 * current-year office rows of each sector, typed from the scan in printed
 * order. OCR garbles the offices' names and row numbers (and the city prints
 * 33 twice), so a row is matched by its place in its sector: the n-th office
 * row between a sector's heading and its TOTAL line is the sector's n-th
 * entry. Supplemental-budget rows and totals are not office rows.
 *
 * When a sector of an FRO has more or fewer office rows than the file lists
 * (a row OCR lost or split), none of that sector's rows get an office, and
 * the sector is reported with both counts. Nothing is matched by guessing.
 */
import type { FroRow } from './fro.ts';

export interface FroOffice {
  printed: string;
  implementing_unit: string;
  mfo_ppa: string;
  department_id: number | null;
}

export type FroOffices = Record<string, FroOffice[]>;

/** Where each sector's office rows start (its heading, part of the first row's label) and end. */
const SECTORS: { code: string; start: RegExp; end: RegExp }[] = [
  { code: 'GPSS', start: /GENERAL PUBLIC SERVICE/i, end: /TOTAL\s*GPSS/i },
  { code: 'SSS', start: /SOCIAL SERV/i, end: /SUBTOTAL\s*SSS/i },
  { code: 'ESS', start: /ECONOMIC SERVICE/i, end: /TOTAL\s*ESS/i },
  { code: 'OSS', start: /OTHER SERVICE/i, end: /TOTAL\s*[0O]+SS/i },
];

export interface OfficeMatch {
  /** For each row of the input, its sector and office; null for rows outside the office rows or in a sector that did not match. */
  offices: ({ sector: string; office: FroOffice } | null)[];
  /** Sectors whose office-row count differs from the file's. */
  unmatched: { sector: string; rows: number; listed: number }[];
}

export function matchOffices(rows: FroRow[], listed: FroOffices): OfficeMatch {
  const offices: OfficeMatch['offices'] = rows.map(() => null);
  const unmatched: OfficeMatch['unmatched'] = [];
  for (const { code, start, end } of SECTORS) {
    const from = rows.findIndex((r) => start.test(r.label.join(' ')));
    const to = from < 0 ? -1 : rows.findIndex((r, i) => i > from && end.test(r.label.join(' ')));
    const entries = listed[code] ?? [];
    // The first row's label can begin with the text above the heading (the previous sector's
    // "SUBTOTAL SWD" in the July 31 FRO); only the lines after the heading are this row's.
    const own = (r: FroRow, i: number) =>
      (i === from ? r.label.slice(r.label.findIndex((l) => start.test(l)) + 1) : r.label).join(' ');
    const at =
      from < 0 || to < 0
        ? []
        : rows
            .map((r, i) => ({ r, i }))
            .slice(from, to)
            .filter(({ r, i }) => !/TOTAL|Supplemental/i.test(own(r, i)))
            .map(({ i }) => i);
    if (at.length !== entries.length) {
      unmatched.push({ sector: code, rows: at.length, listed: entries.length });
      continue;
    }
    at.forEach((i, n) => (offices[i] = { sector: code, office: entries[n] }));
  }
  return { offices, unmatched };
}
