/**
 * What kind of BAC document a PDF is, by string matching on its text (OCR,
 * pages split by form feeds). Each page's top lines are searched for the
 * title phrases below; the earliest line that matches gives that page's type.
 * A page with no title phrase is a continuation of the document before it.
 *
 * `type` is the first document in the file; `contains` lists every document
 * in order with the page it starts on. The matching line is kept exactly as
 * read, so a reader can check it against the scan. A file where no title is
 * found has type null: it is left for a person to read, never guessed.
 */

export const DOC_TYPES = [
  'bid-invitation', 'request-for-quotation', 'request-for-expression-of-interest', 'bid-bulletin',
  'notice-of-postponement', 'bac-resolution', 'notice-of-award', 'contract-purchase-order',
  'notice-to-proceed', 'bidding-documents', 'terms-of-reference',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Title phrases, spaced loosely for OCR ("NOTICE  OF  AWARD", "INVITATION TO B1D" does not match). */
const TITLES: [DocType, RegExp][] = [
  ['bid-invitation', /INVITATION\s+TO\s+BID/i],
  ['request-for-quotation', /REQUEST\s+FOR\s+QUOTATION|NEGOTIATED\s+PROCUREMENT/i],
  ['request-for-expression-of-interest', /EXPRESSION\s+OF\s+INTEREST/i],
  ['bid-bulletin', /BID\s+BULLETIN|^\W*ADDENDUM\b/i],
  ['notice-of-postponement', /NOTICE\s+OF\s+POSTPONEMENT/i],
  ['bac-resolution', /^\W*(BAC\s+)?RESOLUTION\b|RESOLUTION\s+(NO\b|DECLARING|RECOMMENDING)/i],
  ['notice-of-award', /NOTICE\s+OF\s+AWARD/i],
  ['contract-purchase-order', /CONTRACT\s+AGREEMENT|KNOW\s+ALL\s+MEN\s+BY|PURCHASE\s+ORDER/i],
  ['notice-to-proceed', /NOTICE\s+TO\s+PROCEED/i],
  ['bidding-documents', /PHILIPPINE\s+BIDDING\s+DOCUMENTS?/i],
  ['terms-of-reference', /TERMS\s+OF\s+REFERENCE/i],
];

/** How far down a page a title is looked for. */
const TOP_LINES = 25;

export interface PageTitle {
  type: DocType;
  page: number;
  line: string;
}

export interface DocTypeResult {
  type: DocType | null;
  title_line: string;
  title_page: number | null;
  contains: { type: DocType; page: number }[];
}

/** A title starts its line ("SUPPLEMENTAL / BID BULLETIN" is the latest start seen); a phrase further in is body text. */
const TITLE_STARTS_BY = 20;
/** A numbered item ("3. Issuing the corresponding Notice of Award ...") is body text, never a title. */
const LIST_ITEM = /^\s*\d+\s*[.)]\s/;

/** The earliest line in a page's top lines that carries a title phrase, if any. */
export function pageTitle(pageText: string, page: number): PageTitle | null {
  const lines = pageText.split('\n').filter((l) => l.trim()).slice(0, TOP_LINES);
  for (const raw of lines) {
    const line = raw.trim();
    if (LIST_ITEM.test(line)) continue;
    for (const [type, re] of TITLES) {
      const at = line.search(re);
      if (at >= 0 && at <= TITLE_STARTS_BY) return { type, page, line };
    }
  }
  return null;
}

export function docType(text: string): DocTypeResult {
  const titles = text
    .split('\f')
    .map((p, i) => pageTitle(p, i + 1))
    .filter((t): t is PageTitle => t !== null);
  // A new document starts where the title changes; the same title on the next page is the same document.
  const contains = titles
    .filter((t, i) => i === 0 || t.type !== titles[i - 1].type)
    .map(({ type, page }) => ({ type, page }));
  const first = titles[0];
  return first
    ? { type: first.type, title_line: first.line, title_page: first.page, contains }
    : { type: null, title_line: '', title_page: null, contains: [] };
}

/** The procurement number printed in a document ("ITB26-02-025", "SVP No.: 2026-08-315", "NPCS No.: 2026-001"), exactly as read. */
export function printedBidId(text: string): string {
  const m = text.match(/\b(?:ITB|SVP|RFQ|REI|EPA|NPCS|NP|PB)\s*(?:No\.?:?\s*)?[0-9OIl]{2,4}[-–.\s]*[0-9OIl]{2,3}(?:[-–.\s]*[0-9OIl]{3})?\b/i);
  return m ? m[0].trim() : '';
}
