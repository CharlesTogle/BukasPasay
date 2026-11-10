/** Pesos, the way budget.bettergov.ph prints them: ₱4.74B, ₱369.4M, ₱850K. null is "—", never zero. */
export function php(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const [div, suffix] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
  if (div === 1) return '₱' + Math.round(n).toLocaleString('en-US');
  const v = n / div;
  const digits = Math.abs(v) >= 100 ? 1 : 2;
  return '₱' + v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 1 }) + suffix;
}

/** Exact pesos: ₱4,744,932,000. */
export function phpFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return '₱' + Math.round(n).toLocaleString('en-US');
}

/** A signed change: +₱150.0M, −₱14.00B, or "no change". */
export function phpDelta(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return 'no change';
  return (n > 0 ? '+' : '−') + php(Math.abs(n));
}

export function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** "1 project", "433 projects". */
export function plural(n: number, one: string, many = one + 's'): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

export function date(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
}

/** A date in Filipino: "Nobyembre 9, 2026". */
export function petsa(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fil-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
}

/**
 * Pesos the way people say them: ₱755 milyon, ₱1.43 bilyon, ₱850 libo.
 * null is "—", never zero. For reading; the CSV keeps exact pesos.
 */
export function piso(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const [div, word] = a >= 1e12 ? [1e12, 'trilyon'] : a >= 1e9 ? [1e9, 'bilyon'] : a >= 1e6 ? [1e6, 'milyon'] : a >= 1e3 ? [1e3, 'libo'] : [1, ''];
  if (div === 1) return '₱' + Math.round(n).toLocaleString('en-US');
  const v = n / div;
  // Three significant figures at most, without trailing zeros: 755, 85, 12.3, 1.43.
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return `₱${v.toLocaleString('en-US', { maximumFractionDigits: digits })} ${word}`;
}

/** A signed change in pesos: +₱150 milyon, −₱14 bilyon, or "Wala" when the two match. */
export function pisoDelta(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return 'Wala';
  return (n > 0 ? '+' : '−') + piso(Math.abs(n));
}

/** "walang proyekto", "isang proyekto", "24 na proyekto": Filipino counts, with the linker after the numeral. */
export function bilang(n: number, noun: string): string {
  if (n === 0) return `walang ${noun}`;
  return n === 1 ? `isang ${noun}` : `${count(n)} na ${noun}`;
}
