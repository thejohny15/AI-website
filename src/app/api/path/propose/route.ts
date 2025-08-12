import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const FRED_API_KEY = process.env.FRED_API_KEY!;

const TODAY = new Date().toISOString().slice(0, 10);

async function fetchFRED(series_id: string, params: Record<string, string> = {}) {
  const base = new URL("https://api.stlouisfed.org/fred/series/observations");
  base.searchParams.set("series_id", series_id);
  base.searchParams.set("api_key", FRED_API_KEY);
  base.searchParams.set("file_type", "json");
  base.searchParams.set("sort_order", "desc");
  base.searchParams.set("limit", "1");
  for (const [k, v] of Object.entries(params)) base.searchParams.set(k, v);

  const res = await fetch(base.toString(), { cache: "no-store" });
  const json = await res.json();
  const obs = json.observations?.[0];
  const val = obs && obs.value !== "." ? Number(obs.value) : undefined;
  return { date: obs?.date, value: Number.isFinite(val) ? val : undefined };
}

async function fetchMacroSnapshotUS() {
  const cpi = await fetchFRED("CPIAUCSL", { units: "pc1", frequency: "m" });
  const un = await fetchFRED("UNRATE", { frequency: "m" });
  const effr = await fetchFRED("EFFR");
  const gdp = await fetchFRED("A191RL1Q225SBEA", { frequency: "q" });

  return {
    asOf: TODAY,
    inflationYoY: cpi.value,
    unemploymentRate: un.value,
    policyRate: effr.value,
    gdpGrowthYoY: gdp.value,
    marketValuationNote: "Snapshot from latest FRED data releases.",
    risks: [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const { portfolio } = await req.json();
    if (!portfolio) return NextResponse.json({ error: "Missing portfolio" }, { status: 400 });

    const current_snapshot = await fetchMacroSnapshotUS();

    const system = `You are an investment research assistant. Educational output only; not financial advice.
Return STRICT JSON with key: scenarios.
Each scenario: { id, name, probability (0..1), narrative, assumptions{inflationYoY,unemploymentRate,policyRate,gdpGrowthYoY,other[]?}, portfolioGuidance }.
Rules:
- Probabilities must sum to 1.00 ±0.01.
- Assumptions must be consistent with the given snapshot.`;

    const facts = `Snapshot as of ${current_snapshot.asOf}:
Inflation YoY: ${current_snapshot.inflationYoY}%
Unemployment Rate: ${current_snapshot.unemploymentRate}%
Policy Rate: ${current_snapshot.policyRate}%
GDP Growth YoY: ${current_snapshot.gdpGrowthYoY}%`;

    const user = {
      role: "user" as const,
      content:
        `User answers:\n${JSON.stringify(portfolio, null, 2)}\n\n` +
        `Use this exact snapshot:\n${facts}\n\n` +
        `Create base, bullish, and risk-off scenarios consistent with it.`,
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
    let { scenarios } = payload || {};

    if (!Array.isArray(scenarios) || scenarios.length !== 3) {
      throw new Error("Model did not return 3 scenarios");
    }

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
