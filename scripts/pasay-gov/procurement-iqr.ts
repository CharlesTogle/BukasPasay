/**
 * `pnpm run data:pasay-gov:procurement-iqr`: the interquartile-range (IQR)
 * spread of the ratios between a bid's amounts, from
 * data/pasay-gov/procurement-amounts.json. Writes procurement-iqr.json (the
 * quartiles and fences of each ratio) and procurement-iqr.csv (every bid whose
 * ratio is outside the fences, with how far outside).
 *
 * Ratios, not pesos: a ₱70M building and a ₱200k catering order differ in
 * size, not in how their award compares with their budget.
 *
 *   award_bac_resolution / abc, award_notice / abc,
 *   contract / award_notice, purchase_order / award_notice
 *
 * Quartiles use linear interpolation between order statistics (the same as
 * Excel's QUARTILE.INC and R's default). Fences are Q1 − 1.5 × IQR and
 * Q3 + 1.5 × IQR. `iqrs_beyond_fence` is (ratio − fence) / IQR: negative
 * below the lower fence, positive above the upper one. When the IQR is 0
 * (most values equal), it is left empty and the ratio stands on its own.
 *
 * Only values where all readings agree are used (the CSV's rule). The output
 * is numbers only: being outside a fence is a statistical fact about the
 * spread, which can come from an OCR misread as easily as from the document,
 * so each row carries its raw readings for checking against the scan.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { agreed } from './procurement-amounts.ts';
import { pesos } from './extract/money.ts';

const ROOT = resolve(import.meta.dirname, '../../data/pasay-gov');

interface Reading { centavos: number; raw: string; file: string; page: number }
type Bid = { key: string; title: string | null } & Record<string, Reading[]>;

const RATIOS = [
  ['award_bac_resolution', 'abc'],
  ['award_notice', 'abc'],
  ['contract', 'award_notice'],
  ['purchase_order', 'award_notice'],
] as const;

/** Quantile by linear interpolation between order statistics (type 7). */
export function quantile(sorted: number[], p: number): number {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  return sorted[lo] + (h - lo) * ((sorted[lo + 1] ?? sorted[lo]) - sorted[lo]);
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;
const csvCell = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const evidence = (rs: Reading[]) => rs.map((r) => `${r.raw.replace(/\s+/g, ' ')} (${r.file} p${r.page})`).join(' | ');

async function main() {
  const { bids } = JSON.parse(await readFile(join(ROOT, 'procurement-amounts.json'), 'utf8')) as { bids: Bid[] };

  const stats = [];
  const outside = [];
  for (const [num, den] of RATIOS) {
    const name = `${num}_over_${den}`;
    const points = bids.flatMap((b) => {
      const n = agreed(b[num]);
      const d = agreed(b[den]);
      return n !== null && d ? [{ b, n, d, ratio: n / d }] : [];
    });
    const sorted = points.map((p) => p.ratio).sort((a, b) => a - b);
    if (sorted.length < 4) {
      stats.push({ ratio: name, n: sorted.length });
      continue;
    }
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const out = points.filter((p) => p.ratio < lower || p.ratio > upper);
    stats.push({
      ratio: name, n: sorted.length,
      min: round(sorted[0]), q1: round(q1), median: round(quantile(sorted, 0.5)), q3: round(q3), max: round(sorted.at(-1)!),
      iqr: round(iqr), lower_fence: round(lower), upper_fence: round(upper),
      below_lower_fence: out.filter((p) => p.ratio < lower).length,
      above_upper_fence: out.filter((p) => p.ratio > upper).length,
    });
    for (const p of out.sort((a, b) => a.ratio - b.ratio || a.b.key.localeCompare(b.b.key))) {
      const fence = p.ratio < lower ? lower : upper;
      outside.push({
        bid_id: p.b.key, title: p.b.title, ratio: name,
        numerator: pesos(p.n), denominator: pesos(p.d), value: round(p.ratio),
        lower_fence: round(lower), upper_fence: round(upper),
        iqrs_beyond_fence: iqr ? round((p.ratio - fence) / iqr) : null,
        numerator_readings: evidence(p.b[num]), denominator_readings: evidence(p.b[den]),
      });
    }
  }

  await writeFile(
    join(ROOT, 'procurement-iqr.json'),
    JSON.stringify({ about: 'IQR spread of the ratios between each bid\'s amounts. See scripts/pasay-gov/procurement-iqr.ts.', method: 'type-7 quartiles; fences Q1 - 1.5*IQR, Q3 + 1.5*IQR', stats, outside_fences: outside }, null, 1) + '\n',
  );
  const header = ['bid_id', 'title', 'ratio', 'numerator', 'denominator', 'value', 'lower_fence', 'upper_fence', 'iqrs_beyond_fence', 'numerator_readings', 'denominator_readings'] as const;
  await writeFile(
    join(ROOT, 'procurement-iqr.csv'),
    [header.join(','), ...outside.map((o) => header.map((h) => csvCell(o[h])).join(','))].join('\n') + '\n',
  );
  console.table(stats);
  console.log(`${outside.length} rows outside the fences → data/pasay-gov/procurement-iqr.json, procurement-iqr.csv`);
}

if (import.meta.filename === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
