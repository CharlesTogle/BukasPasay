/**
 * `pnpm run data:pasay-gov:procurement-amounts`: for each bid, the ABC (the
 * approved budget for the contract), the award (the winning bid) and the
 * contract amount, as printed in the city's own documents, side by side.
 *
 * Reads every BAC and bulletin PDF in the catalog (and media-library PDFs
 * attached to no entry), splits each into its documents, and reads the
 * amounts with extract/amounts.ts. Documents are joined by the bid ID printed
 * in them; when none is printed (most contracts and many notices to proceed
 * print the city's own contract or NTP number instead), by the ID in the
 * file's name. Every reading says which.
 *
 * Writes data/pasay-gov/procurement-amounts.json (every reading, with file,
 * page and raw text) and procurement-amounts.csv (one row per bid).
 *
 * In the CSV a value column is filled only when all readings of it agree.
 * When readings differ, the column is empty and every reading is listed in
 * `differing_readings`. `abc_at_award` is the ABC when the contract was
 * awarded: the amended ABC where a BAC resolution states one, else the
 * resolution's ABC, else the invitation's or RFQ's; `abc_at_award_source`
 * names which. In `award_minus_*`, the award is the notice of award's,
 * else the BAC resolution's. A reading whose printed figure is malformed
 * ("31,545,00.00") is not used; it is listed in `needs_review` with its file
 * and page for a person to read. What the person reads goes in
 * data/pasay-gov/checked-readings.json; it replaces that reading's value and
 * is listed in `checked_against_scan`, with who read it. Difference columns are plain subtraction, filled only
 * when both sides have a value. Nothing is labelled.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Entry } from './catalog.ts';
import { extract, filenameId, printedId, segments, bidKey, type AmountReading, type IdReading } from './extract/amounts.ts';
import { pesos } from './extract/money.ts';

const ROOT = resolve(import.meta.dirname, '../../data/pasay-gov');
const PROCUREMENT = new Set(['bac-entries', 'bulletin-entries']);

interface Catalog { entries: Entry[]; unlinked: { url: string }[] }

/** A value with where it was read: the file, page, raw text and how the file was tied to this bid. */
interface Reading extends AmountReading {
  file: string;
  doc: string;
  id: IdReading;
  /** Set when a person read this amount from the scan (checked-readings.json); `centavos` is then their value and `raw` stays the OCR text. */
  checked?: { printed: string; note: string; checked_on: string; read_by: string };
}

interface CheckedReading {
  bid: string; column: string; file: string; page: number; printed: string; value?: string; note: string; checked_on: string; read_by: string;
  /** The document belongs to another project: the reading is taken off this bid. */
  excluded?: boolean;
}

/** "31545000.00" → 3154500000. */
const centavosOf = (value: string) => {
  const m = /^(\d+)\.(\d{2})$/.exec(value);
  if (!m) throw new Error(`checked-readings.json: value must look like 1234.56, got ${value}`);
  return Number(m[1]) * 100 + Number(m[2]);
};
interface Bid {
  key: string;
  title: string | null;
  entry_link: string | null;
  fund: string[];
  abc: Reading[];
  bac_resolution_abc: Reading[];
  /** The ABC as amended by a bid bulletin, as the BAC resolution states it. */
  abc_amended: Reading[];
  award_bac_resolution: Reading[];
  award_notice: Reading[];
  bidders: string[];
  contract: Reading[];
  /** The order's total, printed beside "(Total Amount in Words)" on its last page. */
  purchase_order: Reading[];
  /** Every page's SUB-TOTAL, a running balance (page 1 of ITB26-053 shows 10,847,400.00, page 5 21,859,600.00, and the total on page 6 is 22,238,900.00). Kept as evidence, not compared. */
  purchase_order_page_subtotals: Reading[];
  notice_to_proceed: Reading[];
  /** Readings a person took off this bid because the document belongs to another project, with why. */
  excluded: (Reading & { column: string })[];
}

const uploadPath = (url: string) => decodeURIComponent(url.split('/wp-content/uploads/')[1] ?? '');

/** Hand-typed copy, else OCR text, else the red-channel reading: the first one that has a document title. */
async function readText(base: string): Promise<string | null> {
  let first: string | null = null;
  for (const path of [join(ROOT, 'manual', `${base}.txt`), join(ROOT, 'ocr', `${base}.txt`), join(ROOT, 'ocr', `${base}.red.txt`)]) {
    if (!existsSync(path)) continue;
    const text = await readFile(path, 'utf8');
    first ??= text;
    if (segments(text).length) return text;
  }
  return first;
}

/** The distinct values among readings, in centavos. Readings marked for review are left out. */
export const distinct = (rs: { centavos: number; review?: string }[]) => [...new Set(rs.filter((r) => !r.review).map((r) => r.centavos))];
/** The value when every reading agrees, else null. */
export const agreed = (rs: { centavos: number; review?: string }[]) => {
  const d = distinct(rs);
  return d.length === 1 ? d[0] : null;
};
const minus = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);

const csvCell = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  const catalog = JSON.parse(await readFile(join(ROOT, 'catalog.json'), 'utf8')) as Catalog;

  // Bid titles from the site's own listing, keyed by the listed series.
  const listed = new Map<string, Entry>();
  for (const e of catalog.entries) {
    if (!PROCUREMENT.has(e.collection)) continue;
    const series = e.fields.field_1 ?? e.fields.Series ?? '';
    const m = /(ITB|SVP|RFQ|EPA|REI|NPCS|NP)\s*-?\s*(\d{2,4})\s*-\s*(\d{2,3})(?:\s*-\s*(\d{3}))?/i.exec(series);
    const key = m && bidKey(m[1], m[2], m[3], m[4]);
    if (key && !listed.has(key)) listed.set(key, e);
  }

  const files = [
    ...new Set([
      ...catalog.entries.filter((e) => PROCUREMENT.has(e.collection)).flatMap((e) => e.documents.map((d) => uploadPath(d.url))),
      ...catalog.unlinked.map((u) => uploadPath(u.url)),
    ]),
  ].filter((f) => /\.pdf$/i.test(f)).sort();

  const bids = new Map<string, Bid>();
  const bid = (key: string): Bid => {
    let b = bids.get(key);
    if (!b) {
      const e = listed.get(key);
      b = { key, title: e?.title ?? null, entry_link: e?.link ?? null, fund: [], abc: [], bac_resolution_abc: [], abc_amended: [], award_bac_resolution: [], award_notice: [], bidders: [], contract: [], purchase_order: [], purchase_order_page_subtotals: [], notice_to_proceed: [], excluded: [] };
      bids.set(key, b);
    }
    return b;
  };
  const noId: { file: string; doc: string; page: number }[] = [];
  let missingText = 0;

  for (const file of files) {
    const base = file.replace(/\.pdf$/i, '');
    const text = await readText(base);
    if (text === null) {
      missingText++;
      continue;
    }
    for (const seg of segments(text)) {
      const x = extract(seg);
      if (!x.abc && !x.award && !x.amount && !x.subtotals?.length && !x.fund) continue;
      const id = printedId(seg.text) ?? filenameId(file.split('/').pop()!);
      if (!id) {
        noId.push({ file, doc: seg.type, page: seg.page });
        continue;
      }
      const b = bid(id.key);
      const r = (a: AmountReading): Reading => ({ ...a, file, doc: seg.type, id });
      if (x.fund && !b.fund.includes(x.fund)) b.fund.push(x.fund);
      if (x.bidder && !b.bidders.includes(x.bidder)) b.bidders.push(x.bidder);
      if ((seg.type === 'bid-invitation' || seg.type === 'request-for-quotation') && x.abc) b.abc.push(r(x.abc));
      if (seg.type === 'bac-resolution') {
        if (x.abc) b.bac_resolution_abc.push(r(x.abc));
        if (x.amended) b.abc_amended.push(r(x.amended));
        if (x.award) b.award_bac_resolution.push(r(x.award));
      }
      if (seg.type === 'notice-of-award' && x.award) b.award_notice.push(r(x.award));
      if (seg.type === 'notice-to-proceed' && x.amount) b.notice_to_proceed.push(r(x.amount));
      if (seg.type === 'contract-purchase-order') {
        if (x.amount) b.contract.push(r(x.amount));
        b.purchase_order_page_subtotals.push(...(x.subtotals ?? []).map(r));
        b.purchase_order.push(...(x.totals ?? []).map(r));
      }
    }
  }

  // A person's reading of the scan replaces the flagged OCR value at the same place. One that matches nothing is an error, not skipped.
  const { readings: checked } = JSON.parse(await readFile(join(ROOT, 'checked-readings.json'), 'utf8')) as { readings: CheckedReading[] };
  for (const c of checked) {
    const list = (bids.get(c.bid) as unknown as Record<string, Reading[]> | undefined)?.[c.column];
    const target = list?.find((r) => r.file === c.file && r.page === c.page);
    // Only a person's reading of the scan replaces OCR; a reading by a model is just another reading.
    if (c.read_by !== 'person') throw new Error(`checked-readings.json: ${c.bid} ${c.column} is read by "${c.read_by}"; only "person" is accepted`);
    if (!target) throw new Error(`checked-readings.json: no ${c.column} reading for ${c.bid} at ${c.file} p${c.page}`);
    if (c.excluded) {
      list!.splice(list!.indexOf(target), 1);
      bids.get(c.bid)!.excluded.push({ ...target, column: c.column, checked: { printed: c.printed, note: c.note, checked_on: c.checked_on, read_by: c.read_by } });
      continue;
    }
    target.centavos = centavosOf(c.value!);
    target.checked = { printed: c.printed, note: c.note, checked_on: c.checked_on, read_by: c.read_by };
    delete target.review;
  }

  const sorted = [...bids.values()].sort((a, b) => a.key.localeCompare(b.key));
  const COLUMNS = ['abc', 'bac_resolution_abc', 'abc_amended', 'award_bac_resolution', 'award_notice', 'contract', 'purchase_order', 'notice_to_proceed'] as const;

  const header = [
    'bid_id', 'title', 'fund', 'bidder',
    'abc', 'bac_resolution_abc', 'abc_amended', 'abc_at_award', 'abc_at_award_source', 'award_bac_resolution', 'award_notice', 'contract', 'purchase_order', 'notice_to_proceed',
    'abc_at_award_minus_award', 'abc_minus_award_bac_resolution', 'abc_minus_award_notice', 'award_minus_contract', 'award_minus_purchase_order', 'award_minus_notice_to_proceed',
    'differing_readings', 'needs_review', 'checked_against_scan', 'ids_from_filename',
  ];
  const rows = sorted.map((b) => {
    const v = Object.fromEntries(COLUMNS.map((c) => [c, agreed(b[c])])) as Record<(typeof COLUMNS)[number], number | null>;
    // The award: the notice of award's, else the BAC resolution's (the two agree wherever both are read).
    const award = v.award_notice ?? v.award_bac_resolution;
    // The ABC when the contract was awarded: as amended by a bid bulletin, else as the BAC resolution states it, else the invitation's or RFQ's.
    const [abcAtAward, abcSource] =
      v.abc_amended !== null ? [v.abc_amended, 'abc_amended'] : v.bac_resolution_abc !== null ? [v.bac_resolution_abc, 'bac_resolution_abc'] : v.abc !== null ? [v.abc, 'abc'] : [null, ''];
    const differing = COLUMNS.filter((c) => distinct(b[c]).length > 1).map((c) => `${c}: ${distinct(b[c]).map(pesos).join(' / ')}`);
    const review = COLUMNS.flatMap((c) => b[c].filter((r) => r.review).map((r) => `${c}: ${r.raw.replace(/\s+/g, ' ')} (${r.file} p${r.page}) ${r.review}`));
    const byPerson = COLUMNS.flatMap((c) => b[c].filter((r) => r.checked).map((r) => `${c}: ${pesos(r.centavos)} (${r.file} p${r.page}, read by ${r.checked!.read_by}, ${r.checked!.checked_on})`));
    const excludedText = b.excluded.map((r) => `${r.column} ${pesos(r.centavos)} (${r.file} p${r.page}) excluded: ${r.checked!.note}`);
    const fromFilename = COLUMNS.flatMap((c) => b[c]).filter((r) => r.id.source === 'filename').length;
    return [
      b.key, b.title, b.fund.join(' / '), b.bidders.join(' / '),
      pesos(v.abc), pesos(v.bac_resolution_abc), pesos(v.abc_amended), pesos(abcAtAward), abcSource, pesos(v.award_bac_resolution), pesos(v.award_notice), pesos(v.contract), pesos(v.purchase_order), pesos(v.notice_to_proceed),
      pesos(minus(abcAtAward, award)), pesos(minus(v.abc, v.award_bac_resolution)), pesos(minus(v.abc, v.award_notice)), pesos(minus(award, v.contract)), pesos(minus(award, v.purchase_order)), pesos(minus(award, v.notice_to_proceed)),
      differing.join('; '), review.join('; '), [...byPerson, ...excludedText].join('; '), fromFilename || '',
    ];
  });
  await writeFile(join(ROOT, 'procurement-amounts.csv'), [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n');

  const has = (c: (typeof COLUMNS)[number]) => sorted.filter((b) => b[c].length).length;
  const counts = {
    files_read: files.length - missingText,
    files_without_text: missingText,
    bids: sorted.length,
    with: Object.fromEntries(COLUMNS.map((c) => [c, has(c)])),
    with_abc_and_award_and_contract_or_po: sorted.filter((b) => (b.abc.length || b.bac_resolution_abc.length || b.abc_amended.length) && (b.award_bac_resolution.length || b.award_notice.length) && (b.contract.length || b.purchase_order.length)).length,
    documents_with_amounts_but_no_bid_id: noId.length,
  };
  await writeFile(
    join(ROOT, 'procurement-amounts.json'),
    JSON.stringify({ about: 'Per bid: every amount read from the city\'s documents, with file, page, raw text and where its bid ID was read. See scripts/pasay-gov/procurement-amounts.ts.', counts, no_bid_id: noId, bids: sorted }, null, 1) + '\n',
  );
  console.log(JSON.stringify(counts, null, 2));
  console.log('→ data/pasay-gov/procurement-amounts.json, procurement-amounts.csv');
}

if (import.meta.filename === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
