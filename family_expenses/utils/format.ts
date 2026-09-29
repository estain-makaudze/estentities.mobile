const cache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean): Intl.NumberFormat | null {
  const key = `${currency}|${compact}`;
  if (!cache.has(key)) {
    try {
      cache.set(
        key,
        new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          currencyDisplay: "narrowSymbol",
          ...(compact
            ? { notation: "compact", maximumFractionDigits: 1 }
            : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        })
      );
    } catch {
      return null;
    }
  }
  return cache.get(key) ?? null;
}

/** Format an amount in the household currency, e.g. "$1,120.32" (or "US$…" fallback). */
export function formatMoney(amount: number, currency = "USD", opts: { compact?: boolean; sign?: boolean } = {}): string {
  const f = formatter(currency, !!opts.compact);
  const abs = Math.abs(amount);
  const body = f ? f.format(abs) : `${currency} ${abs.toFixed(opts.compact ? 0 : 2)}`;
  if (opts.sign) return `${amount < 0 ? "-" : "+"}${body}`;
  return amount < 0 ? `-${body}` : body;
}

export function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

export const CURRENCIES = ["USD", "ZWG", "ZAR", "BWP", "ZMW", "GBP", "EUR", "KES", "NGN", "MZN"];
