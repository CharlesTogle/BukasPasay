/**
 * `pnpm run data:pasay-gov:summary` — counts what data/pasay-gov/catalog.json
 * holds and writes data/pasay-gov/summary.json. The catalog run writes it
 * too, so the two never disagree. Hand-written conclusions in
 * data/pasay-gov/findings.json are carried in as `findings`.
 *
 * "With documents" means at least one attached file; an entry without one is
 * a record only (a series number, description and date).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Entry } from './catalog.ts';

const ROOT = resolve(import.meta.dirname, '../../data/pasay-gov');

interface Catalog { source: string; entries: Entry[]; unlinked: { url: string }[] }
interface Tally { entries: number; with_documents: number }

/** The year an entry is dated: its listed posting date ("2023-07-12" or "July 12, 2023"), else when it was posted. */
const yearOf = (e: Entry) => (/\b(19|20)\d{2}\b/.exec(e.fields['Posting Date'] ?? '')?.[0] ?? e.posted.slice(0, 4));

function tally(entries: Entry[], key: (e: Entry) => string): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const e of entries) {
    const t = (out[key(e)] ??= { entries: 0, with_documents: 0 });
    t.entries++;
    if (e.documents.length) t.with_documents++;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export function summarise(catalog: Catalog) {
  const { entries } = catalog;
  const bulletin = entries.filter((e) => e.collection === 'bulletin-entries');
  const bac = entries.filter((e) => e.collection === 'bac-entries');
  return {
    source: catalog.source,
    generated_at: new Date().toISOString(),
    totals: {
      entries: entries.length,
      with_documents: entries.filter((e) => e.documents.length).length,
      document_urls: new Set(entries.flatMap((e) => e.documents.map((d) => d.url))).size,
      unlinked_media_pdfs: catalog.unlinked.length,
      on_no_listing_page: entries.filter((e) => !e.listings.length).length,
    },
    by_collection: tally(entries, (e) => e.collection),
    bulletin: {
      by_year: tally(bulletin, yearOf),
      by_category: tally(bulletin, (e) => e.terms['bulletin-type']?.[0] ?? '(none)'),
    },
    bids_and_awards: {
      by_year: tally(bac, yearOf),
      by_type: tally(bac, (e) => e.terms['bac-type']?.[0] ?? '(none)'),
      by_area: tally(bac, (e) => e.terms['bac-area']?.[0] ?? '(none)'),
    },
  };
}

export async function writeSummary(catalog: Catalog): Promise<string> {
  const path = `${ROOT}/summary.json`;
  const findings = await readFile(`${ROOT}/findings.json`, 'utf8').then((s) => JSON.parse(s) as unknown, () => null);
  await writeFile(path, JSON.stringify({ ...summarise(catalog), findings }, null, 2) + '\n');
  return path;
}

if (import.meta.filename === process.argv[1]) {
  const catalog = JSON.parse(await readFile(`${ROOT}/catalog.json`, 'utf8')) as Catalog;
  console.log(`→ ${await writeSummary(catalog)}`);
}
