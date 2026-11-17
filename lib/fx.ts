// Aproximación a la conversión de Revolut: tipo de cambio interbancario menos la
// comisión. Ajusta estas constantes a tu plan de Revolut.
export const REVOLUT_FEE_PCT = 0.5; // comisión base sobre el cambio
export const REVOLUT_WEEKEND_MARKUP_PCT = 1; // recargo extra en fin de semana

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Varias fuentes por si alguna falla o está bloqueada en tu red.
async function fetchUsdEurRate(date: string, isFuture: boolean): Promise<number> {
  const when = isFuture ? "latest" : date;
  const sources: Array<() => Promise<number>> = [
    async () =>
      Number((await getJson(`https://api.frankfurter.dev/v1/${when}?base=USD&symbols=EUR`)).rates.EUR),
    async () =>
      Number((await getJson(`https://api.frankfurter.app/${when}?from=USD&to=EUR`)).rates.EUR),
    async () =>
      Number(
        (await getJson(
          `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${when}/v1/currencies/usd.json`,
        )).usd.eur,
      ),
    async () => Number((await getJson("https://open.er-api.com/v6/latest/USD")).rates.EUR),
  ];

  for (const source of sources) {
    try {
      const rate = await source();
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch (e) {
      console.error("[fx] fuente fallida:", e instanceof Error ? e.message : e);
    }
  }
  throw new Error("No se pudo obtener el tipo de cambio");
}

export async function usdToEur(date: string) {
  const isFuture = date > new Date().toISOString().slice(0, 10);
  const rate = await fetchUsdEurRate(date, isFuture);

  const day = new Date(date + "T00:00:00Z").getUTCDay();
  const weekend = day === 0 || day === 6;
  const feePct = REVOLUT_FEE_PCT + (weekend ? REVOLUT_WEEKEND_MARKUP_PCT : 0);
  return { rate, feePct, effectiveRate: rate * (1 - feePct / 100) };
}
