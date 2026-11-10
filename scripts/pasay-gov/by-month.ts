/**
 * `pnpm run data:pasay-gov:by-month`: groups every catalog entry and every
 * legacy-2022 record by year and month, and writes
 * data/pasay-gov/by-month.json.
 *
 * Each item's date is its posting date:
 * - catalog entries use the listed "Posting Date" when there is one (the same
 *   rule summary.ts uses for its by_year counts), else the WordPress `posted`
 *   time. `date_source` says which one was used.
 * - legacy-2022 records use the date part of their `posted` timestamp as
 *   stored. Most fall at 07:00 or 08:00 UTC (midnight on the old server's
 *   clock), so the UTC date is the date that was entered.
 *
 * A posting date is when the city put a record online, not the period a
 * report covers (an FRO as of September 30 may be posted in October). The
 * period is left in each item's fields as printed.
 *
 * Media-library PDFs attached to no entry (`catalog.unlinked`) have no
 * posting date and are not grouped. The output has no timestamp, so the same
 * inputs always give the same file.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Entry } from './catalog.ts';

const ROOT = resolve(import.meta.dirname, '../../data/pasay-gov');

interface Catalog { source: string; entries: Entry[]; unlinked: { url: string }[] }
interface LegacyFile {
  category: string;
  endpoint: string;
  rows: { id: number; title: string; description: string; posted: string; file_endpoint: string | null }[];
}

interface Item {
  date: string;
  date_source: 'Posting Date' | 'posted';
  id: number;
  collection: string;
  /** The entry's type as the site files it (BAC type, bulletin category, report type). Empty when the site gives none. */
  type: string;
  /** The series or bid ID as listed, when the collection has one. */
  series: string;
  title: string;
  link: string;
  documents: string[];
}
interface LegacyItem {
  date: string;
  endpoint: string;
  category: string;
  id: number;
  title: string;
  description: string;
  file_endpoint: string | null;
}
interface Month { entries: number; with_documents: number; legacy_2022: number; by_collection: Record<string, number>; items: Item[]; legacy: LegacyItem[] }
interface Year { entries: number; with_documents: number; legacy_2022: number; by_collection: Record<string, number>; months: Record<string, Month> }

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** "2023-07-12" or "July 12, 2023" → "2023-07-12"; anything else → null. */
export function isoDay(text: string | undefined): string | null {
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const long = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text.trim());
  const mm = long && MONTHS[long[1].toLowerCase()];
  return mm ? `${long[3]}-${mm}-${long[2].padStart(2, '0')}` : null;
}

function typeOf(e: Entry): string {
  switch (e.collection) {
    case 'bac-entries': return e.terms['bac-type']?.[0] ?? e.fields.field_2 ?? '';
    case 'bulletin-entries': return e.terms['bulletin-type']?.[0] ?? e.fields.Category ?? '';
    case 'reports-budget':
    case 'reports-fdpentry':
    case 'reports-procurements': return e.fields.field_1 ?? '';
    default: return '';
  }
}

function seriesOf(e: Entry): string {
  if (e.collection === 'bac-entries') return e.fields.field_1 ?? '';
  if (e.collection === 'bulletin-entries') return e.fields.Series ?? '';
  return '';
}

export function toItem(e: Entry): Item {
  const listed = isoDay(e.fields['Posting Date']);
  return {
    date: listed ?? e.posted.slice(0, 10),
    date_source: listed ? 'Posting Date' : 'posted',
    id: e.id,
    collection: e.collection,
    type: typeOf(e),
    series: seriesOf(e),
    title: e.title,
    link: e.link,
    documents: e.documents.map((d) => d.url),
  };
}

const sortKeys = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

export function groupByMonth(entries: Entry[], legacy: LegacyFile[]) {
  const years: Record<string, Year> = {};
  const monthOf = (date: string) => {
    const y = (years[date.slice(0, 4)] ??= { entries: 0, with_documents: 0, legacy_2022: 0, by_collection: {}, months: {} });
    const m = (y.months[date.slice(0, 7)] ??= { entries: 0, with_documents: 0, legacy_2022: 0, by_collection: {}, items: [], legacy: [] });
    return [y, m] as const;
  };

  for (const item of entries.map(toItem)) {
    const [y, m] = monthOf(item.date);
    for (const t of [y, m]) {
      t.entries++;
      if (item.documents.length) t.with_documents++;
      t.by_collection[item.collection] = (t.by_collection[item.collection] ?? 0) + 1;
    }
    m.items.push(item);
  }
  for (const file of legacy) {
    for (const r of file.rows) {
      const [y, m] = monthOf(r.posted.slice(0, 10));
      y.legacy_2022++;
      m.legacy_2022++;
      m.legacy.push({ date: r.posted.slice(0, 10), endpoint: file.endpoint, category: file.category, id: r.id, title: r.title, description: r.description, file_endpoint: r.file_endpoint });
    }
  }

  for (const y of Object.values(years)) {
    y.by_collection = sortKeys(y.by_collection);
    for (const m of Object.values(y.months)) {
      m.by_collection = sortKeys(m.by_collection);
      m.items.sort((a, b) => a.date.localeCompare(b.date) || a.collection.localeCompare(b.collection) || a.id - b.id);
      m.legacy.sort((a, b) => a.date.localeCompare(b.date) || a.endpoint.localeCompare(b.endpoint) || a.id - b.id);
    }
    y.months = sortKeys(y.months);
  }
  return sortKeys(years);
}

if (import.meta.filename === process.argv[1]) {
  const catalog = JSON.parse(await readFile(`${ROOT}/catalog.json`, 'utf8')) as Catalog;
  const legacyDir = `${ROOT}/legacy-2022`;
  const legacy = await Promise.all(
    (await readdir(legacyDir))
      .filter((f) => f.startsWith('GetListOf') && f.endsWith('.json'))
      .sort()
      .map(async (f) => JSON.parse(await readFile(`${legacyDir}/${f}`, 'utf8')) as LegacyFile),
  );
  const years = groupByMonth(catalog.entries, legacy);
  const out = {
    source: catalog.source,
    date_rule: 'Catalog entries: listed Posting Date, else WordPress posted time (date_source). legacy-2022: date part of the stored posted timestamp. Media PDFs attached to no entry are not grouped.',
    not_grouped: { unlinked_media_pdfs: catalog.unlinked.length },
    years,
  };
  const path = `${ROOT}/by-month.json`;
  await writeFile(path, JSON.stringify(out, null, 2) + '\n');
  console.log(`→ ${path}`);
}
