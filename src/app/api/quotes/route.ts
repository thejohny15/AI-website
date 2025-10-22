import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Quote = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  name?: string | null;
  source: string;
  time?: string | null;
};

type Body = { symbols: string[] };

export async function POST(req: Request) {
  try {
    const { symbols } = (await req.json()) as Body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "symbols required" }, { status: 400 });
    }

    const uniq = Array.from(new Set(symbols.map((s) => String(s).trim().toUpperCase()))).slice(0, 50);
    const out: Record<string, Quote> = {};

    // Use Yahoo Finance API (free, no API key needed)
    for (const symbol of uniq) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
        const res = await fetch(url, { 
          next: { revalidate: 60 },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          const result = data.chart?.result?.[0];
          const meta = result?.meta;
          
          if (meta && typeof meta.regularMarketPrice === 'number') {
            const price = meta.regularMarketPrice;
            const previousClose = meta.previousClose || meta.chartPreviousClose;
            const change = (price && previousClose) ? price - previousClose : null;
            const changePercent = (change && previousClose) ? (change / previousClose) * 100 : null;
            
            out[symbol] = {
              symbol,
              price: toNum(price),
              change: toNum(change),
              changePercent: toNum(changePercent),
              currency: meta.currency || "USD",
              name: meta.longName || meta.shortName || null,
              source: "yahoo",
              time: new Date().toISOString(),
            };
          }
        } else {
          console.log(`Yahoo Finance error for ${symbol}: ${res.status}`);
        }
      } catch (e) {
        console.log(`Error fetching ${symbol}:`, e);
        continue;
      }
    }

    return NextResponse.json({ quotes: out, provider: "yahoo" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "yahoo",
    usage: "POST { symbols: string[] }  // uses Yahoo Finance (free, no API key needed)",
  });
}

/* helpers */
function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
