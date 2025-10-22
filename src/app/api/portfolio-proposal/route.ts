import { NextRequest, NextResponse } from "next/server";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const TODAY = new Date().toISOString().split("T")[0];

export async function POST(req: NextRequest) {
  try {
    const { portfolio } = await req.json();
    if (!portfolio) {
      return NextResponse.json({ error: "Missing portfolio" }, { status: 400 });
    }

    const systemPrompt = `You are an expert investment advisor who creates portfolio allocation strategies. Educational output only; not financial advice.
The current date is ${TODAY}. All analysis and recommendations must be current as of ${TODAY}.

Return STRICT JSON with keys: summary, holdings.

- summary: Object with keys:
  * "Economic Thesis": Current market outlook and economic environment analysis
  * "How Your Answers Shaped This": Explain how the user's questionnaire responses influenced the portfolio
  * "Portfolio Logic": Investment strategy and asset allocation rationale
  * "Key Trade-offs": Important risks and considerations

- holdings: Array of 8-16 items with { symbol: string, weight: number (0-100), note: string }
  * Use real, liquid stock tickers and ETFs only
  * Focus on PERCENTAGE ALLOCATION only - do NOT calculate prices, shares, or dollar amounts
  * Weights must sum to approximately 100
  * Include brief reasoning for each holding in the note field
  * Diversify appropriately based on user's risk tolerance and preferences
  * Recommend mix of individual stocks and ETFs for broad exposure

Rules:
- Respect all user constraints from questionnaire (risk tolerance, time horizon, focus areas, etc.)
- ONLY provide percentage weights - the system will handle price fetching and share calculations
- Target total weight of 90-95% (leaving 5-10% cash buffer)
- Use current market context and economic environment (October 2025)
- Round weights to whole numbers or 0.5 increments for easier allocation
- Focus on strategic asset allocation, not tactical price considerations`;

    const userContent = `User Portfolio Information:
${JSON.stringify({
  name: portfolio.name,
  riskTolerance: portfolio.riskTolerance,
  timeHorizon: portfolio.timeHorizon,
  approximateValue: portfolio.approximateValue,
  currency: portfolio.currency,
  exchanges: portfolio.exchanges,
  focus: portfolio.focus,
  rebalancing: portfolio.rebalancing,
  targetHoldings: portfolio.targetHoldings,
}, null, 2)}

Create a strategic portfolio allocation with:
1. Investment thesis based on current economic environment and user preferences
2. Percentage allocation for each recommended stock/ETF (aim for 90-95% total allocation)
3. Strategic rationale for each holding

FOCUS: Provide ONLY percentage allocations. The system will:
- Fetch current market prices from Yahoo Finance
- Calculate optimal share quantities based on available cash ($${portfolio.approximateValue})
- Optimize allocation to get as close as possible to your recommended percentages
- Handle fractional shares and cash buffer automatically

Do NOT include prices, share quantities, or dollar amounts - only strategic percentage allocation.`;

    const body = {
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.3,
    };

    // Stage 1: Get AI allocation strategy (weights only)
    const payload = await callOpenAI(body);
    let { summary, holdings } = payload || {};

    console.log('\n=== AI ALLOCATION STRATEGY ===');
    console.log('Holdings from AI:', JSON.stringify(holdings, null, 2));

    if (!summary) {
      throw new Error("No investment summary returned");
    }

    if (!Array.isArray(holdings) || holdings.length === 0) {
      throw new Error("No portfolio holdings returned");
    }

    // Normalize weights to sum to ~95% (leaving 5% cash buffer)
    holdings = normalizeWeights(holdings);
    
    // Stage 2: Fetch real market prices and calculate optimal allocation
    holdings = await calculateOptimalAllocation(holdings, portfolio.approximateValue || 10000);

    const totalInvestment = holdings.reduce((sum: number, h: any) => sum + (h.investmentAmount || 0), 0);
    const availableCash = portfolio.approximateValue || 10000;
    const cashBuffer = availableCash - totalInvestment;
    
    console.log(`\n=== FINAL ALLOCATION ===`);
    console.log(`Total Investment: $${totalInvestment}`);
    console.log(`Available Cash: $${availableCash}`);
    console.log(`Cash Buffer: $${cashBuffer}`);

    return NextResponse.json({ 
      summary, 
      holdings, 
      totalInvestment,
      availableCash,
      cashBuffer,
      asOf: TODAY 
    });

  } catch (e: any) {
    console.error("Portfolio generation error:", e);
    return NextResponse.json({ 
      error: e.message || "Failed to generate portfolio proposal" 
    }, { status: 500 });
  }
}

function normalizeWeights(holdings: any[]) {
  const rounded = holdings.map(h => ({ 
    ...h, 
    weight: Math.max(0, +(+h.weight).toFixed(1)) 
  }));
  
  const sum = rounded.reduce((a, b) => a + (b.weight || 0), 0);
  if (!sum) return rounded;
  
  // Normalize to 95% total allocation (5% cash buffer)
  const targetTotal = 95;
  return rounded.map(h => ({ 
    ...h, 
    weight: +(((h.weight || 0) / sum) * targetTotal).toFixed(1) 
  }));
}

async function calculateOptimalAllocation(holdings: any[], availableCash: number) {
  console.log('\n=== FETCHING REAL MARKET PRICES ===');
  
  // Extract symbols for price fetching
  const symbols = holdings.map(h => h.symbol);
  
  // Fetch current market prices
  let quotes: Record<string, any> = {};
  try {
    const res = await fetch('http://localhost:3000/api/quotes', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    const data = await res.json();
    quotes = data.quotes || {};
    console.log('Fetched prices:', Object.keys(quotes).map(symbol => `${symbol}: $${quotes[symbol]?.price}`));
  } catch (error) {
    console.error('Failed to fetch prices, using fallback estimates');
    // Fallback prices if API fails
    const fallbackPrices: Record<string, number> = {
      'AAPL': 247, 'MSFT': 420, 'GOOGL': 170, 'AMZN': 185, 'TSLA': 250, 'NVDA': 140,
      'SPY': 585, 'QQQ': 490, 'VTI': 270, 'VIG': 150, 'BND': 75
    };
    holdings.forEach(h => {
      quotes[h.symbol] = { price: fallbackPrices[h.symbol] || 100 };
    });
  }
  
  console.log('\n=== CALCULATING OPTIMAL ALLOCATION ===');
  const cashBuffer = availableCash * 0.05; // 5% cash buffer
  const investableCash = availableCash - cashBuffer;
  
  // Calculate target amounts and optimal shares
  let optimizedHoldings = holdings.map(h => {
    const targetAmount = (h.weight / 100) * investableCash;
    const currentPrice = quotes[h.symbol]?.price || 100; // fallback price
    const shares = Math.floor(targetAmount / currentPrice);
    const actualInvestment = shares * currentPrice;
    const actualWeight = (actualInvestment / investableCash) * 100;
    
    console.log(`${h.symbol}: Target=${h.weight}% ($${targetAmount.toFixed(0)}) → ${shares} shares @ $${currentPrice} = $${actualInvestment.toFixed(0)} (${actualWeight.toFixed(1)}%)`);
    
    return {
      ...h,
      estimatedPrice: currentPrice,
      recommendedShares: shares,
      investmentAmount: actualInvestment,
      weight: +actualWeight.toFixed(1)
    };
  });
  
  // Check if we're significantly under-invested and try to optimize
  const totalInvested = optimizedHoldings.reduce((sum, h) => sum + h.investmentAmount, 0);
  const unusedCash = investableCash - totalInvested;
  
  console.log(`Initial allocation: $${totalInvested.toFixed(0)} invested, $${unusedCash.toFixed(0)} unused`);
  
  // If we have significant unused cash (>2% of available), try to redistribute
  if (unusedCash > availableCash * 0.02) {
    console.log('Optimizing allocation to use more available cash...');
    optimizedHoldings = redistributeUnusedCash(optimizedHoldings, unusedCash, investableCash);
  }
  
  return optimizedHoldings;
}

function redistributeUnusedCash(holdings: any[], unusedCash: number, investableCash: number) {
  // Sort by largest holdings first (they can absorb more cash)
  const sortedHoldings = [...holdings].sort((a, b) => b.investmentAmount - a.investmentAmount);
  
  let remainingCash = unusedCash;
  
  for (const holding of sortedHoldings) {
    if (remainingCash < holding.estimatedPrice) continue; // Can't buy even 1 more share
    
    const additionalShares = Math.floor(remainingCash / holding.estimatedPrice);
    const additionalInvestment = additionalShares * holding.estimatedPrice;
    
    holding.recommendedShares += additionalShares;
    holding.investmentAmount += additionalInvestment;
    holding.weight = (holding.investmentAmount / investableCash) * 100;
    
    remainingCash -= additionalInvestment;
    
    console.log(`Added ${additionalShares} shares to ${holding.symbol}, new total: ${holding.recommendedShares} shares ($${holding.investmentAmount.toFixed(0)})`);
    
    if (remainingCash < 50) break; // Stop if less than $50 remaining
  }
  
  return holdings;
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
  if (!res.ok) {
    throw new Error(json?.error?.message || `OpenAI HTTP ${res.status}`);
  }

  let content = json.choices?.[0]?.message?.content || "{}";
  
  // Handle code fence wrapped JSON
  const fence = content.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fence) content = fence[1];
  
  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error("JSON parse error:", parseError, "Content:", content);
    throw new Error("Invalid JSON response from AI model");
  }
}
