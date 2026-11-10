/**
 * Peso amounts in OCR'd text, as exact integer centavos.
 *
 * The city's reports print every amount with centavos ("1,234.50"). OCR
 * drops or moves commas and sometimes the decimal point, so a token is read
 * by its digits: commas are ignored and the last "." is the decimal point.
 * A token with no "." is whole pesos ("1,000,000" → 1,000,000.00), unless
 * `centavosAlways` is set for a document that prints centavos on every
 * amount (the FRO, the SAAOB): there OCR lost the point, so the last two
 * digits are centavos ("6,520,00000" → 6,520,000.00; "000" → 0.00). The raw
 * text is kept beside every value so a reader can see what was read.
 */

export interface MoneyToken {
  /** Character offsets in the line: where the token starts and ends. */
  start: number;
  end: number;
  raw: string;
  centavos: number;
}

/**
 * One amount, however it is spaced: "5,423,094 .41" (OCR put a space before the decimals) and
 * "PHP 79, 455, 948.00" (the city typed a space after each comma) are each one token. A comma
 * followed by one space and a digit continues the number; columns are wider apart than that.
 */
const TOKEN = /-?\d(?:\d|,(?!\s)|,\s(?=\d))*(?:\s?\.\s?\d{2})?(?![\d,]|\.\d)/g;

export function toCentavos(raw: string, centavosAlways = false): number | null {
  const s = raw.replace(/\s/g, '');
  const negative = s.startsWith('-');
  const digits = s.replace(/[^\d.]/g, '');
  if (!/\d/.test(digits)) return null;
  const dot = digits.lastIndexOf('.');
  let whole: string, cents: string;
  if (dot >= 0) [whole, cents] = [digits.slice(0, dot).replace(/\./g, '') || '0', digits.slice(dot + 1).padEnd(2, '0').slice(0, 2)];
  else if (centavosAlways) [whole, cents] = [digits.slice(0, -2) || '0', digits.slice(-2).padStart(2, '0')];
  else [whole, cents] = [digits, '00'];
  const value = Number(whole) * 100 + Number(cents);
  return Number.isSafeInteger(value) ? (negative ? -value : value) : null;
}

/** Amount-shaped tokens in a line: at least three digits, or a decimal part ("0.00", "1,500.00", "000"). */
export function findMoney(line: string, centavosAlways = false): MoneyToken[] {
  const out: MoneyToken[] = [];
  for (const m of line.matchAll(TOKEN)) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 3 && !/\.\s?\d{2}$/.test(raw)) continue;
    const centavos = toCentavos(raw, centavosAlways);
    if (centavos !== null) out.push({ start: m.index!, end: m.index! + raw.length, raw, centavos });
  }
  return out;
}

/** 1234567890 centavos → "12345678.90" (exact; no float rounding). */
export function pesos(centavos: number | null): string {
  if (centavos === null) return '';
  const sign = centavos < 0 ? '-' : '';
  const a = Math.abs(centavos);
  return `${sign}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
