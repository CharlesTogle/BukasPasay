/**
 * The peso amounts printed in BAC documents, by string matching on their
 * text (OCR, pages split by form feeds):
 *
 * - request for quotation: the ABC ("(Php X) being the Approved Budget for
 *   the Contract");
 * - invitation to bid: the ABC ("intends to apply the sum of … (Php X)") and
 *   the fund ("through the GENERAL FUND CY2026 intends");
 * - BAC resolution: the ABC line, the amended ABC ("amended Approved Budget
 *   for the Contract (ABC) equivalent to Php X", after a bid bulletin), and the award ("Awarding the contract to
 *   <bidder> in the amount of … (Php X)", or "To award the contract in favor
 *   of <bidder> in the total amount of …");
 * - notice of award: the award ("in favor of <bidder> in the amount of …");
 * - notice to proceed: "in the amount of Php X", where it is printed;
 * - contract: "as proposed and awarded shall be", "PROJECT COST", "contract
 *   price", "undertakes to pay", "sum of" or "in the amount of", the first
 *   that is followed by an amount. The proposed-and-awarded phrase comes
 *   first because contracts also restate the ABC ("intends to apply the sum
 *   of PHP 615,000", ITB25-186). When a monthly amount is followed by "or a
 *   total of", the total is taken (EPA26-010);
 * - purchase order: the total beside "(Total Amount in Words)" on the last
 *   page, and every page's running "SUB-TOTAL … P X". A total with running
 *   subtotals on later pages is dropped (it is a balance whose label OCR
 *   lost).
 *
 * A file can hold several documents (a resolution, notice and contract
 * scanned together), so it is split where the page title changes
 * (doc-type.ts). Each value keeps its raw text, page and the bid ID it was
 * filed under, and where that ID was read. Nothing is guessed: a document
 * where the phrase or amount is not found gives no value.
 */
import { pageTitle, type DocType } from './doc-type.ts';
import { findMoney, toCentavos } from './money.ts';

export interface Segment {
  type: DocType;
  /** First page, 1-based. */
  page: number;
  /** The segment's pages, joined by form feeds. */
  text: string;
}

/** Split a file's text into documents where the page title changes; untitled pages continue the one before. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const pages = text.split('\f');
  pages.forEach((p, i) => {
    const title = pageTitle(p, i + 1);
    const last = out.at(-1);
    if (title && (!last || title.type !== last.type)) out.push({ type: title.type, page: i + 1, text: p });
    else if (last) last.text += '\f' + p;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Bid IDs

/** OCR misreads of the series letters seen in these scans. */
const SERIES_FIX: Record<string, string> = { '1TB': 'ITB', LTB: 'ITB', ITH: 'ITB', IT8: 'ITB', '1T8': 'ITB' };
const SERIES = String.raw`(?:[I1l]T[BH8]|SVP|RFQ|EPA|REI|NPCS|NP|PB)`;
const PRINTED_ID = new RegExp(String.raw`\b(${SERIES})\s*(?:No\.?\s*:?\s*)?([0-9OIl]{2,4})\s*[-–.]?\s*([0-9OIl]{2,3})(?:\s*[-–.]?\s*([0-9OIl]{3}))?\b`, 'gi');

const digits = (s: string) => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');

/**
 * "ITB26-02-025", "1TB2026-02-026", "EPA2026-034", "SVP No.: 2026-08-315",
 * "itb25-192" → "ITB26-025", "ITB26-026", "EPA26-034", "SVP26-315", "ITB25-192":
 * series, two-digit year, three-digit sequence. The month is dropped because
 * filenames leave it out. Null when no sequence of three digits is printed.
 */
export function bidKey(series: string, year: string, a: string, b?: string): string | null {
  const s = series.toUpperCase();
  const fixed = SERIES_FIX[s] ?? s;
  const y = digits(year);
  const seq = digits(b ?? a);
  if (seq.length !== 3 || (y.length !== 2 && y.length !== 4)) return null;
  return `${fixed}${y.slice(-2)}-${seq}`;
}

export interface IdReading {
  key: string;
  raw: string;
  /** printed: the series is printed; printed-PB: a BAC resolution number ("PB26-009"), read as the ITB with the same year and sequence; filename: from the file's name. */
  source: 'printed' | 'printed-PB' | 'filename';
}

/** The first bid ID printed in a document. A PB number (BAC resolution) is used only when no other series is printed. */
export function printedId(text: string): IdReading | null {
  let pb: IdReading | null = null;
  for (const m of text.matchAll(PRINTED_ID)) {
    const key = bidKey(m[1], m[2], m[3], m[4]);
    if (!key) continue;
    if (key.startsWith('PB')) pb ??= { key: `ITB${key.slice(2)}`, raw: m[0], source: 'printed-PB' };
    else return { key, raw: m[0], source: 'printed' };
  }
  return pb;
}

/** The bid ID in a file name ("itb26-009-contract_0001", "BACRESO-EPA26-034-2-5", "ITB2025-11-329"). */
export function filenameId(name: string): IdReading | null {
  const m = /(ITB|SVP|RFQ|EPA|REI|NPCS|NP)[-_ ]?(\d{2,4})[-_ ]?(\d{2,3})(?:[-_ ]?(\d{3}))?/i.exec(name);
  const key = m && bidKey(m[1], m[2], m[3], m[4]);
  return key ? { key, raw: m![0], source: 'filename' } : null;
}

// ---------------------------------------------------------------------------
// Amounts

export interface AmountReading {
  centavos: number;
  /** The amount as printed, e.g. "Php724,200.00". */
  raw: string;
  /** Page in the file, 1-based. */
  page: number;
  /** Set when the figure as printed cannot be a well-formed amount; the value is then not used, and a person reads the scan. */
  review?: string;
}

/**
 * Why a printed figure is malformed, or null. In "31,545,00.00" (ITB26-059's
 * BAC resolution, a printing error) a comma is followed by two digits, so
 * the parsed 3,154,500.00 is not what was meant. Every group after the first
 * comma must have three digits.
 */
export function malformed(raw: string): string | null {
  const whole = raw.replace(/\s/g, '').replace(/\.\d{1,2}$/, '');
  const groups = whole.split(',');
  if (groups.length > 1 && groups.slice(1).some((g) => g.length !== 3)) return 'comma group not three digits';
  return null;
}

/** "Php", "PHP", "P" right before the digits. */
const PESO_SIGN = /\bP\s*(?:H\s*P)?\s*\.?\s*(?=\d)/gi;

const pageAt = (seg: Segment, offset: number) => seg.page + (seg.text.slice(0, offset).match(/\f/g)?.length ?? 0);

/** OCR reads a zero after a digit or separator as the letter O ("66,044,034.O0"); one-for-one, so positions hold. */
const fixDigitO = (s: string) => s.replace(/(?<=[\d.,])[Oo]/g, '0');

/** The last peso amount in text[to-window, to). */
function lastAmountBefore(seg: Segment, to: number, window: number): AmountReading | null {
  const from = Math.max(0, to - window);
  const zone = seg.text.slice(from, to);
  let last: AmountReading | null = null;
  for (const sign of zone.matchAll(PESO_SIGN)) {
    const found = amountAfter(seg, from + sign.index!, to - from - sign.index!);
    if (found) last = found;
  }
  return last;
}

/** The first peso amount ("Php 1,234.00", "P 724,20000") in text[from, from+window). */
function amountAfter(seg: Segment, from: number, window: number, centavosAlways = false): AmountReading | null {
  const zone = seg.text.slice(from, from + window);
  for (const sign of zone.matchAll(PESO_SIGN)) {
    const at = sign.index! + sign[0].length;
    const slice = zone.slice(at, at + 40);
    const token = findMoney(fixDigitO(slice), centavosAlways)[0];
    if (!token || token.start !== 0) continue;
    const reading: AmountReading = { centavos: token.centavos, raw: sign[0] + slice.slice(0, token.end), page: pageAt(seg, from + sign.index!) };
    const why = centavosAlways ? null : malformed(token.raw);
    return why ? { ...reading, review: why } : reading;
  }
  return null;
}

/** A PO amount after "P": digits with any separators OCR made of the commas ("22’238’900'00"). */
const PO_AMOUNT = /^[\d][\d,.'’`\s]*\d/;

/**
 * A purchase order's total. Every page's "(Total Amount in Words)" line ends
 * in a SUB-TOTAL, a running balance; the last page prints the order's total
 * there instead, with the words around it and no SUB-TOTAL label. The amount
 * is read from the lines around the label, and blocks that say SUB-TOTAL or
 * Balance Forwarded are skipped. Every PO amount is printed with centavos, so
 * the last two digits are centavos when OCR lost the point.
 */
function purchaseOrderTotals(seg: Segment): AmountReading[] {
  const out: AmountReading[] = [];
  // "(Total Amount in" alone: the label can wrap, with "Words)" on the next line (ITB26-035, page 7).
  for (const m of seg.text.matchAll(/\(\s*Total\s+Amount\s+in\b/gi)) {
    const before = seg.text.lastIndexOf('\n', seg.text.lastIndexOf('\n', m.index! - 1) - 1) + 1;
    let after = m.index!;
    for (let i = 0; i < 3 && after >= 0; i++) after = seg.text.indexOf('\n', after + 1);
    const block = seg.text.slice(before, after < 0 ? undefined : after);
    if (/SUB\s*-?\s*TOTAL|Balance\s+Forward/i.test(block)) continue;
    const found = totalAfterSign(block) ?? totalWithCentavos(block);
    if (found) out.push({ centavos: found.centavos, raw: found.raw, page: pageAt(seg, before + found.at) });
  }
  // A total followed by running subtotals on later pages is a balance whose SUB-TOTAL label OCR lost
  // (ITB26-045: the page-4 figure sits between pages 3 and 5's subtotals), not the order's total.
  const subtotalPages = [...seg.text.matchAll(/SUB\s*-?\s*TOTAL|Balance\s+Forward/gi)].map((m) => pageAt(seg, m.index!));
  return out.filter((t) => !subtotalPages.some((p) => p > t.page));
}

/** The first amount after a peso sign in a block. */
function totalAfterSign(block: string): { centavos: number; raw: string; at: number } | null {
  for (const sign of block.matchAll(PESO_SIGN)) {
    const rest = block.slice(sign.index! + sign[0].length);
    const token = PO_AMOUNT.exec(fixDigitO(rest));
    if (!token || token[0].replace(/\D/g, '').length < 3) continue;
    const centavos = toCentavos(token[0].replace(/['’`]/g, ','), true);
    if (centavos !== null) return { centavos, raw: sign[0] + rest.slice(0, token[0].length), at: sign.index! };
  }
  return null;
}

/**
 * When OCR garbled the peso sign ("o 4,480,000.00", "B 2.396.690.00"), the
 * last figure in the block grouped in threes and ending in two-digit
 * centavos, with any separator OCR made of the commas and point.
 */
const GROUPED_WITH_CENTAVOS = /\d{1,3}(?:[,.'’`]\s?\d{3})*[,.'’`]\s?\d{2}(?![\d,.'’`])/g;
function totalWithCentavos(block: string): { centavos: number; raw: string; at: number } | null {
  const last = [...fixDigitO(block).matchAll(GROUPED_WITH_CENTAVOS)].at(-1);
  if (!last || last[0].replace(/\D/g, '').length < 5) return null;
  return { centavos: Number(last[0].replace(/\D/g, '')), raw: block.slice(last.index!, last.index! + last[0].length), at: last.index! };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** The bidder's name as printed, without the note after it ("(Bidder with the Single Calculated and Responsive Bid)", ", being the bidder with …"). */
const bidderName = (s: string) => clean(s).replace(/\s*(?:\(\s*Bidder\b|,?\s*(?:being|as)\s+the\s+bidder\b).*$/i, '');

export interface Extracted {
  abc?: AmountReading;
  /** BAC resolution: the ABC as amended by a bid bulletin, where the resolution states the figure. */
  amended?: AmountReading;
  fund?: string;
  award?: AmountReading;
  /** The bidder named with the award, as printed. */
  bidder?: string;
  amount?: AmountReading;
  /** Purchase orders: each page's SUB-TOTAL, a running balance. */
  subtotals?: AmountReading[];
  /** Purchase orders: the order's total, printed beside "(Total Amount in Words)" on its last page. */
  totals?: AmountReading[];
}

export function extract(seg: Segment): Extracted {
  const t = seg.text;
  switch (seg.type) {
    case 'bid-invitation': {
      const sum = /sum\s+of/i.exec(t);
      const fund = /through\s+the\s+(.{3,80}?)\s*intends/is.exec(t);
      return {
        ...(sum && { abc: amountAfter(seg, sum.index, 600) ?? undefined }),
        ...(fund && { fund: clean(fund[1]) }),
      };
    }
    case 'request-for-quotation': {
      // "… (Php 382,000.00) being the Approved Budget for the Contract (ABC)": the amount comes before the phrase.
      const m = /being\s+the\s+Approved\s+Budget\s+for\s+the\s+Contract/i.exec(t);
      const abc = m && lastAmountBefore(seg, m.index, 300);
      return abc ? { abc } : {};
    }
    case 'bac-resolution': {
      const abc = /^\s*ABC\b/im.exec(t);
      const award = /award(?:ing)?\s*the\s*contract\s*(?:to|in\s*favou?r\s+of)\s+(.{2,160}?)\s+in\s+the\s+(?:total\s+)?amount(?:\s+of)?/is.exec(t);
      // "… amended Approved Budget for the Contract (ABC) equivalent to Php31,075,603.00" (ITB26-031, after a bid bulletin).
      const amended = /amended\s+Approved\s+Budget\s+for\s+the\s+Contract\s*\(?\s*ABC\s*\)?\s*equivalent\s+to/i.exec(t);
      return {
        ...(abc && { abc: amountAfter(seg, abc.index, 80) ?? undefined }),
        ...(amended && { amended: amountAfter(seg, amended.index + amended[0].length, 80) ?? undefined }),
        ...(award && { award: amountAfter(seg, award.index + award[0].length, 400) ?? undefined, bidder: bidderName(award[1]) }),
      };
    }
    case 'notice-of-award': {
      const award = /in\s+favou?r\s+of\s+(.{2,160}?)\s+in\s+the\s+(?:total\s+)?amount(?:\s+of)?/is.exec(t) ?? /in\s+the\s+(?:total\s+)?amount(?:\s+of)?/i.exec(t);
      return award ? { award: amountAfter(seg, award.index + award[0].length, 400) ?? undefined, ...(award[1] && { bidder: bidderName(award[1]) }) } : {};
    }
    case 'notice-to-proceed': {
      const amt = /in\s+the\s+amount(?:\s+of)?/i.exec(t);
      return amt ? { amount: amountAfter(seg, amt.index + amt[0].length, 200) ?? undefined } : {};
    }
    case 'contract-purchase-order': {
      const subtotals = [...t.matchAll(/SUB\s*-?\s*TOTAL[^\n]*/gi)]
        .map((m) => amountAfter(seg, m.index!, m[0].length, true))
        .filter((a): a is AmountReading => a !== null);
      const totals = purchaseOrderTotals(seg);
      if (subtotals.length || totals.length) return { subtotals, totals };
      for (const anchor of [/as\s+proposed\s+and\s+awarded\s+shall\s+be/i, /PROJECT\s+COST/i, /contract\s+price/i, /undertakes\s+to\s+pay/i, /sum\s+of/i, /in\s+the\s+amount(?:\s+of)?/i]) {
        const m = anchor.exec(t);
        const amount = m && amountAfter(seg, m.index + m[0].length, 600);
        if (!amount) continue;
        // "(PHP 124,911.85) PER MONTH or a total of … (PHP 1,498,942.20)" (EPA26-010): the contract amount is the total.
        const total = /PER\s+MONTH\s+or\s+a\s+total\s+of/i.exec(t.slice(m.index, m.index + 600));
        const whole = total && amountAfter(seg, m.index + total.index + total[0].length, 400);
        return { amount: whole ?? amount };
      }
      return {};
    }
    default:
      return {};
  }
}
