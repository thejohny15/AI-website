import { NextRequest, NextResponse } from 'next/server';
import { calculateCovarianceMatrix, calculateRiskContributions, calculateReturns } from '@/lib/riskBudgeting';

/**
 * API Route: Calculate True Risk Contributions
 * 
 * Calculates actual risk contribution for each asset based on:
 * 1. Current weights (market-driven)
 * 2. Historical volatility (rolling window based on user's lookback period)
 * 3. Correlation matrix
 * 
 * Risk Contribution = (weight × asset_volatility × correlation_factor) / portfolio_volatility
 */
export async function POST(req: NextRequest) {
  try {
    const { symbols, currentWeights, lookbackPeriod } = await req.json();
    
    // Determine lookback days
    const lookbackDays = lookbackPeriod === '1y' ? 252 : lookbackPeriod === '3y' ? 756 : 1260; // 5y default
    
    // Fetch historical prices for all symbols using our existing API
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays - 10); // Extra buffer
    
    const historicalData: Record<string, number[]> = {};
    
    // Fetch all historical data in one call using the existing API
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/historical-quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch historical data');
      }
      
      const data = await response.json();
      
      // Extract prices from the response
      for (const symbol of symbols) {
        const symbolData = data.historicalPrices?.[symbol] || [];
        const prices = symbolData.map((item: any) => item.price).filter((p: number | null) => p !== null);
        historicalData[symbol] = prices.slice(-lookbackDays);
      }
    } catch (error) {
      console.error('Error fetching historical data:', error);
      return NextResponse.json(
        { error: 'Failed to fetch historical data' },
        { status: 500 }
      );
    }
    
    // Calculate returns for each asset
    const returnsData: number[][] = [];
    for (const symbol of symbols) {
      const prices = historicalData[symbol];
      const returns = calculateReturns(prices); // Use function from riskBudgeting.ts
      returnsData.push(returns);
    }
    
    // Calculate covariance matrix using EXACT same function as portfolio creation
    const covMatrix = calculateCovarianceMatrix(returnsData);
    
    // Convert currentWeights from Record<string, number> to array matching symbols order
    const weightsArray = symbols.map((symbol: string) => currentWeights[symbol]);
    
    // Calculate risk contributions using EXACT same function as portfolio creation
    const { percentages } = calculateRiskContributions(weightsArray, covMatrix);
    
    // Map back to symbol -> risk contribution
    const riskContributions: Record<string, number> = {};
    symbols.forEach((symbol: string, i: number) => {
      riskContributions[symbol] = percentages[i];
    });
    
    console.log('📊 Risk contributions (using riskBudgeting.ts functions):', riskContributions);
    
    return NextResponse.json({
      riskContributions,
      lookbackPeriod
    });
    
  } catch (error) {
    console.error('Error calculating risk contributions:', error);
    return NextResponse.json(
      { error: 'Failed to calculate risk contributions' },
      { status: 500 }
    );
  }
}

