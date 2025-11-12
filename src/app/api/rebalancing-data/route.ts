import { NextRequest, NextResponse } from "next/server";

/**
 * REBALANCING DATA API
 * ====================
 * This endpoint calculates historical portfolio performance with quarterly rebalancing
 * using the EXACT SAME economic model as the Risk Budgeting backtest.
 * 
 * KEY PRINCIPLES:
 * 1. Start with fixed weights (target allocation)
 * 2. Calculate daily portfolio returns (weighted sum of asset returns)
 * 3. Allow weights to drift naturally due to price movements
 * 4. Every quarter: rebalance back to target weights (with 0.1% transaction cost)
 * 5. Track portfolio value, volatility, Sharpe ratio at each rebalance
 * 
 * This ensures the Portfolio Detail page shows the SAME data as Risk Budgeting generation.
 */

export async function POST(req: NextRequest) {
  try {
    const { symbols, startDate, endDate, weights } = await req.json();
    
    console.log('=== REBALANCING DATA API CALLED ===');
    console.log('Symbols:', symbols);
    console.log('Weights:', weights);
    console.log('Period:', startDate, 'to', endDate);
    
    // STEP 1: Fetch historical daily prices from Yahoo Finance
    const historicalDataPromises = symbols.map(async (symbol: string) => {
      const period1 = Math.floor(new Date(startDate).getTime() / 1000);
      const period2 = Math.floor(new Date(endDate).getTime() / 1000);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!response.ok) {
        console.warn(`Failed to fetch ${symbol}`);
        return { symbol, prices: [] };
      }
      
      const data = await response.json();
      const result = data.chart?.result?.[0];
      
      if (!result) return { symbol, prices: [] };
      
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      
      const prices = timestamps.map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        price: closes[i]
      })).filter((p: any) => p.price != null);
      
      return { symbol, prices };
    });
    
    const allData = await Promise.all(historicalDataPromises);
    const priceData: Record<string, any[]> = {};
    allData.forEach(item => {
      priceData[item.symbol] = item.prices;
    });
    
    console.log('Fetched price data for', Object.keys(priceData).length, 'symbols');
    
    // STEP 2: Generate quarterly rebalancing dates
    const rebalanceDates: string[] = [];
    let currentDate = new Date(startDate);
    currentDate.setMonth(Math.ceil((currentDate.getMonth() + 1) / 3) * 3);
    currentDate.setDate(1);
    const end = new Date(endDate);
    
    while (currentDate <= end) {
      rebalanceDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setMonth(currentDate.getMonth() + 3);
    }
    
    console.log('Generated', rebalanceDates.length, 'rebalancing dates');
    
    // STEP 3: Calculate portfolio performance with rebalancing
    // This is the CORE ECONOMIC MODEL
    
    let portfolioValue = 10000; // Start with $10,000
    const targetWeights = weights.map((w: number) => w / 100); // Convert to decimal
    let currentWeights = [...targetWeights]; // Start with target weights
    const rebalancingData = [];
    
    // Get all unique dates from price data
    const allDates = new Set<string>();
    Object.values(priceData).forEach((prices: any[]) => {
      prices.forEach(p => allDates.add(p.date));
    });
    const sortedDates = Array.from(allDates).sort();
    
    console.log('Total trading days:', sortedDates.length);
    
    // Track previous day's prices for return calculation
    let prevPrices: Record<string, number> = {};
    
    // Initialize with first day's prices
    symbols.forEach((symbol: string) => {
      const prices = priceData[symbol] || [];
      const firstPrice = prices.find(p => p.date >= sortedDates[0])?.price;
      if (firstPrice) prevPrices[symbol] = firstPrice;
    });
    
    // Process each rebalancing period
    for (let rebalanceIdx = 0; rebalanceIdx < rebalanceDates.length; rebalanceIdx++) {
      const rebalanceDate = rebalanceDates[rebalanceIdx];
      const prevRebalanceDate = rebalanceIdx > 0 ? rebalanceDates[rebalanceIdx - 1] : startDate;
      
      // Find dates in this rebalancing period
      const periodDates = sortedDates.filter(d => d > prevRebalanceDate && d <= rebalanceDate);
      
      // Track daily returns for volatility calculation
      const dailyReturns: number[] = [];
      
      // Simulate each day in this period
      for (const date of periodDates) {
        let dailyPortfolioReturn = 0;
        let validAssets = 0;
        
        // Calculate portfolio return for this day
        symbols.forEach((symbol: string, idx: number) => {
          const prices = priceData[symbol] || [];
          const todayPrice = prices.find(p => p.date === date)?.price || prevPrices[symbol];
          const yesterdayPrice = prevPrices[symbol];
          
          if (todayPrice && yesterdayPrice && yesterdayPrice > 0) {
            const assetReturn = (todayPrice - yesterdayPrice) / yesterdayPrice;
            dailyPortfolioReturn += currentWeights[idx] * assetReturn;
            validAssets++;
            
            // Update weight based on asset return (weight drift)
            currentWeights[idx] = currentWeights[idx] * (1 + assetReturn);
          }
          
          // Update previous price
          if (todayPrice) prevPrices[symbol] = todayPrice;
        });
        
        // Normalize weights (they should still sum to 1, but floating point errors)
        const sumWeights = currentWeights.reduce((sum, w) => sum + w, 0);
        if (sumWeights > 0) {
          currentWeights = currentWeights.map(w => w / sumWeights);
        }
        
        // Update portfolio value
        if (validAssets > 0) {
          portfolioValue *= (1 + dailyPortfolioReturn);
          dailyReturns.push(dailyPortfolioReturn);
        }
      }
      
      // Calculate weight changes (drift) before rebalancing
      const weightChanges = symbols.map((symbol: string, idx: number) => {
        const beforeWeight = currentWeights[idx] * 100;
        const afterWeight = targetWeights[idx] * 100;
        const drift = beforeWeight - afterWeight;
        
        return {
          symbol,
          beforeWeight: beforeWeight.toFixed(2),
          afterWeight: afterWeight.toFixed(2),
          drift: drift.toFixed(2)
        };
      });
      
      // Calculate quarterly metrics
      const qtrReturn = dailyReturns.reduce((sum, r) => sum + r, 0) * 100;
      const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / (dailyReturns.length || 1);
      const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (dailyReturns.length || 1);
      const annualizedVol = Math.sqrt(variance * 252) * 100;
      const sharpe = annualizedVol > 0 ? ((avgReturn * 252) / (annualizedVol / 100)) : 0;
      
      // Apply rebalancing: reset weights to target
      currentWeights = [...targetWeights];
      
      // Apply transaction cost (0.1% of portfolio value)
      portfolioValue *= 0.999;
      
      rebalancingData.push({
        date: rebalanceDate,
        portfolioValue: portfolioValue.toFixed(2),
        weightChanges,
        qtrReturn: qtrReturn.toFixed(2),
        vol: annualizedVol.toFixed(2),
        sharpe: sharpe.toFixed(2)
      });
      
      console.log(`Rebalance ${rebalanceIdx + 1}: Date=${rebalanceDate}, Value=$${portfolioValue.toFixed(2)}, Return=${qtrReturn.toFixed(2)}%`);
    }
    
    console.log('=== CALCULATION COMPLETE ===');
    console.log('Final portfolio value:', portfolioValue.toFixed(2));
    console.log('Total rebalances:', rebalancingData.length);
    
    return NextResponse.json({ rebalancingData });
    
  } catch (error: any) {
    console.error('Error calculating rebalancing data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate rebalancing data' },
      { status: 500 }
    );
  }
}
