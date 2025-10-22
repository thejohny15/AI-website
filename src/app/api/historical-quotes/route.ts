import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HistoricalPrice = {
  date: string;
  price: number | null;
  symbol: string;
};

type Body = { 
  symbols: string[];
  startDate: string; // YYYY-MM-DD format
  endDate?: string;  // YYYY-MM-DD format, defaults to today
};

export async function POST(req: Request) {
  try {
    const { symbols, startDate, endDate } = (await req.json()) as Body;
    
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "symbols required" }, { status: 400 });
    }
    
    if (!startDate) {
      return NextResponse.json({ error: "startDate required" }, { status: 400 });
    }

    const uniq = Array.from(new Set(symbols.map((s) => String(s).trim().toUpperCase()))).slice(0, 10);
    const out: Record<string, HistoricalPrice[]> = {};

    // Use Yahoo Finance API for historical data
    for (const symbol of uniq) {
      try {
        const start = new Date(startDate);
        const end = new Date(endDate || new Date());
        
        // Convert dates to Unix timestamps
        const period1 = Math.floor(start.getTime() / 1000);
        const period2 = Math.floor(end.getTime() / 1000);
        
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
        
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          const result = data.chart?.result?.[0];
          
          if (result && result.timestamp && result.indicators?.quote?.[0]?.close) {
            const timestamps = result.timestamp;
            const prices = result.indicators.quote[0].close;
            
            const historicalData: HistoricalPrice[] = timestamps.map((timestamp: number, index: number) => ({
              date: new Date(timestamp * 1000).toISOString().slice(0, 10),
              price: prices[index] ? Number(prices[index]) : null,
              symbol
            })).filter((item: HistoricalPrice) => item.price !== null);
            
            out[symbol] = historicalData;
          }
        } else {
          console.log(`Yahoo Finance historical data error for ${symbol}: ${res.status}`);
          out[symbol] = [];
        }
      } catch (e) {
        console.log(`Error fetching historical data for ${symbol}:`, e);
        out[symbol] = [];
      }
    }

    return NextResponse.json({ 
      historicalPrices: out, 
      provider: "yahoo",
      period: { startDate, endDate: endDate || new Date().toISOString().slice(0, 10) }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "yahoo",
    usage: "POST { symbols: string[], startDate: 'YYYY-MM-DD', endDate?: 'YYYY-MM-DD' }",
  });
}
