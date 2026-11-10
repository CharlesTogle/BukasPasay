/**
 * The Financial Report of Operations (LBAc Form No. 2), from its OCR text
 * (pdftotext -layout; pages split by form feeds).
 *
 * Every row prints twelve amounts in fixed columns. A line with at least
 * MIN_AMOUNTS amounts is a row, its amounts placed by columns.ts. The text lines above a row, left
 * of the amounts, are its label (office, program; a TOTAL line's name).
 *
 * Nothing is judged here: values are what OCR read, and each row keeps its
 * page and the exact line. The arithmetic between columns is the comparison
 * script's to show.
 */
import { amountZone, columnEdges, lineAmounts, place, placeRight } from './columns.ts';

export const FRO_COLUMNS = [
  'appropriation_continuing', 'appropriation_current', 'appropriation_final',
  'allotment_previous_quarter', 'allotment_this_quarter', 'allotment_total',
  'unreleased_appropriation',
  'obligation_previous_quarter', 'obligation_this_quarter', 'obligation_total',
  'unobligated_allotment', 'balance_appropriation',
] as const;
export type FroColumn = (typeof FRO_COLUMNS)[number];

const MIN_AMOUNTS = 8;

export interface FroRow {
  page: number;
  /** Section and appropriation as printed in the page header, e.g. "Current Year Appropriations - Per Sector". */
  appropriations: string | null;
  fund: string | null;
  as_of: string | null;
  /** The label lines above the amounts, as OCR read them, in order. */
  label: string[];
  values: Partial<Record<FroColumn, number>>;
  /** Amounts that could not be placed (more on the line than columns). */
  unplaced: string[];
  line: string;
}

interface PageHead { appropriations: string | null; fund: string | null; as_of: string | null }

function pageHead(lines: string[], prev: PageHead): PageHead {
  const top = lines.slice(0, 12).map((l) => l.trim());
  return {
    appropriations: top.find((l) => /Appropriations/i.test(l) && /Per Sector|Continuing|Current/i.test(l)) ?? prev.appropriations,
    fund: top.find((l) => /^[A-Z ]*FUND$/.test(l)) ?? prev.fund,
    as_of: top.find((l) => /^As of\b/i.test(l))?.replace(/^As of\s*/i, '') ?? prev.as_of,
  };
}

export function parseFro(text: string): FroRow[] {
  const rows: FroRow[] = [];
  let head: PageHead = { appropriations: null, fund: null, as_of: null };
  text.split('\f').forEach((pageText, p) => {
    const lines = pageText.split('\n');
    head = pageHead(lines, head);
    const found = lines.map(lineAmounts);
    // Numbers left of the amount columns ("Ordinance No. 035, Series of 2026") are label text.
    const zone = amountZone(found, FRO_COLUMNS.length);
    const amounts = found.map((a) => a.filter((t) => t.end > zone));
    // A row OCR split over two adjacent lines (the left columns on one, the right on the next, as
    // the June 30 FRO's Building Official and BJMP rows): neither has MIN_AMOUNTS alone, together
    // they do, and the second line's amounts carry on to the right of the first's. The row is
    // kept at the second line; `line` holds both.
    const joined = new Set<number>();
    for (let i = 0; i + 1 < lines.length; i++) {
      const [a, b] = [amounts[i], amounts[i + 1]];
      if (a.length && b.length && a.length < MIN_AMOUNTS && b.length < MIN_AMOUNTS && a.length + b.length >= MIN_AMOUNTS && b[0].end > a.at(-1)!.end) {
        amounts[i + 1] = [...a, ...b];
        amounts[i] = [];
        joined.add(i + 1);
      }
    }
    const isRow = amounts.map((a) => a.length >= MIN_AMOUNTS);
    const edges = columnEdges(amounts.filter((_, i) => isRow[i]), FRO_COLUMNS.length);
    const firstAmountAt = zone || Math.min(...amounts.filter((_, i) => isRow[i]).map((a) => a[0].start), Infinity);
    let labelStart = 0;
    lines.forEach((line, i) => {
      if (!isRow[i]) return;
      const label = lines
        .slice(labelStart, i + 1)
        .map((l) => l.slice(0, Math.min(firstAmountAt, amounts[i][0].start)).trim())
        .filter((l) => l && !/^(IMPLEMENTING|UNIT|QUARTER)\b/i.test(l) && !/Pasay City Government|FINANCIAL REPORT|Appropriations|^As of|FUND$|LBAc Form/i.test(l));
      labelStart = i + 1;
      const placed = edges ? place(amounts[i], edges, FRO_COLUMNS) : placeRight(amounts[i], FRO_COLUMNS);
      const text = joined.has(i) ? `${lines[i - 1].trimEnd()}\n${line.trimEnd()}` : line.trimEnd();
      rows.push({ page: p + 1, ...head, label, values: placed.values, unplaced: placed.unplaced, line: text });
    });
  });
  return rows;
}
