/**
 * Amounts in fixed columns, as the city's budget forms print them (the FRO,
 * the SAAOB), from OCR text with the layout kept.
 *
 * Each amount is placed in the column whose right edge it is nearest, the
 * edges taken from the page's complete rows, so a blank cell never shifts the
 * others.
 */
import { findMoney, type MoneyToken } from './money.ts';

/**
 * A thousands comma that OCR read as ";", ":", "/", "!" or a bracket ("124,635/654.29",
 * "101,331;856.02", "28,624)075.77" in the June 30 FRO; "2!896!838!514.53" in the Sept 30 SAAOB)
 * is put back as a comma: a digit, the mark, then exactly three digits and the next separator.
 * One character for one, so column positions do not move.
 */
const MISREAD_COMMA = /(?<=\d)[;:/!(){}[\]](?=\d{3}(?:[,.;:/!(){}[\]]|\s|$))/g;

/** The amounts on a line, every one with centavos (these forms print them on every amount). */
export const lineAmounts = (line: string): MoneyToken[] => findMoney(line.replace(MISREAD_COMMA, ','), true);

/** Right edges of the columns on a page, from rows that have every column. */
export function columnEdges(rows: MoneyToken[][], count: number): number[] | null {
  const full = rows.filter((r) => r.length === count);
  if (!full.length) return null;
  return Array.from({ length: count }, (_, i) => {
    const ends = full.map((r) => r[i].end).sort((a, b) => a - b);
    return ends[Math.floor(ends.length / 2)];
  });
}

export interface Placed<C extends string> {
  values: Partial<Record<C, number>>;
  /** Amounts that could not be placed (two nearest one column, or more than there are columns). */
  unplaced: string[];
}

/** Each amount to the nearest column edge; when two want one column, the nearer keeps it and the other is unplaced. */
export function place<C extends string>(tokens: MoneyToken[], edges: number[], columns: readonly C[]): Placed<C> {
  const held = new Map<number, MoneyToken>();
  const unplaced: string[] = [];
  for (const t of tokens) {
    let best = 0;
    for (let i = 1; i < edges.length; i++) if (Math.abs(edges[i] - t.end) < Math.abs(edges[best] - t.end)) best = i;
    const other = held.get(best);
    if (!other) held.set(best, t);
    else if (Math.abs(edges[best] - t.end) < Math.abs(edges[best] - other.end)) {
      unplaced.push(other.raw);
      held.set(best, t);
    } else unplaced.push(t.raw);
  }
  const values: Partial<Record<C, number>> = {};
  for (const [i, t] of held) values[columns[i]] = t.centavos;
  return { values, unplaced };
}

/** No complete row on the page to measure: assume blanks are at the left. */
export function placeRight<C extends string>(tokens: MoneyToken[], columns: readonly C[]): Placed<C> {
  const kept = tokens.slice(-columns.length);
  const values: Partial<Record<C, number>> = {};
  kept.forEach((t, k) => (values[columns[columns.length - kept.length + k]] = t.centavos));
  return { values, unplaced: tokens.slice(0, -columns.length).map((t) => t.raw) };
}

/** Median of the complete rows' first amount: where the amount columns begin. Numbers left of it are label text. */
export function amountZone(found: MoneyToken[][], count: number): number {
  const firsts = found.filter((a) => a.length === count).map((a) => a[0].start).sort((a, b) => a - b);
  return firsts.length ? firsts[Math.floor(firsts.length / 2)] - 6 : 0;
}
