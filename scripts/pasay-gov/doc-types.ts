/**
 * `pnpm run data:pasay-gov:doc-types` — the type of each BAC document the
 * site links without a label (data/pasay-gov/unlabelled-docs.json), by string
 * matching on its text (extract/doc-type.ts). Writes
 * data/pasay-gov/unlabelled-doc-types.json; documents where no title was
 * found have type null and are listed at the end for a person to read.
 *
 * Text is read from the hand-typed copy (manual/) when there is one, else the
 * OCR text, else the second OCR reading (.red.txt).
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { docType, printedBidId } from './extract/doc-type.ts';

const REPO = resolve(import.meta.dirname, '../..');
const ROOT = join(REPO, 'data/pasay-gov');

interface Unlabelled {
  file: string;
  texts: string[];
  linked_from_entry: number;
  entry_series: string | null;
}

const SOURCES: [string, (base: string) => string][] = [
  ['manual', (b) => join(ROOT, 'manual', `${b}.txt`)],
  ['ocr', (b) => join(ROOT, 'ocr', `${b}.txt`)],
  ['red', (b) => join(ROOT, 'ocr', `${b}.red.txt`)],
];

async function main() {
  const items = JSON.parse(await readFile(join(ROOT, 'unlabelled-docs.json'), 'utf8')) as Unlabelled[];
  const out = [];
  for (const item of items) {
    const base = item.file.replace(/\.pdf$/i, '');
    // The first source that yields a title; if none does, the first source that exists.
    let chosen: { source: string; text: string; result: ReturnType<typeof docType> } | null = null;
    for (const [source, path] of SOURCES) {
      if (!existsSync(path(base))) continue;
      const text = await readFile(path(base), 'utf8');
      const result = docType(text);
      chosen ??= { source, text, result };
      if (result.type) {
        chosen = { source, text, result };
        break;
      }
    }
    if (!chosen) throw new Error(`no text for ${item.file}; run data:pasay-gov:ocr first`);
    out.push({
      file: item.file,
      ...chosen.result,
      bid_id: printedBidId(chosen.text),
      source: chosen.source,
      linked_from_entry: item.linked_from_entry,
      entry_series: item.entry_series,
    });
  }
  await writeFile(join(ROOT, 'unlabelled-doc-types.json'), JSON.stringify(out, null, 1) + '\n');

  const counts = new Map<string, number>();
  for (const d of out) counts.set(d.type ?? '(no title found)', (counts.get(d.type ?? '(no title found)') ?? 0) + 1);
  console.log(`${out.length} documents → data/pasay-gov/unlabelled-doc-types.json`);
  for (const [t, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${t}`);
  for (const d of out.filter((d) => !d.type)) console.log(`  no title: ${d.file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
