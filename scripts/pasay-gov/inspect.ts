/**
 * `pnpm run data:pasay-gov:inspect` — checks every downloaded PDF in
 * data/pasay-gov/files/ (run `data:pasay-gov:download` first) and writes
 * data/pasay-gov/pdf-types.json: is each one text, or pictures of pages?
 *
 * Per page, with poppler (pdftotext, pdfimages; `pacman -S poppler`):
 * - text     the page has a text layer (≥ MIN_CHARS characters) and no page-sized image;
 * - scan     a page-sized image and no text: a picture of paper, unreadable by machine;
 * - scan+ocr a page-sized image with a text layer over it (OCR'd or a print-to-PDF of a scan);
 * - blank    neither.
 * A document is `text`, `scan`, `scan+ocr` when every page is, else `mixed`.
 */
import { execFile } from 'node:child_process';
import { readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pool } from './wp.ts';

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '../../data/pasay-gov');
const FILES = join(ROOT, 'files');
const MIN_CHARS = 40;
/** An image this large (pixels) is taken to be a whole scanned page: ~A4 at 100 dpi. */
const PAGE_PIXELS = 800 * 1000;

type PageKind = 'text' | 'scan' | 'scan+ocr' | 'blank';

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(p)));
    else if (/\.pdf$/i.test(d.name)) out.push(p);
  }
  return out;
}

async function inspect(path: string) {
  const opts = { maxBuffer: 256 * 1024 * 1024 };
  // pdftotext separates pages with a form feed; pdfimages -list gives one row per image with its page.
  const [{ stdout: txt }, { stdout: imgs }] = await Promise.all([
    run('pdftotext', ['-q', path, '-'], opts),
    run('pdfimages', ['-list', path], opts),
  ]);
  const chars = txt.split('\f').map((p) => p.replace(/\s+/g, '').length);
  const bigImage = new Set<number>();
  for (const line of imgs.split('\n').slice(2)) {
    const [page, , , width, height] = line.trim().split(/\s+/).map(Number);
    if (width * height >= PAGE_PIXELS) bigImage.add(page);
  }
  const pages = Math.max(chars.length - (chars.at(-1) === 0 ? 1 : 0), 1);
  const kinds: PageKind[] = Array.from({ length: pages }, (_, i) => {
    const hasText = (chars[i] ?? 0) >= MIN_CHARS;
    const scanned = bigImage.has(i + 1);
    return scanned ? (hasText ? 'scan+ocr' : 'scan') : hasText ? 'text' : 'blank';
  });
  const set = new Set(kinds.filter((k) => k !== 'blank'));
  const kind = set.size === 0 ? 'blank' : set.size === 1 ? [...set][0] : 'mixed';
  const count = (k: PageKind) => kinds.filter((x) => x === k).length;
  return {
    file: relative(FILES, path),
    kind,
    pages,
    text_pages: count('text'),
    scan_pages: count('scan'),
    ocr_pages: count('scan+ocr'),
    characters: chars.reduce((a, b) => a + b, 0),
  };
}

async function main() {
  const paths = (await walk(FILES)).sort();
  let done = 0;
  const failed: string[] = [];
  const results = (
    await pool(paths, 8, async (p) => {
      try {
        return await inspect(p);
      } catch (err) {
        failed.push(`${relative(FILES, p)}: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
        return null;
      } finally {
        process.stderr.write(`\r${++done}/${paths.length}`);
      }
    })
  ).filter((r) => r !== null);

  const byKind: Record<string, { files: number; pages: number }> = {};
  for (const r of results) {
    const t = (byKind[r.kind] ??= { files: 0, pages: 0 });
    t.files++;
    t.pages += r.pages;
  }
  const out = { checked: new Date().toISOString(), rules: { min_chars_per_page: MIN_CHARS, page_image_pixels: PAGE_PIXELS }, by_kind: byKind, failed, files: results };
  await writeFile(join(ROOT, 'pdf-types.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`\n${results.length} PDFs → ${join(ROOT, 'pdf-types.json')}`);
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].files - a[1].files)) console.log(`  ${k.padEnd(9)} ${String(v.files).padStart(5)} files · ${v.pages} pages`);
  failed.forEach((f) => console.error(`  failed: ${f}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
