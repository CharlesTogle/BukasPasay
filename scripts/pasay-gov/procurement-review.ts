/**
 * `pnpm run data:pasay-gov:procurement-review`: the readings in
 * data/pasay-gov/procurement-amounts.json that a person should check against
 * the scan. Writes data/pasay-gov/procurement-review.csv, one row per
 * reading, with the file and page to open.
 *
 * Reasons (a reading can have several):
 * - malformed: a comma not followed by three digits ("31,545,00.00"), or no
 *   centavos ("P9,065", "PHP 368"). These documents print every amount with
 *   centavos, so a figure without them was cut short by OCR or printed wrong.
 * - digits with spaces: a space between two digits ("7,986,3 13.57",
 *   "200, 090 00"), where OCR split a figure. The city's spaced style puts
 *   the space after a comma ("PHP 1, 497, 977.49") and is not listed.
 * Each row shows the award and value − award beside award-like columns, so a
 * reading that already agrees with the other documents can be told apart.
 *
 * - amended ABC: the ABC as amended by a bid bulletin, which decides what the
 *   award is compared with.
 * - ABC ≠ BAC resolution ABC: the invitation's (or RFQ's) ABC and the
 *   resolution's differ.
 * - notice to proceed ≠ award: the notice to proceed's amount differs from
 *   the award (the notice of award's, else the BAC resolution's).
 *
 * Readings a person already checked (checked-readings.json) are not listed;
 * neither are documents a person took off a bid. What a person reads goes in
 * checked-readings.json, and the next run drops it from this list.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { malformed } from './extract/amounts.ts';
import { pesos } from './extract/money.ts';
import { agreed } from './procurement-amounts.ts';

const ROOT = resolve(import.meta.dirname, '../../data/pasay-gov');

interface Reading { centavos: number; raw: string; file: string; page: number; review?: string; checked?: unknown }
type Bid = { key: string; title: string | null } & Record<string, Reading[]>;

/** The amount columns, as procurement-amounts.ts writes them. Page subtotals are evidence only and not listed. */
const COLUMNS = ['abc', 'bac_resolution_abc', 'abc_amended', 'award_bac_resolution', 'award_notice', 'contract', 'purchase_order', 'notice_to_proceed'] as const;

/** Columns that should equal the award, so the award and the difference are shown beside them. */
const AWARD_LIKE = new Set(['award_bac_resolution', 'award_notice', 'contract', 'purchase_order', 'notice_to_proceed']);

/** The figure itself: the raw text without the peso sign before it. */
const figure = (raw: string) => raw.replace(/^\s*P\s*(?:H\s*P)?\s*\.?\s*/i, '').trim();

/**
 * Why a reading needs a person, from its raw text. OCR's letter O for a zero
 * after a digit ("66,044,034.O0") is read as 0 first, as the parser does.
 * Purchase-order totals follow the PO rule (every PO amount has centavos, so
 * "8,099,53725" is 8,099,537.25): a last group of five digits is not malformed.
 */
export function reasons(raw: string, column: string): string[] {
  const f = figure(raw).replace(/(?<=[\d.,])[Oo]/g, '0');
  const compact = f.replace(/\s+/g, '');
  const po = column === 'purchase_order' && /,\d{5}$/.test(compact);
  const out: string[] = [];
  const bad = po ? null : malformed(compact);
  if (bad) out.push(`malformed: ${bad}`);
  if (!po && (!/[.,'’`]\d{2}$/.test(compact) || /^\d{1,3}(,\d{3})+$/.test(compact))) out.push('malformed: no centavos');
  if (/\d\s+\d/.test(f)) out.push('digits with spaces');
  return out;
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  const { bids } = JSON.parse(await readFile(join(ROOT, 'procurement-amounts.json'), 'utf8')) as { bids: Bid[] };

  const rows: Record<string, string | number>[] = [];
  let skippedChecked = 0;
  for (const b of bids) {
    const award = agreed(b.award_notice) ?? agreed(b.award_bac_resolution);
    for (const column of COLUMNS) {
      for (const r of b[column]) {
        const why = reasons(r.raw, column);
        if (column === 'notice_to_proceed' && award !== null && r.centavos !== award) why.push('notice to proceed ≠ award');
        // An amended ABC decides what the award is compared with, so a person reads it.
        if (column === 'abc_amended') why.push('amended ABC');
        // The invitation's (or RFQ's) ABC and the resolution's should match unless a bid bulletin amended it.
        const other = column === 'abc' ? agreed(b.bac_resolution_abc) : column === 'bac_resolution_abc' ? agreed(b.abc) : null;
        if (other !== null && r.centavos !== other) why.push('ABC ≠ BAC resolution ABC');
        if (!why.length) continue;
        if (r.checked) {
          skippedChecked++;
          continue;
        }
        rows.push({
          bid_id: b.key,
          title: b.title ?? '',
          reason: why.join('; '),
          column,
          value_read: pesos(r.centavos),
          award: AWARD_LIKE.has(column) ? pesos(award) : '',
          value_minus_award: AWARD_LIKE.has(column) && award !== null ? pesos(r.centavos - award) : '',
          raw: r.raw.replace(/\s+/g, ' '),
          open: `data/pasay-gov/files/${r.file}`,
          page: r.page,
        });
      }
    }
  }
  rows.sort((a, b) => String(a.reason).localeCompare(String(b.reason)) || String(a.bid_id).localeCompare(String(b.bid_id)) || String(a.column).localeCompare(String(b.column)));

  const header = ['bid_id', 'title', 'reason', 'column', 'value_read', 'award', 'value_minus_award', 'raw', 'open', 'page'];
  await writeFile(join(ROOT, 'procurement-review.csv'), [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h] ?? '')).join(','))].join('\n') + '\n');

  const count = (re: RegExp) => rows.filter((r) => re.test(String(r.reason))).length;
  console.log(`${rows.length} readings for review (${new Set(rows.map((r) => r.bid_id)).size} bids); ${skippedChecked} already checked by a person, not listed`);
  console.log(`  malformed: ${count(/malformed/)}  digits with spaces: ${count(/digits with spaces/)}  notice to proceed ≠ award: ${count(/notice to proceed/)}  amended ABC: ${count(/amended ABC/)}  ABC ≠ BAC resolution ABC: ${count(/ABC ≠/)}`);
  console.log('→ data/pasay-gov/procurement-review.csv');
}

if (import.meta.filename === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
