/**
 * The public listing pages. A report's file and its labelled fields (series
 * number, posting date, the documents of an award) are JetEngine meta fields
 * the REST API does not expose; the listing pages render them. Each item is
 * `data-post-id="<id>"`, so it joins back to the REST post.
 *
 * Inside an item, Elementor widgets come in order: a `heading` is a label, the
 * next `jet-listing-dynamic-field`/`-terms` is its value (unlabelled ones are
 * numbered), and each `jet-listing-dynamic-link` is an attached document.
 */
import { ORIGIN, get, pool, text } from './wp.ts';

export const LISTINGS = [
  '/transparency/reports/city-budget-reports/',
  '/transparency/reports/full-disclosure-reports/',
  '/transparency/reports/procurement-reports/',
  '/transparency/bids-at-awards/bid-opportunities/',
  '/transparency/bids-at-awards/award-notices/',
  '/transparency/bids-at-awards/bid-bulletins/',
  '/transparency/bids-at-awards/archives/',
  '/transparency/bids-at-awards/notices/',
  '/transparency/bids-at-awards/bid-results/',
  '/transparency/bulletin/',
] as const;

export interface Document { label: string | null; url: string }
export interface ListingItem { id: number; listing: string; fields: Record<string, string>; documents: Document[] }

const pageUrl = (path: string, n: number) => `${ORIGIN}${path}${n > 1 ? `?jsf=jet-engine&pagenum=${n}` : ''}`;

/** Every item on every page of one listing, `concurrency` pages at a time. */
export async function crawl(path: string, concurrency: number, onPage?: (done: number, total: number) => void): Promise<ListingItem[]> {
  const first = await (await get(pageUrl(path, 1))).text();
  const pages = Math.max(1, ...[...first.matchAll(/data-pages="(\d+)"/g)].map((m) => Number(m[1])));
  let done = 1;
  onPage?.(done, pages);
  const rest = await pool(
    Array.from({ length: pages - 1 }, (_, i) => i + 2),
    concurrency,
    async (n) => {
      const html = await (await get(pageUrl(path, n))).text();
      onPage?.(++done, pages);
      return html;
    },
  );
  return [first, ...rest].flatMap((html) => parseItems(html, path));
}

export function parseItems(html: string, listing: string): ListingItem[] {
  const parts = html.split(/(?=data-post-id="\d+")/).slice(1);
  return parts.map((part) => {
    const id = Number(/^data-post-id="(\d+)"/.exec(part)![1]);
    const fields: Record<string, string> = {};
    const documents: Document[] = [];
    let label: string | null = null;
    let unlabelled = 0;
    for (const widget of part.split('data-widget_type="').slice(1)) {
      const kind = widget.slice(0, widget.indexOf('"'));
      const body = widget.slice(widget.indexOf('>') + 1);
      const value = text(body.replace(/<[^>]*$/, '').replace(/<[^>]+>/g, ' '));
      if (kind.startsWith('heading')) label = value;
      else if (kind.startsWith('jet-listing-dynamic-field') || kind.startsWith('jet-listing-dynamic-terms')) {
        if (value) fields[label ?? `field_${++unlabelled}`] = value;
        label = null;
      } else if (kind.startsWith('jet-listing-dynamic-link')) {
        const href = /href="([^"]+)"/.exec(body)?.[1];
        if (href && !href.startsWith('#')) documents.push({ label: value || null, url: text(href) });
      }
    }
    return { id, listing, fields, documents };
  });
}
