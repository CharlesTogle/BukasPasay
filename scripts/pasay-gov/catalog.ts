/**
 * `pnpm run data:pasay-gov [-- --concurrency=N]` — catalogues everything the City of Pasay
 * publishes under pasay.gov.ph/transparency/ into data/pasay-gov/catalog.json:
 * the budget, full-disclosure and procurement reports, every Bids and Awards
 * entry, the bulletin archive (back to 2021) and the downloadable forms.
 *
 * Three sources, joined by WordPress post id:
 * 1. the REST API: every post of each collection, with its taxonomy terms;
 * 2. the listing pages: the fields and attached documents the API hides;
 * 3. the media library: PDFs attached to a post, and those attached to none.
 *
 * A post no listing shows, or one with no document, is kept and counted:
 * a gap is something to report, not to hide.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { all, text } from './wp.ts';
import { crawl, LISTINGS, type Document, type ListingItem } from './listings.ts';
import { writeSummary } from './summary.ts';

const OUT = resolve(import.meta.dirname, '../../data/pasay-gov/catalog.json');
/** Listing pages fetched at once: `--concurrency=20`. The site takes 5–8 s a page; keep it modest. */
const CONCURRENCY = Math.max(1, Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 4) || 4);

const COLLECTIONS = [
  'reports-budget', 'reports-fdpentry', 'reports-procurements',
  'bac-entries', 'bac-bid-results', 'bac-notices', 'bulletin-entries', 'downloadable-forms',
] as const;

interface WpPost { id: number; date: string; modified: string; link: string; title: { rendered: string }; [k: string]: unknown }
interface WpTaxonomy { rest_base: string; types: string[] }
interface WpTerm { id: number; name: string }
interface WpMedia { id: number; post: number | null; source_url: string; media_details?: { filesize?: number } }

export interface Entry {
  id: number;
  collection: string;
  title: string;
  /** Taxonomy name → term names (type, year, quarter, area, section…). */
  terms: Record<string, string[]>;
  /** Labelled fields from the listing pages; unlabelled ones are field_1, field_2… */
  fields: Record<string, string>;
  /** Bulletin rows imported from the old site end in `",M/D/YYYY"`: the original date. */
  original_date: string | null;
  posted: string;
  modified: string;
  link: string;
  listings: string[];
  documents: Document[];
}

/** `",12/9/2024"` at the end of a bulletin description → 2024-12-09. */
function originalDate(fields: Record<string, string>): string | null {
  const m = /",\s*(\d{1,2})\/(\d{1,2})\/(\d{4})"?\s*$/.exec(fields.Description ?? '');
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

async function main() {
  const log = (s: string) => process.stderr.write(s);

  log('REST: taxonomies, posts, media… ');
  const taxonomies = Object.values(await (await fetch('https://pasay.gov.ph/wp-json/wp/v2/taxonomies')).json() as Record<string, WpTaxonomy>);
  const termNames = new Map<string, Map<number, string>>();
  for (const t of taxonomies.filter((t) => t.types.some((ty) => (COLLECTIONS as readonly string[]).includes(ty)))) {
    termNames.set(t.rest_base, new Map((await all<WpTerm>(t.rest_base, { _fields: 'id,name' })).map((x) => [x.id, text(x.name)])));
  }
  const posts = new Map<number, { collection: string; post: WpPost }>();
  for (const collection of COLLECTIONS) for (const post of await all<WpPost>(collection)) posts.set(post.id, { collection, post });
  const media = await all<WpMedia>('media', { mime_type: 'application/pdf', _fields: 'id,post,source_url,media_details' });
  log(`${posts.size} posts, ${media.length} PDFs\n`);

  const items = new Map<number, ListingItem[]>();
  for (const path of LISTINGS) {
    const found = await crawl(path, CONCURRENCY, (done, total) => log(`\rListing ${path}: page ${done}/${total}`));
    for (const it of found) items.set(it.id, [...(items.get(it.id) ?? []), it]);
    log(`, ${found.length} items\n`);
  }

  const entries: Entry[] = [...posts.values()].map(({ collection, post }) => {
    const seen = items.get(post.id) ?? [];
    const fields = Object.assign({}, ...seen.map((s) => s.fields)) as Record<string, string>;
    const documents: Document[] = [];
    const add = (d: Document) => !documents.some((x) => x.url === d.url) && documents.push(d);
    seen.flatMap((s) => s.documents).forEach(add);
    media.filter((m) => m.post === post.id).forEach((m) => add({ label: null, url: m.source_url }));
    const terms: Record<string, string[]> = {};
    for (const [tax, names] of termNames) {
      const ids = post[tax];
      if (Array.isArray(ids) && ids.length) terms[tax] = ids.map((i: number) => names.get(i) ?? String(i));
    }
    return {
      id: post.id, collection, title: text(post.title.rendered), terms, fields, original_date: originalDate(fields),
      posted: post.date, modified: post.modified, link: post.link,
      listings: [...new Set(seen.map((s) => s.listing))], documents,
    };
  });
  entries.sort((a, b) => a.collection.localeCompare(b.collection) || b.posted.localeCompare(a.posted) || b.id - a.id);

  // PDFs in the media library that no entry links to (often a report's file uploaded but never attached).
  const linked = new Set(entries.flatMap((e) => e.documents.map((d) => d.url)));
  const unlinked = media.filter((m) => !linked.has(m.source_url)).map((m) => ({ url: m.source_url, attached_to: m.post || null }));

  await mkdir(dirname(OUT), { recursive: true });
  const catalog = { source: 'https://pasay.gov.ph/transparency/', entries, unlinked };
  await writeFile(OUT, JSON.stringify(catalog, null, 1) + '\n');
  const summaryPath = await writeSummary(catalog);

  console.log(`\n${entries.length} entries → ${OUT}`);
  for (const c of COLLECTIONS) {
    const es = entries.filter((e) => e.collection === c);
    const unlisted = es.filter((e) => !e.listings.length).length;
    const docs = es.filter((e) => e.documents.length).length;
    console.log(`  ${c.padEnd(22)} ${String(es.length).padStart(5)} entries · ${String(docs).padStart(5)} with documents · ${unlisted} on no listing page`);
  }
  const strays = [...items.keys()].filter((id) => !posts.has(id)).length;
  console.log(`  summary → ${summaryPath}`);
  console.log(`  ${linked.size} document URLs; ${unlinked.length} PDFs in the media library linked from no entry; ${strays} listing items with no REST post`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
