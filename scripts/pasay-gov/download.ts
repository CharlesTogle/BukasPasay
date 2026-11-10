/**
 * `pnpm run data:pasay-gov:download` — downloads every document in
 * data/pasay-gov/catalog.json (run `pnpm run data:pasay-gov` first) to
 * data/pasay-gov/files/, mirroring pasay.gov.ph's upload paths
 * (wp-content/uploads/2026/10/x.pdf → files/2026/10/x.pdf).
 *
 * Resumable: a file already on disk with the server's size is skipped. The
 * folder is git-ignored; the catalog, not the PDFs, is what the repo keeps.
 *
 *   --unlinked         also fetch media-library PDFs that no entry links to
 *   --concurrency=N    files fetched at once (default 4)
 */
import { mkdir, stat, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { get, HEADERS, pool } from './wp.ts';

const ROOT = resolve(import.meta.dirname, '../../data/pasay-gov');
const UPLOADS = 'https://pasay.gov.ph/wp-content/uploads/';
const CONCURRENCY = Math.max(1, Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 4) || 4);

interface Catalog { entries: { documents: { url: string }[] }[]; unlinked: { url: string }[] }

async function main() {
  const catalog = JSON.parse(await readFile(`${ROOT}/catalog.json`, 'utf8')) as Catalog;
  const urls = new Set(catalog.entries.flatMap((e) => e.documents.map((d) => d.url)));
  if (process.argv.includes('--unlinked')) catalog.unlinked.forEach((u) => urls.add(u.url));

  const local = [...urls].filter((u) => u.startsWith(UPLOADS));
  const external = [...urls].filter((u) => !u.startsWith(UPLOADS));
  let done = 0, fetched = 0, skipped = 0, bytes = 0;
  const failed: string[] = [];

  await pool(local, CONCURRENCY, async (url) => {
    // Paths come from the site, so keep them inside files/.
    const rel = decodeURIComponent(url.slice(UPLOADS.length)).replace(/\.\.+/g, '.');
    const path = resolve(ROOT, 'files', rel);
    try {
      // A file on disk is checked with HEAD (size only), so a resumed run downloads nothing it has.
      const have = await stat(path).then((s) => s.size, () => -1);
      const size = have < 0 ? -2 : Number((await fetch(url, { method: 'HEAD', headers: HEADERS })).headers.get('content-length') ?? -2);
      if (have === size) {
        skipped++;
      } else {
        const buf = Buffer.from(await (await get(url)).arrayBuffer());
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, buf);
        fetched++;
        bytes += buf.length;
      }
    } catch (err) {
      failed.push(`${url} (${err instanceof Error ? err.message : err})`);
    }
    process.stderr.write(`\r${++done}/${local.length}`);
  });

  console.log(`\n${fetched} downloaded (${(bytes / 1e6).toFixed(0)} MB), ${skipped} already here, ${failed.length} failed → ${ROOT}/files`);
  failed.forEach((f) => console.error(`  failed: ${f}`));
  if (external.length) console.log(`${external.length} documents are hosted elsewhere and were not fetched:\n  ${external.join('\n  ')}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
