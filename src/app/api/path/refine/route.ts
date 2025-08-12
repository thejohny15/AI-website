import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

type Holding = { symbol: string; weight: number; note?: string };
type Portfolio = {
  name?: string;
  riskTolerance?: string;
  timeHorizon?: string;
  approximateValue?: number;
  currency?: string;
  exchanges?: string[];
  focus?: string;
  rebalancing?: string;
  targetHoldings?: number;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
  });
}

function renormalize(holdings: Holding[]): Holding[] {
  const rounded = holdings.map((h) => ({
    symbol: String(h.symbol || "").trim().toUpperCase(),
    note: (h.note ?? "").toString(),
    weight: Math.max(0, +(+h.weight || 0).toFixed(2)),
  }));
  const sum = rounded.reduce((a, b) => a + b.weight, 0);
  if (sum <= 0) return rounded;
  return rounded.map((h) => ({ ...h, weight: +(((h.weight / sum) * 100).toFixed(2)) }));
}

function diffTrades(before: Holding[], after: Holding[]) {
  const mapB = new Map(before.map((h) => [h.symbol, h.weight]));
  const mapA = new Map(after.map((h) => [h.symbol, h.weight]));
  const symbols = new Set([...mapB.keys(), ...mapA.keys()]);
  const trades: Array<{ symbol: string; from: number; to: number; delta: number; action: "buy"|"sell"|"new"|"exit" }> = [];
  for (const s of symbols) {
    const b = mapB.get(s) || 0;
    const a = mapA.get(s) || 0;
    const d = +(a - b).toFixed(2);
    if (Math.abs(d) < 0.01) continue;
    trades.push({
      symbol: s,
      from: +b.toFixed(2),
      to: +a.toFixed(2),
      delta: d,
      action: d > 0 ? (b === 0 ? "new" : "buy") : a === 0 ? "exit" : "sell",
    });
  }
  trades.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return trades;
}

async function callOpenAI(body: any, attempt = 0): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });

  if ((res.status === 429 || (res.status >= 500 && res.status < 600)) && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after")) || Math.pow(2, attempt) * 500;
    await new Promise((r) => setTimeout(r, retryAfter));
    return callOpenAI(body, attempt + 1);
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI HTTP ${res.status}`);

  let content: string = json.choices?.[0]?.message?.content || "{}";
  const fence = content.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fence) content = fence[1];
  return JSON.parse(content);
}

export async function POST(req: NextRequest) {
  try {
    const { portfolio, currentHoldings, instruction } = (await req.json()) as {
      portfolio?: Portfolio;
      currentHoldings?: Holding[];
      instruction?: string;
    };

    if (!portfolio) return json({ error: "Missing portfolio" }, 400);
    if (!Array.isArray(currentHoldings) || currentHoldings.length === 0) return json({ error: "Missing currentHoldings" }, 400);
    if (!instruction || typeof instruction !== "string") return json({ error: "Missing instruction" }, 400);

    const system = `You are a portfolio manager's assistant. Educational output only; not financial advice.
Task: Apply the user's constraint to the existing portfolio and propose a *smart* rebalance.
Return STRICT JSON with keys: summary, holdings.
- summary: short Markdown explaining the rationale, risks, and key trade-offs.
- holdings: 8–16 items { symbol, weight (0..100), note }.
Rules:
- Do NOT simply redistribute pro‑rata. Prefer replacements that preserve diversification and the original tilts (factor/sector/geography) where possible.
- Respect user constraints from questionnaire (risk tolerance, horizon, targetHoldings, exchanges) and the ad‑hoc instruction.
- If a sector/asset is excluded, replace with nearest substitutes (e.g., sector ETF or peers) rather than dumping into cash.
- Keep turnover reasonable; minimize total absolute weight change subject to constraints.
- Weights rounded to two decimals and sum to ~100.
`;

    const user = {
      role: "user" as const,
      content:
        `Questionnaire:\n${JSON.stringify(portfolio, null, 2)}\n\n` +
        `Current holdings (symbol: weight% -> note):\n${currentHoldings.map(h => `${h.symbol}: ${h.weight}% -> ${h.note ?? ""}`).join("\n")}\n\n` +
        `Instruction: ${instruction}\n\n` +
        `Return only JSON as specified.`,
    };

    const body = {
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, user],
      temperature: 0.2,
    } as const;

    const payload = await callOpenAI(body);
    let { summary, holdings } = payload || {};
    if (!Array.isArray(holdings) || holdings.length === 0) throw new Error("No holdings returned");

    holdings = renormalize(holdings as Holding[]);
    const trades = diffTrades(currentHoldings as Holding[], holdings as Holding[]);

    return json({ summary, holdings, trades });
  } catch (e: any) {
    return json({ error: e?.message || "Failed to refine portfolio" }, 500);
  }
}