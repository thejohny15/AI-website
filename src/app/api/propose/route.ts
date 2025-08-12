import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // prevent caching of API result
export const revalidate = 0;             // disable ISR for this route

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const TODAY = new Date().toISOString().slice(0, 10); // e.g., "2025-08-12"

export async function POST(req: NextRequest) {
  try {
    const { portfolio } = await req.json();
    if (!portfolio) return NextResponse.json({ error: "Missing portfolio" }, { status: 400 });

    const system = `You are an investment research assistant. Educational output only; not financial advice.
Current date (Europe/London): ${TODAY}. All snapshot numbers and narratives must be **as of ${TODAY}**.
Return STRICT JSON with keys: current_snapshot, scenarios.
- current_snapshot: { asOf (ISO), inflationYoY, unemploymentRate, policyRate, gdpGrowthYoY, marketValuationNote, risks[] }.
- scenarios: exactly 3 items; each with id, name, probability (0..1), narrative, assumptions{ inflationYoY, unemploymentRate, policyRate, gdpGrowthYoY, other[]? }, portfolioGuidance.
Constraints:
- Use ${TODAY} for asOf (do not invent older dates).
- Provide realistic but clearly labelled estimates (no live data lookup).
- Probabilities must sum to 1.00 ±0.01.`;

    const user = {
      role: "user" as const,
      content:
        `User answers:\n` +
        JSON.stringify(
          {
            name: portfolio.name,
            riskTolerance: portfolio.riskTolerance,
            timeHorizon: portfolio.timeHorizon,
            approximateValue: portfolio.approximateValue,
            currency: portfolio.currency,
            exchanges: portfolio.exchanges,
            focus: portfolio.focus,
            rebalancing: portfolio.rebalancing,
            targetHoldings: portfolio.targetHoldings,
          },
          null,
          2
        ) +
        `\n\nBuild three plausible 6–18 month macro paths: one base, one bullish, one risk-off.`,
    };

    const body = {
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        user,
      ],
      temperature: 0.25,
    } as const;

    const payload = await callOpenAI(body);
    let { current_snapshot, scenarios } = payload || {};

    if (!current_snapshot) throw new Error("Missing current_snapshot");
    // ---- Patch A: hard-set asOf to TODAY, never trust the model here ----
    current_snapshot.asOf = TODAY;

    if (!Array.isArray(scenarios) || scenarios.length !== 3) {
      throw new Error("Model did not return 3 scenarios");
    }

    // normalize probabilities to sum ~1.00
    const sumP = scenarios.reduce((a: number, s: any) => a + (+s.probability || 0), 0) || 1;
    scenarios = scenarios.map((s: any) => ({
      ...s,
      probability: Math.round((((+s.probability || 0) / sumP) * 100)) / 100,
    }));

    return NextResponse.json({ current_snapshot, scenarios });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to propose scenarios" }, { status: 500 });
  }
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