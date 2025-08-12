import { NextRequest, NextResponse } from "next/server";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const TODAY = new Date().toISOString().split("T")[0];

export async function POST(req: NextRequest) {
  try {
    const { portfolio, scenarioId } = await req.json();
    if (!portfolio || !scenarioId) {
      return NextResponse.json({ error: "Missing portfolio or scenarioId" }, { status: 400 });
    }

    const systemPrompt = `You are an investment assistant who converts a chosen macro scenario into a portfolio. Educational output only; not financial advice.
The current date is ${TODAY}. All macroeconomic analysis and data must be presented as of ${TODAY}, not from any earlier year unless giving clear historical comparison.
Return STRICT JSON with keys: summary, holdings.
- summary: either a single Markdown string OR an object with keys ["Economic Thesis","How Your Answers Shaped This","Portfolio Logic","Key Trade-offs"].
- holdings: array of 8–16 items { symbol: string, weight: number (0..100), note: string }.
Rules:
- Weights rounded to 2 decimals and sum to ~100.
- Use liquid large/mid-cap tickers and/or ETFs (tickers only).
- Respect user constraints from the questionnaire.
- Avoid stale references to past economic conditions unless explicitly noted as history.`;

    const userPrompt = `User answers: ${JSON.stringify(portfolio)}. Convert the scenario id "${scenarioId}" into a portfolio. Explain the logic concisely and tie it to the scenario assumptions. Ensure all macroeconomic context is current as of ${TODAY}.`;

    const body = {
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
    };

    const payload = await callOpenAI(body);
    let { summary, holdings } = payload || {};

    if (!Array.isArray(holdings) || holdings.length === 0) {
      throw new Error("No holdings returned");
    }

    holdings = renormalize(holdings);

    return NextResponse.json({ summary, holdings, asOf: TODAY });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to build portfolio" }, { status: 500 });
  }
}

function renormalize(holdings: any[]) {
  const rounded = holdings.map(h => ({ ...h, weight: Math.max(0, +(+h.weight).toFixed(2)) }));
  const sum = rounded.reduce((a, b) => a + (b.weight || 0), 0);
  if (!sum) return rounded;
  return rounded.map(h => ({ ...h, weight: +(((h.weight || 0) / sum) * 100).toFixed(2) }));
}

async function callOpenAI(body: any, attempt = 0): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if ((res.status === 429 || (res.status >= 500 && res.status < 600)) && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after")) || Math.pow(2, attempt) * 500;
    await new Promise(r => setTimeout(r, retryAfter));
    return callOpenAI(body, attempt + 1);
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI HTTP ${res.status}`);

  let content = json.choices?.[0]?.message?.content || "{}";
  const fence = content.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fence) content = fence[1];

  return JSON.parse(content);
}
