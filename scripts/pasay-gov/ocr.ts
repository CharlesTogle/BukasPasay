/**
 * `pnpm run data:pasay-gov:ocr [-- --concurrency=N]` — makes every downloaded
 * PDF readable. Most of pasay.gov.ph's PDFs are scans (EPSON Scan, no text
 * layer); this runs ocrmypdf (tesseract) over data/pasay-gov/files/ into
 * data/pasay-gov/ocr/, same paths, and beside each PDF writes a .txt of its
 * text with the page layout kept (pages split by form feeds), which is what
 * the parsers read.
 *
 * Pages that already have text are kept as they are (--skip-text). Files
 * already done are skipped, so it can be stopped and resumed. Needs the repo
 * venv: python -m venv .venv && .venv/bin/pip install -r scripts/pasay-gov/requirements.txt
 *
 * Second pass: a file whose text averages under LOW_CHARS characters a page
 * (a phone photo on the city's green watermarked letterhead, for one) is read
 * again from the red channel of each page at 300 dpi, high contrast, black and
 * white, which drops the green watermark and keeps the black text. That text
 * goes to <name>.red.txt beside the first; the first is never overwritten.
 * Needs ImageMagick (`magick`).
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pool } from './wp.ts';

const run = promisify(execFile);
const REPO = resolve(import.meta.dirname, '../..');
const FILES = join(REPO, 'data/pasay-gov/files');
const OUT = join(REPO, 'data/pasay-gov/ocr');
const OCRMYPDF = join(REPO, '.venv/bin/ocrmypdf');
/** Files OCR'd at once, one core each. Default: all cores but two. */
const CONCURRENCY = Math.max(1, Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1]) || availableParallelism() - 2);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(p)));
    else if (/\.pdf$/i.test(d.name)) out.push(p);
  }
  return out;
}

const exists = (p: string) => stat(p).then(() => true, () => false);

/** Below this many non-space characters per page, a file gets the second pass. */
const LOW_CHARS = 100;

async function isLow(txt: string): Promise<boolean> {
  const text = await readFile(txt, 'utf8');
  const pages = Math.max(text.split('\f').filter((p) => p.trim()).length, 1);
  return text.replace(/\s/g, '').length / pages < LOW_CHARS;
}

/** Each page at 300 dpi → red channel → contrast → black and white → tesseract; pages joined by form feeds. */
async function redPass(src: string, out: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'pasay-red-'));
  try {
    await run('pdftoppm', ['-r', '300', '-png', src, join(dir, 'p')]);
    const pages = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
    const texts: string[] = [];
    for (const page of pages) {
      const clean = join(dir, `clean-${page}`);
      await run('magick', [join(dir, page), '-channel', 'R', '-separate', '-level', '35%,75%', '-threshold', '55%', clean]);
      texts.push((await run('tesseract', [clean, '-', '--psm', '6', '-l', 'eng'], { maxBuffer: 64 * 1024 * 1024 })).stdout);
    }
    await writeFile(out, texts.join('\f'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (!(await exists(OCRMYPDF))) throw new Error(`ocrmypdf not found at ${OCRMYPDF}; see the install line at the top of this file.`);
  const paths = (await walk(FILES)).sort();
  let done = 0, ran = 0, skipped = 0;
  const failed: string[] = [];
  const started = Date.now();

  await pool(paths, CONCURRENCY, async (src) => {
    const rel = relative(FILES, src);
    const pdf = join(OUT, rel);
    const txt = pdf.replace(/\.pdf$/i, '.txt');
    try {
      if (await exists(txt)) skipped++;
      else {
        await mkdir(dirname(pdf), { recursive: true });
        // --output-type pdf: keep the scan as is (no PDF/A conversion); -j 1: parallelism is across files.
        await run(OCRMYPDF, ['-q', '-j', '1', '--skip-text', '--rotate-pages', '--deskew', '--output-type', 'pdf', '-l', 'eng', src, pdf], { maxBuffer: 64 * 1024 * 1024 });
        // The .txt is written last: its presence marks the file done.
        await run('pdftotext', ['-q', '-layout', pdf, txt]);
        ran++;
      }
    } catch (err) {
      const msg = err instanceof Error ? ((err as { stderr?: string }).stderr || err.message).trim().split('\n').at(-1) : String(err);
      failed.push(`${rel}: ${msg}`);
    }
    const mins = (Date.now() - started) / 60000;
    process.stderr.write(`\r${++done}/${paths.length} · ${ran} OCR'd · ${skipped} already done · ${failed.length} failed · ${mins.toFixed(1)} min`);
  });

  console.log(`\n${ran} OCR'd, ${skipped} already done, ${failed.length} failed → ${OUT}`);

  // Second pass, on files whose first text is nearly empty and that have no .red.txt yet.
  const low: string[] = [];
  for (const src of paths) {
    const txt = join(OUT, relative(FILES, src)).replace(/\.pdf$/i, '.txt');
    if ((await exists(txt)) && !(await exists(txt.replace(/\.txt$/, '.red.txt'))) && (await isLow(txt))) low.push(src);
  }
  for (const src of low) {
    const rel = relative(FILES, src);
    const red = join(OUT, rel).replace(/\.pdf$/i, '.red.txt');
    try {
      await redPass(src, red);
      const chars = (await readFile(red, 'utf8')).replace(/\s/g, '').length;
      console.log(`  second pass: ${rel} → ${chars} characters`);
    } catch (err) {
      failed.push(`${rel} (second pass): ${err instanceof Error ? err.message.split('\n')[0] : err}`);
    }
  }
  console.log(`second pass: ${low.length} file(s) under ${LOW_CHARS} characters a page`);
  failed.forEach((f) => console.error(`  failed: ${f}`));
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
