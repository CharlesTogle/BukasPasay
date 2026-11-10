/**
 * The Statement of Appropriations, Allotments, Obligations and Balances
 * (SAAOB), from its OCR text (pdftotext -layout; pages split by form feeds).
 *
 * Each page is one section (current year or continuing appropriations) of
 * one fund, per sector. Under each heading are its PS, MOOE, CO (and FinEx)
 * lines; unlabelled lines are totals as printed. A line with at least
 * MIN_AMOUNTS amounts is a row, its amounts placed by columns.ts. A line
 * labelled with an expense class but fewer amounts (OCR wrapped it onto two
 * lines) is kept as a row with no values and its amounts listed as unplaced.
 * `heading` is the text printed above a row's group, not a reading of which
 * sector a total belongs to.
 *
 * Nothing is judged here: values are what OCR read, and each row keeps its
 * page and the exact line.
 */
import { amountZone, columnEdges, lineAmounts, place, placeRight } from './columns.ts';

export const SAAOB_COLUMNS = [
  'appropriations', 'allotments', 'obligations', 'balance_appropriations', 'balance_allotments',
] as const;
export type SaaobColumn = (typeof SAAOB_COLUMNS)[number];

const MIN_AMOUNTS = 4;

export interface SaaobRow {
  page: number;
  /** As printed in the page header, e.g. "Continuing Appropriations - Per Sector". */
  appropriations: string | null;
  fund: string | null;
  as_of: string | null;
  /** The heading lines above this row's group ("1000 General Public Services"), as OCR read them. */
  heading: string[];
  /** PS, MOOE, CO or FINEX when the row's label reads as one; null on a total line. */
  expense_class: 'PS' | 'MOOE' | 'CO' | 'FINEX' | null;
  /** The label on the row's line (on a total line, with the text just above it), as OCR read it. */
  label: string;
  values: Partial<Record<SaaobColumn, number>>;
  unplaced: string[];
  line: string;
}

/** OCR's readings of the expense classes ("co", "Cco", "CcOo", "Capital Outlay"): letters only, repeats collapsed. */
function expenseClass(label: string): SaaobRow['expense_class'] {
  const k = label.toUpperCase().replace(/[^A-Z]/g, '').replace(/(.)\1+/g, '$1');
  return ({ PS: 'PS', MOE: 'MOOE', CO: 'CO', CAPITALOUTLAY: 'CO', FINEX: 'FINEX' } as const)[k] ?? null;
}

/** Page and column headings left of the amounts; never a row heading. */
const NOT_HEADING = /CITY OF PASAY|Appropriations|^As of|FUND$|CODE|FUNCTION|PROGRAM|^[IVXl|.\s]+(CURRENT|CONTINUING)|^(General|Special Education) Fund$/i;

export function parseSaaob(text: string): SaaobRow[] {
  const rows: SaaobRow[] = [];
  let head = { appropriations: null as string | null, fund: null as string | null, as_of: null as string | null };
  text.split('\f').forEach((pageText, p) => {
    const lines = pageText.split('\n');
    const top = lines.slice(0, 12).map((l) => l.trim());
    head = {
      appropriations: top.find((l) => /Appropriations\s*-\s*Per Sector/i.test(l)) ?? head.appropriations,
      fund: top.find((l) => /^[A-Z ]*FUND$/.test(l)) ?? head.fund,
      as_of: top.find((l) => /^As of\b/i.test(l))?.replace(/^As of\s*/i, '') ?? head.as_of,
    };
    const found = lines.map(lineAmounts);
    const zone = amountZone(found, SAAOB_COLUMNS.length);
    const amounts = found.map((a) => a.filter((t) => t.end > zone));
    const isRow = amounts.map((a) => a.length >= MIN_AMOUNTS);
    const edges = columnEdges(amounts.filter((_, i) => isRow[i]), SAAOB_COLUMNS.length);
    let heading: string[] = [];
    let pending: string[] = [];
    lines.forEach((line, i) => {
      const cut = isRow[i] ? Math.min(zone || Infinity, amounts[i][0].start) : zone || line.length;
      const left = line.slice(0, cut).trim();
      const cls = expenseClass(left);
      if (!isRow[i] && !(cls && amounts[i].length)) {
        // Text reaching into the amount columns is a page or column heading; signatures end the table.
        if (line.slice(cut).trim() && !amounts[i].length) pending = [];
        else if (left && !NOT_HEADING.test(left)) pending.push(left);
        if (/^\s*(Prepared|Reviewed|Noted)\b/i.test(line)) pending = [];
        return;
      }
      if (cls && pending.length) {
        heading = pending;
        pending = [];
      }
      const label = cls ? left : [...pending.splice(0), left].filter(Boolean).join(' ');
      const placed = !isRow[i]
        ? { values: {}, unplaced: amounts[i].map((t) => t.raw) }
        : edges ? place(amounts[i], edges, SAAOB_COLUMNS) : placeRight(amounts[i], SAAOB_COLUMNS);
      rows.push({ page: p + 1, ...head, heading, expense_class: cls, label, values: placed.values, unplaced: placed.unplaced, line: line.trimEnd() });
    });
  });
  return rows;
}
