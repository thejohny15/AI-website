// filepath: /Users/johnjohn/my-ai-app/src/app/api/risk-budgeting/route.ts

import { NextRequest, NextResponse } from "next/server";
import {
  calculateReturns,
  calculateCovarianceMatrix,
  optimizeERC,
  calculateExpectedReturn,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateCorrelationMatrix,
  calculateAverageCorrelation,
} from "@/lib/riskBudgeting";
import {
  runBacktest,
  compareStrategies,
  findWorstPeriod,
  stressTestVolatility,
} from "@/lib/backtest";

interface AssetClass {
  ticker: string;
  name: string;
}

/**
 * Fetch historical data from Yahoo Finance API
 * @param ticker - Stock ticker symbol
 * @param lookbackDays - Number of days to fetch (default 5 years)
 */
async function fetchHistoricalData(ticker: string, lookbackDays: number = 365 * 5): Promise<{ prices: number[]; dates: string[]; dividends: number[] }> {
  try {
    // Calculate date range
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (lookbackDays * 24 * 60 * 60); // Convert days to seconds
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startDate}&period2=${endDate}&interval=1d&events=div`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data for ${ticker}: ${response.status}`);
    }
    
    const data = await response.json();
    
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error(`No data returned for ${ticker}`);
    }
    
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const dividendEvents = result.events?.dividends || {};
    
    // Create dividend map: date -> dividend amount
    const dividendMap = new Map<string, number>();
    for (const [timestamp, divData] of Object.entries(dividendEvents)) {
      const date = new Date(parseInt(timestamp) * 1000).toISOString().split('T')[0];
      dividendMap.set(date, (divData as any).amount || 0);
    }
    
    // Filter out null values and create aligned arrays with dividends
    const prices: number[] = [];
    const dates: string[] = [];
    const dividends: number[] = [];
    
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
        prices.push(closes[i]);
        dates.push(date);
        dividends.push(dividendMap.get(date) || 0);
      }
    }
    
    if (prices.length < 100) {
      throw new Error(`Insufficient data for ${ticker}: only ${prices.length} points`);
    }
    
    return { prices, dates, dividends };
  } catch (error: any) {
    console.error(`Error fetching data for ${ticker}:`, error.message);
    throw error;
  }
}

/**
 * Align price series to common dates (intersection of all available dates)
 */
function alignPriceSeries(
  dataMap: Map<string, { prices: number[]; dates: string[]; dividends: number[] }>
): { prices: Map<string, number[]>, dividends: Map<string, number[]> } {
  // Get all tickers
  const tickers = Array.from(dataMap.keys());
  
  // Find common dates (intersection)
  const dateSets = tickers.map(t => new Set(dataMap.get(t)!.dates));
  const commonDates = Array.from(dateSets[0]).filter(date =>
    dateSets.every(set => set.has(date))
  ).sort();
  
  // Create aligned price and dividend series
  const alignedPrices = new Map<string, number[]>();
  const alignedDividends = new Map<string, number[]>();
  
  for (const ticker of tickers) {
    const data = dataMap.get(ticker)!;
    const dateToPrice = new Map(data.dates.map((d, i) => [d, data.prices[i]]));
    const dateToDividend = new Map(data.dates.map((d, i) => [d, data.dividends[i]]));
    
    const pricesArray = commonDates.map(date => dateToPrice.get(date)!);
    const dividendsArray = commonDates.map(date => dateToDividend.get(date) || 0);
    
    alignedPrices.set(ticker, pricesArray);
    alignedDividends.set(ticker, dividendsArray);
  }
  
  return { prices: alignedPrices, dividends: alignedDividends };
}

export async function POST(req: NextRequest) {
  console.log("=== RISK BUDGETING API CALLED ===");
  
  try {
    const { assetClasses, customBudgets, targetVolatility, lookbackPeriod = '5y', includeDividends = true } = await req.json();
    
    console.log("Received asset classes:", assetClasses);
    console.log("Custom budgets:", customBudgets);
    console.log("Target volatility:", targetVolatility);
    console.log("Lookback period:", lookbackPeriod);
    console.log("Include dividends:", includeDividends);
    
    if (!Array.isArray(assetClasses) || assetClasses.length < 2) {
      return NextResponse.json(
        { error: "Please provide at least 2 asset classes" },
        { status: 400 }
      );
    }

    // Validate custom budgets if provided
    if (customBudgets && Array.isArray(customBudgets)) {
      if (customBudgets.length !== assetClasses.length) {
        return NextResponse.json(
          { error: "Custom budgets length must match asset classes" },
          { status: 400 }
        );
      }
      const sum = customBudgets.reduce((s: number, v: number) => s + v, 0);
      if (Math.abs(sum - 100) > 0.01) {
        return NextResponse.json(
          { error: `Custom budgets must sum to 100%. Current sum: ${sum.toFixed(2)}%` },
          { status: 400 }
        );
      }
    }
    
    // Fetch historical data for all assets
    console.log("Fetching historical data for:", assetClasses.map((a: AssetClass) => a.ticker));
    
    // Calculate how much data we need
    // 
    // For TODAY'S portfolio display:
    //   - Use lookbackPeriod (e.g., 5 years) of data to optimize
    // 
    // For BACKTEST of that portfolio:
    //   - Need ANOTHER lookbackPeriod BEFORE the backtest start
    //   - Example: 5-year backtest starting Nov 2020 needs data from Nov 2015
    // 
    // Total data needed: 2 × lookbackPeriod
    const backtestPeriodDays: Record<string, number> = {
      '1y': 365,
      '3y': 365 * 3,
      '5y': 365 * 5,
    };
    const lookbackDays = backtestPeriodDays[lookbackPeriod as keyof typeof backtestPeriodDays] || 365 * 5;
    const daysToFetch = lookbackDays * 2; // Need 2x: one for initial optimization, one for backtest
    
    console.log(`Fetching ${daysToFetch} days total (${lookbackDays} for optimization + ${lookbackDays} for backtest)`);
    
    const dataPromises = assetClasses.map((asset: AssetClass) =>
      fetchHistoricalData(asset.ticker, daysToFetch).then(data => ({ ticker: asset.ticker, ...data }))
    );
    
    const historicalData = await Promise.all(dataPromises);
    console.log("Fetched data points:", historicalData.map(d => `${d.ticker}: ${d.prices.length} points`));
    
    // Create a map of ticker -> {prices, dates, dividends}
    const dataMap = new Map(
      historicalData.map(d => [d.ticker, { prices: d.prices, dates: d.dates, dividends: d.dividends }])
    );
    
    // Align all price and dividend series to common dates
    const { prices: alignedPrices, dividends: alignedDividends } = alignPriceSeries(dataMap);
    console.log("Aligned to common dates, points per asset:", Array.from(alignedPrices.values())[0].length);
    
    // Split data for QARM out-of-sample validation
    // OLDER data (2015-2020): Calculate backtest initial weights
    // RECENT data (2020-2025): Calculate today's portfolio AND run backtest simulation
    const totalPoints = Array.from(alignedPrices.values())[0].length;
    const splitPoint = Math.floor(totalPoints / 2); // Split 50/50
    
    console.log(`\n=== QARM DATA SPLIT (OUT-OF-SAMPLE) ===`);
    console.log(`Total data points: ${totalPoints}`);
    console.log(`OLDER PERIOD (first half): ${splitPoint} points → calculate backtest initial weights`);
    console.log(`RECENT PERIOD (second half): ${totalPoints - splitPoint} points → today's portfolio + backtest simulation`);
    
    // OLDER data: for calculating backtest initial weights (2015-2020)
    const backtestWeightsPrices = new Map<string, number[]>();
    for (const [ticker, prices] of alignedPrices.entries()) {
      backtestWeightsPrices.set(ticker, prices.slice(0, splitPoint));
    }
    
    // RECENT data: for today's portfolio optimization (2020-2025)
    const todaysPrices = new Map<string, number[]>();
    const todaysDividends = new Map<string, number[]>();
    for (const [ticker, prices] of alignedPrices.entries()) {
      todaysPrices.set(ticker, prices.slice(splitPoint));
      todaysDividends.set(ticker, alignedDividends.get(ticker)!.slice(splitPoint));
    }
    
    // RECENT data: for backtest simulation (same as today's - 2020-2025)
    const backtestPrices = new Map<string, number[]>();
    const backtestDividends = new Map<string, number[]>();
    for (const [ticker, prices] of alignedPrices.entries()) {
      backtestPrices.set(ticker, prices.slice(splitPoint));
      backtestDividends.set(ticker, alignedDividends.get(ticker)!.slice(splitPoint));
    }
    
    // Calculate returns for each asset (using ONLY optimization period data)
    // 
    // IMPORTANT: We calculate TWO types of returns:
    // 1. PRICE returns (no dividends) → for covariance/correlation/optimization
    //    - Dividends are predictable, scheduled payments (not market volatility)
    //    - Including them distorts correlation (creates artificial correlation on ex-div dates)
    //    - Risk models should use pure price movements
    // 
    // 2. TOTAL returns (with dividends) → for expected return calculation
    //    - This is what investors actually earn
    //    - Used for performance metrics and Sharpe ratio
    
    // ============================================================================
    // STEP 1: Calculate BACKTEST INITIAL WEIGHTS using OLDER data (2015-2020)
    // ============================================================================
    console.log("\n=== CALCULATING BACKTEST INITIAL WEIGHTS (from older period) ===");
    const backtestWeightsReturns: number[][] = [];
    const backtestTickers: string[] = [];
    
    for (const asset of assetClasses) {
      const prices = backtestWeightsPrices.get(asset.ticker)!;
      const priceReturns = calculateReturns(prices); // Price returns only
      backtestWeightsReturns.push(priceReturns);
      backtestTickers.push(asset.ticker);
    }
    
    const backtestCovMatrix = calculateCovarianceMatrix(backtestWeightsReturns);
    const backtestTargetBudgets = customBudgets 
      ? customBudgets.map((b: number) => b / 100)
      : undefined;
    const backtestOptimization = optimizeERC(backtestCovMatrix, 1000, 1e-6, backtestTargetBudgets);
    const backtestInitialWeights = backtestOptimization.weights;
    
    console.log("Backtest initial weights (from older period):", 
      backtestInitialWeights.map((w, i) => `${backtestTickers[i]}: ${(w * 100).toFixed(2)}%`).join(", "));
    console.log("These will be used to start the 2020-2025 simulation");
    
    // ============================================================================
    // STEP 2: Calculate TODAY'S PORTFOLIO WEIGHTS using RECENT data (2020-2025)
    // ============================================================================
    console.log("\n=== CALCULATING TODAY'S PORTFOLIO WEIGHTS (from recent period) ===");
    const priceReturnsData: number[][] = [];  // For risk/correlation (no dividends)
    const totalReturnsData: number[][] = [];  // For expected return (with dividends)
    const meanReturns: number[] = [];
    const tickers: string[] = [];
    
    for (const asset of assetClasses) {
      const prices = todaysPrices.get(asset.ticker)!;
      const dividends = todaysDividends.get(asset.ticker)!;
      
      // Price returns ONLY (for covariance matrix and optimization)
      const priceReturns = calculateReturns(prices); // No dividends
      priceReturnsData.push(priceReturns);
      
      // Total returns (for expected return calculation)
      const totalReturns = includeDividends 
        ? calculateReturns(prices, dividends)  // With dividends
        : priceReturns;  // Same as price returns if dividends disabled
      totalReturnsData.push(totalReturns);
      
      // Calculate annualized mean return using TOTAL returns
      const meanReturn = totalReturns.reduce((sum, r) => sum + r, 0) / totalReturns.length * 252;
      meanReturns.push(meanReturn);
      tickers.push(asset.ticker);
    }
    
    // Calculate covariance matrix using PRICE returns only
    // This ensures correlation and risk calculations reflect true market movements,
    // not artificial correlation from dividend payment schedules
    const covMatrix = calculateCovarianceMatrix(priceReturnsData);
    console.log("Covariance matrix calculated (using price returns only)");
    
    // Run optimization (ERC or custom risk budgeting)
    console.log(customBudgets ? "Running custom risk budgeting optimization..." : "Running ERC optimization...");
    const targetBudgets = customBudgets 
      ? customBudgets.map((b: number) => b / 100) // Convert percentages to decimals
      : undefined;
    const optimization = optimizeERC(covMatrix, 1000, 1e-6, targetBudgets);
    
    console.log("Optimization result:", {
      converged: optimization.converged,
      iterations: optimization.iterations,
      weights: optimization.weights.map((w, i) => `${tickers[i]}: ${(w * 100).toFixed(2)}%`),
      riskContributions: optimization.riskContributions.map((rc, i) => `${tickers[i]}: ${rc.toFixed(2)}%`),
    });
    
    if (!optimization.converged) {
      console.warn("Optimization did not fully converge");
    }
    
    // Apply volatility targeting if specified
    let finalWeights = [...optimization.weights];
    let scalingFactor = 1;
    const portfolioVol = optimization.portfolioVolatility;
    
    if (targetVolatility && targetVolatility > 0) {
      scalingFactor = targetVolatility / portfolioVol;
      finalWeights = optimization.weights.map(w => w * scalingFactor);
      console.log(`Volatility targeting: scaling from ${(portfolioVol * 100).toFixed(2)}% to ${(targetVolatility * 100).toFixed(2)}% (factor: ${scalingFactor.toFixed(2)}x)`);
    }
    
    // Calculate portfolio metrics
    const expectedReturn = calculateExpectedReturn(finalWeights, meanReturns);
    const targetedVol = targetVolatility || portfolioVol;
    const sharpeRatio = calculateSharpeRatio(expectedReturn, targetedVol);
    
    console.log('📊 Portfolio metrics calculated:', {
      expectedReturn: expectedReturn.toFixed(2),
      portfolioVol: (portfolioVol * 100).toFixed(2),
      targetedVol: (targetedVol * 100).toFixed(2),
      sharpeRatio: sharpeRatio.toFixed(2),
      meanReturns: meanReturns.map((r, i) => `${tickers[i]}: ${r.toFixed(2)}%`),
      dataSource: 'Recent period (2nd half of data)',
      note: 'These are FORWARD-LOOKING estimates based on recent returns'
    });
    
    // Calculate max drawdown for a hypothetical portfolio
    const maxDrawdowns = assetClasses.map((asset: AssetClass) => {
      const prices = alignedPrices.get(asset.ticker)!;
      return calculateMaxDrawdown(prices);
    });
    const portfolioMaxDD = optimization.weights.reduce(
      (sum, w, i) => sum + w * maxDrawdowns[i],
      0
    ) * scalingFactor;
    
    // Format results
    const weights = assetClasses.map((asset: AssetClass, i: number) => ({
      name: asset.name,
      ticker: asset.ticker,
      weight: (finalWeights[i] * 100).toFixed(2),
      riskContribution: optimization.riskContributions[i].toFixed(2),
    }));
    
    const metrics = {
      portfolioVolatility: (targetedVol * 100).toFixed(2),
      sharpeRatio: sharpeRatio.toFixed(2),
      expectedReturn: expectedReturn.toFixed(2),
      maxDrawdown: portfolioMaxDD.toFixed(2),
    };
    
    const asOf = new Date().toISOString().split('T')[0];
    
    // Calculate correlation matrix from covariance matrix (using price returns)
    const correlationMatrix = calculateCorrelationMatrix(covMatrix);
    const avgCorrelation = calculateAverageCorrelation(correlationMatrix);
    
    // Run backtest for advanced analytics
    console.log("Running historical backtest...");
    
    // Use backtest period (RECENT data 2020-2025) with BACKTEST INITIAL WEIGHTS (from older 2015-2020)
    const backtestDateArray = historicalData[0].dates.slice(splitPoint);
    
    console.log(`Backtest simulation period: ${backtestDateArray[0]} to ${backtestDateArray[backtestDateArray.length - 1]} (${backtestDateArray.length} days)`);
    console.log(`Using initial weights optimized from older period (2015-2020) - OUT-OF-SAMPLE TEST`);
    console.log(`Today's portfolio optimized on: ${historicalData[0].dates[splitPoint]} to ${historicalData[0].dates[historicalData[0].dates.length - 1]}`);
    
    // Convert lookback period to years for backtest
    const lookbackYears = lookbackPeriod === '1y' ? 1 : lookbackPeriod === '3y' ? 3 : 5;
    
    const backtest = runBacktest(
      backtestPrices,  // Use RECENT period prices (2020-2025)
      backtestDividends,  // Use RECENT period dividends
      backtestDateArray,  // Use RECENT period dates
      backtestInitialWeights,  // Use weights from OLDER period (2015-2020) - KEY CHANGE!
      tickers,
      { frequency: 'quarterly', transactionCost: 0.001 },
      10000,
      includeDividends,  // Control reinvestment based on user preference
      backtestTargetBudgets,  // Pass custom budgets for dynamic rebalancing
      lookbackYears  // Pass lookback period for quarterly rebalancing
    );
    
    // Strategy comparison (also on backtest period only)
    console.log("Running strategy comparison...");
    const comparison = compareStrategies(
      backtestPrices,  // Use only backtest period prices
      backtestDividends,  // Always pass dividend data
      backtestDateArray,  // Use only backtest period dates
      tickers,
      backtestInitialWeights,  // Use backtest initial weights for fair comparison
      { frequency: 'quarterly', transactionCost: 0.001 },
      includeDividends,  // Control reinvestment based on user preference
      backtestTargetBudgets,  // Pass custom budgets for dynamic rebalancing
      lookbackYears  // Pass lookback period for quarterly rebalancing
    );
    
    // Find worst crisis period
    const worstPeriod = findWorstPeriod(backtest.portfolioValues, backtestDateArray, 30);
    
    console.log("=== RETURNING RESULTS ===");
    console.log("Metrics:", metrics);
    
    // Calculate dividend contribution
    // Note: Dividend yield is calculated over the BACKTEST period specifically
    // This matches the lookback period selected by the user and provides
    // a realistic estimate based on recent historical data
    let dividendContribution;
    
    // Calculate average dividend yield across assets using backtest period data
    const avgDividendYields = tickers.map((ticker, i) => {
      const divs = backtestDividends.get(ticker)!;
      const prices = backtestPrices.get(ticker)!;
      
      // Calculate yield for each day where dividend was paid
      let totalYield = 0;
      let divPayments = 0;
      
      for (let idx = 1; idx < divs.length; idx++) {
        if (divs[idx] > 0 && prices[idx - 1] > 0) {
          totalYield += (divs[idx] / prices[idx - 1]);
          divPayments++;
        }
      }
      
      // Annualize based on average yield per payment
      // Most ETFs pay quarterly (4 times/year)
      const avgYieldPerPayment = divPayments > 0 ? totalYield / divPayments : 0;
      const paymentsPerYear = divPayments > 0 ? (divPayments / (divs.length / 252)) : 4; // Default to quarterly
      const annualizedYield = avgYieldPerPayment * paymentsPerYear * 100;
      
      return annualizedYield;
    });
    
    const portfolioDivYield = optimization.weights.reduce((sum, w, i) => {
      return sum + w * avgDividendYields[i];
    }, 0);
    
    dividendContribution = {
      portfolioDividendYield: portfolioDivYield.toFixed(2),
      assetYields: tickers.map((ticker, i) => ({
        ticker,
        yield: avgDividendYields[i].toFixed(2)
      })),
      calculatedOver: `${lookbackPeriod} backtest period`
    };
    
    return NextResponse.json({
      weights,
      metrics,
      asOf,
      correlationMatrix,
      avgCorrelation,
      optimization: {
        converged: optimization.converged,
        iterations: optimization.iterations,
      },
      includeDividends,
      dividendContribution,
      volatilityTargeting: targetVolatility ? {
        targetVolatility: (targetVolatility * 100).toFixed(2),
        naturalVolatility: (portfolioVol * 100).toFixed(2),
        scalingFactor: scalingFactor.toFixed(3),
        leverage: scalingFactor > 1 ? `${((scalingFactor - 1) * 100).toFixed(1)}% leverage` : `${((1 - scalingFactor) * 100).toFixed(1)}% cash`,
      } : undefined,
      analytics: {
        backtest: {
          finalValue: backtest.finalValue.toFixed(2),
          totalReturn: backtest.totalReturn.toFixed(2),
          annualizedReturn: backtest.annualizedReturn.toFixed(2),
          annualizedVolatility: backtest.annualizedVolatility.toFixed(2),
          sharpeRatio: backtest.sharpeRatio.toFixed(2),
          maxDrawdown: backtest.maxDrawdown.toFixed(2),
          maxDrawdownPeriod: backtest.maxDrawdownPeriod,
          rebalanceCount: backtest.rebalanceCount,
          portfolioValues: backtest.portfolioValues.map(v => parseFloat(v.toFixed(2))),
          dates: backtestDateArray,
          rebalanceDates: backtest.rebalanceDates,
          dividendCash: backtest.dividendCash ? parseFloat(backtest.dividendCash.toFixed(2)) : undefined,
          dividendCashIfReinvested: backtest.dividendCashIfReinvested ? parseFloat(backtest.dividendCashIfReinvested.toFixed(2)) : undefined,
          missedDividendOpportunity: backtest.missedDividendOpportunity ? parseFloat(backtest.missedDividendOpportunity.toFixed(2)) : undefined,
          shadowPortfolioValue: backtest.shadowPortfolioValue ? parseFloat(backtest.shadowPortfolioValue.toFixed(2)) : undefined,
          shadowTotalReturn: backtest.shadowTotalReturn ? parseFloat(backtest.shadowTotalReturn.toFixed(2)) : undefined,
        },
        comparison: {
          riskBudgeting: {
            return: comparison.riskBudgeting.annualizedReturn.toFixed(2),
            volatility: comparison.riskBudgeting.annualizedVolatility.toFixed(2),
            sharpe: comparison.riskBudgeting.sharpeRatio.toFixed(2),
            maxDrawdown: comparison.riskBudgeting.maxDrawdown.toFixed(2),
          },
          equalWeight: {
            return: comparison.equalWeight.annualizedReturn.toFixed(2),
            volatility: comparison.equalWeight.annualizedVolatility.toFixed(2),
            sharpe: comparison.equalWeight.sharpeRatio.toFixed(2),
            maxDrawdown: comparison.equalWeight.maxDrawdown.toFixed(2),
          },
        },
        stressTest: {
          worstPeriod: {
            start: worstPeriod.startDate,
            end: worstPeriod.endDate,
            loss: worstPeriod.loss.toFixed(2),
          },
        },
      },
    });
    
  } catch (error: any) {
    console.error("=== RISK BUDGETING API ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      { 
        error: error.message || "Failed to generate risk budgeting portfolio",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
