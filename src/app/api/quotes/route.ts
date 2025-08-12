import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Quote = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null; // e.g. -0.56 for -0.56%
  currency: string | null;
  name?: string | null;
  source: "fmp";
  time?: string | null;
};

type Body = { symbols: string[] };

export async function POST(req: Request) {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Missing FMP_API_KEY" }, { status: 500 });
  }

  try {
    const { symbols } = (await req.json()) as Body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "symbols required" }, { status: 400 });
    }

    // Clean + de-dup; FMP likes plain tickers (supports many global tickers too)
    const uniq = Array.from(new Set(symbols.map((s) => String(s).trim().toUpperCase()))).slice(0, 200);

    // Batch requests so we don’t hit URL limits (FMP handles quite a lot per call, 50 is safe)
    const chunkSize = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < uniq.length; i += chunkSize) chunks.push(uniq.slice(i, i + chunkSize));

    const out: Record<string, Quote> = {};

    for (const c of chunks) {
      const url =
        "https://financialmodelingprep.com/api/v3/quote/" +
        encodeURIComponent(c.join(",")) +
        `?apikey=${key}`;

      const res = await fetch(url, { next: { revalidate: 15 } }); // cache briefly
      if (!res.ok) continue;

      const arr = (await res.json()) as any[];
      if (!Array.isArray(arr)) continue;

      for (const q of arr) {
        // FMP returns fields like: symbol, name, price, change, changesPercentage, timestamp, currency
        const rawSym = String(q?.symbol ?? "").toUpperCase();
        if (!rawSym) continue;

        // Normalize a base key (strip common suffixes like ".US")
        const baseKey = rawSym.split(":").pop()!.split(".")[0]; // “VUKE.L” → “VUKE”, “AAPL” → “AAPL”

        // Avoid overwriting if we already filled this base symbol
        if (out[baseKey]) continue;

        const price = toNum(q?.price);
        out[baseKey] = {
          symbol: baseKey,
          price,
          change: toNum(q?.change),
          changePercent: toNum(q?.changesPercentage), // already in percent units
          currency: q?.currency ?? null,
          name: q?.name ?? null,
          source: "fmp",
          time: q?.timestamp ? new Date(q.timestamp * 1000).toISOString() : null,
        };
      }
    }

    return NextResponse.json({ quotes: out, provider: "fmp" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "fmp",
    usage: "POST { symbols: string[] }  // reads FMP_API_KEY from env",
  });
}

/* helpers */
function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
