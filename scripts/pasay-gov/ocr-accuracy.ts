/**
 * `pnpm run data:pasay-gov:ocr-accuracy` — how well does the OCR read these
 * documents? Measured on the PDFs that have real (digital) text: each such
 * page is printed to an image, the image is put through the same ocrmypdf
 * command as ocr.ts, and the OCR text is compared with the page's own text.
 * Run `data:pasay-gov:inspect` first; it lists which pages are digital text.
 *
 * Pages are printed at the resolutions the city's scans use (150, 200 and
 * 300 dpi, grayscale). A printed page is cleaner than a paper scan (no skew,
 * no smudges, no watermark), so these rates are a best case for the scans.
 *
 * Per resolution, over all pages (data/pasay-gov/ocr-accuracy.json):
 * - character error rate: edit distance between the two texts (whitespace
 *   collapsed to one space) ÷ characters in the page's text;
 * - digit error rate: the same, on the digits alone;
 * - amounts: peso amounts (a number with a comma or a decimal point) in the
 *   page's text, and how many of them OCR read to the exact centavo.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { findMoney } from './extract/money.ts';
import { pool } from './wp.ts';

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '../../data/pasay-gov');
const OCRMYPDF = resolve(import.meta.dirname, '../../.venv/bin/ocrmypdf');
const DPIS = [150, 200, 300];
const BIG = { maxBuffer: 256 * 1024 * 1024 };

/** Edit distance (insert, delete, substitute), two rows of memory. */
export function editDistance(a: string, b: string): number {
  let prev = Uint32Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const digits = (s: string) => s.replace(/\D/g, '');
const amounts = (s: string) =>
  s.split('\n').flatMap((line) => findMoney(line).filter((t) => /[.,]/.test(t.raw)).map((t) => t.centavos));

/** How many of `ref`'s amounts appear in `hyp`, each one used once. */
function amountsFound(ref: number[], hyp: number[]): number {
  const left = new Map<number, number>();
  for (const c of hyp) left.set(c, (left.get(c) ?? 0) + 1);
  let found = 0;
  for (const c of ref) {
    const n = left.get(c) ?? 0;
    if (n > 0) {
      found++;
      left.set(c, n - 1);
    }
  }
  return found;
}

interface Page {
  file: string;
  page: number;
}

/** Page `p` printed at `dpi`, OCR'd as ocr.ts does, returned as text. */
async function ocrPage(src: string, p: number, dpi: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pasay-acc-'));
  try {
    await run('pdftoppm', ['-r', String(dpi), '-gray', '-png', '-f', String(p), '-l', String(p), '-singlefile', src, join(dir, 'page')]);
    await run('magick', [join(dir, 'page.png'), '-units', 'PixelsPerInch', '-density', String(dpi), join(dir, 'image.pdf')]);
    await run(OCRMYPDF, ['-q', '-j', '1', '--skip-text', '--rotate-pages', '--deskew', '--output-type', 'pdf', '-l', 'eng', join(dir, 'image.pdf'), join(dir, 'ocr.pdf')], BIG);
    return (await run('pdftotext', ['-q', '-layout', join(dir, 'ocr.pdf'), '-'], BIG)).stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const types = JSON.parse(await readFile(join(ROOT, 'pdf-types.json'), 'utf8')) as {
    files: { file: string; kind: string; pages: number; text_pages: number }[];
  };
  // Only whole-text documents: in a mixed one, which pages are text is not recorded.
  const pages: Page[] = types.files
    .filter((f) => f.kind === 'text')
    .flatMap((f) => Array.from({ length: f.pages }, (_, i) => ({ file: f.file, page: i + 1 })));

  const rows: Record<string, number | string>[] = [];
  const jobs = pages.flatMap((pg) => DPIS.map((dpi) => ({ ...pg, dpi })));
  let done = 0;
  await pool(jobs, Math.max(1, availableParallelism() - 2), async ({ file, page, dpi }) => {
    const src = join(ROOT, 'files', file);
    const ref = (await run('pdftotext', ['-q', '-layout', '-f', String(page), '-l', String(page), src, '-'], BIG)).stdout;
    if (flat(ref).length < 40) return; // the one near-blank page of a text document
    const hyp = await ocrPage(src, page, dpi);
    const refAmounts = amounts(ref);
    rows.push({
      file,
      page,
      dpi,
      characters: flat(ref).length,
      character_errors: editDistance(flat(ref), flat(hyp)),
      digits: digits(ref).length,
      digit_errors: editDistance(digits(ref), digits(hyp)),
      amounts: refAmounts.length,
      amounts_exact: amountsFound(refAmounts, amounts(hyp)),
    });
    process.stderr.write(`\r${++done}/${jobs.length}`);
  });
  rows.sort((a, b) => String(a.file).localeCompare(String(b.file)) || +a.page - +b.page || +a.dpi - +b.dpi);

  const sum = (rs: typeof rows, k: string) => rs.reduce((n, r) => n + Number(r[k]), 0);
  const rate = (n: number, d: number) => (d ? Number((n / d).toFixed(5)) : null);
  const by_dpi = DPIS.map((dpi) => {
    const rs = rows.filter((r) => r.dpi === dpi);
    return {
      dpi,
      pages: rs.length,
      characters: sum(rs, 'characters'),
      character_errors: sum(rs, 'character_errors'),
      character_error_rate: rate(sum(rs, 'character_errors'), sum(rs, 'characters')),
      digits: sum(rs, 'digits'),
      digit_errors: sum(rs, 'digit_errors'),
      digit_error_rate: rate(sum(rs, 'digit_errors'), sum(rs, 'digits')),
      amounts: sum(rs, 'amounts'),
      amounts_exact: sum(rs, 'amounts_exact'),
    };
  });

  const out = join(ROOT, 'ocr-accuracy.json');
  await writeFile(out, JSON.stringify({ checked: new Date().toISOString(), method: 'digital-text pages printed to grayscale images, OCR\'d with ocr.ts settings, compared with the page text', by_dpi, pages: rows }, null, 1) + '\n');
  console.log(`\n${out}`);
  for (const d of by_dpi) {
    console.log(`  ${d.dpi} dpi · ${d.pages} pages · characters ${d.character_errors}/${d.characters} · digits ${d.digit_errors}/${d.digits} · amounts exact ${d.amounts_exact}/${d.amounts}`);
  }
}

if (process.argv[1] === import.meta.filename) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
