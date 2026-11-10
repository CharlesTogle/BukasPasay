/** A small, polite client for pasay.gov.ph (WordPress + JetEngine). */

export const ORIGIN = 'https://pasay.gov.ph';
export const HEADERS = { 'User-Agent': 'Bukas Pasay data catalog (+https://bukas-pasay.6digits.dev)' };

/** GET with retries (backoff on network errors, 429 and 5xx). */
export async function get(url: string, tries = 4): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return res;
      if (attempt >= tries || (res.status !== 429 && res.status < 500)) throw new Error(`${res.status} ${res.statusText}: ${url}`);
    } catch (err) {
      if (attempt >= tries) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

/** Every item of a REST collection (/wp-json/wp/v2/<path>), following X-WP-TotalPages. */
export async function all<T>(path: string, query: Record<string, string> = {}): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const res = await get(`${ORIGIN}/wp-json/wp/v2/${path}?${new URLSearchParams({ ...query, per_page: '100', page: String(page) })}`);
    pages = Number(res.headers.get('x-wp-totalpages') ?? 1);
    items.push(...((await res.json()) as T[]));
  }
  return items;
}

/** Runs `fn` over `items`, `limit` at a time, keeping order. */
export async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Decodes the HTML entities WordPress puts in titles and fields, and collapses whitespace. */
export function text(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, n: string) => named[n] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}
