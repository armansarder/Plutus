const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Format integer cents as USD with commas and a leading minus when negative, e.g. -$70. */
export function formatMoney(cents: number, opts: { whole?: boolean } = {}): string {
  const f = opts.whole ? usdWhole : usd;
  const abs = f.format(Math.abs(cents) / 100);
  return cents < 0 ? `−${abs}` : abs;
}

/** Signed variant for cash-flow events: +$1,200 / −$600. */
export function formatSignedMoney(cents: number): string {
  return cents > 0 ? `+${formatMoney(cents)}` : formatMoney(cents);
}

export const MAX_PURCHASE_CENTS = 100_000_00; // $100,000 sensible demo ceiling
export const MAX_BUFFER_CENTS = 100_000_00;

/** Parse a user-entered dollar string into integer cents. Returns null for invalid input. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
