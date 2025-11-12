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
async function fetchHistoricalData(ticker: string, lookbackDays: number = 365 * 5): Promise<{ prices: number[]; dates: string[] }> {
  try {
    // Calculate date range
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (lookbackDays * 24 * 60 * 60); // Convert days to seconds
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startDate}&period2=${endDate}&interval=1d`;
    
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
    
    // Filter out null values and create aligned arrays
    const prices: number[] = [];
    const dates: string[] = [];
    
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        prices.push(closes[i]);
        dates.push(new Date(timestamps[i] * 1000).toISOString().split('T')[0]);
      }
    }
    
    if (prices.length < 100) {
      throw new Error(`Insufficient data for ${ticker}: only ${prices.length} points`);
    }
    
    return { prices, dates };
  } catch (error: any) {
    console.error(`Error fetching data for ${ticker}:`, error.message);
    throw error;
  }
}

/**
 * Align price series to common dates (intersection of all available dates)
 */
function alignPriceSeries(
  dataMap: Map<string, { prices: number[]; dates: string[] }>
): Map<string, number[]> {
  // Get all tickers
  const tickers = Array.from(dataMap.keys());
  
  // Find common dates (intersection)
  const dateSets = tickers.map(t => new Set(dataMap.get(t)!.dates));
  const commonDates = Array.from(dateSets[0]).filter(date =>
    dateSets.every(set => set.has(date))
  ).sort();
  
  // Create aligned price series
  const alignedData = new Map<string, number[]>();
  
  for (const ticker of tickers) {
    const data = dataMap.get(ticker)!;
    const dateToPrice = new Map(data.dates.map((d, i) => [d, data.prices[i]]));
    const alignedPrices = commonDates.map(date => dateToPrice.get(date)!);
    alignedData.set(ticker, alignedPrices);
  }
  
  return alignedData;
}

export async function POST(req: NextRequest) {
  console.log("=== RISK BUDGETING API CALLED ===");
  
  try {
    const { assetClasses, customBudgets, targetVolatility, lookbackPeriod = '5y' } = await req.json();
    
    console.log("Received asset classes:", assetClasses);
    console.log("Custom budgets:", customBudgets);
    console.log("Target volatility:", targetVolatility);
    console.log("Lookback period:", lookbackPeriod);
    
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
    
    // Create a map of ticker -> {prices, dates}
    const dataMap = new Map(
      historicalData.map(d => [d.ticker, { prices: d.prices, dates: d.dates }])
    );
    
    // Align all price series to common dates
    const alignedPrices = alignPriceSeries(dataMap);
    console.log("Aligned to common dates, points per asset:", Array.from(alignedPrices.values())[0].length);
    
    // Split data: first half for optimization, second half for backtest
    const totalPoints = Array.from(alignedPrices.values())[0].length;
    const optimizationPoints = Math.floor(totalPoints / 2); // Split 50/50
    
    console.log(`Splitting data: ${optimizationPoints} points for optimization, ${totalPoints - optimizationPoints} points for backtest`);
    
    // Create optimization data (first N points)
    const optimizationPrices = new Map<string, number[]>();
    for (const [ticker, prices] of alignedPrices.entries()) {
      optimizationPrices.set(ticker, prices.slice(0, optimizationPoints));
    }
    
    // Create backtest data (remaining points)
    const backtestPrices = new Map<string, number[]>();
    for (const [ticker, prices] of alignedPrices.entries()) {
      backtestPrices.set(ticker, prices.slice(optimizationPoints));
    }
    
    // Calculate returns for each asset (using ONLY optimization period data)
    const returnsData: number[][] = [];
    const meanReturns: number[] = [];
    const tickers: string[] = [];
    
    for (const asset of assetClasses) {
      const prices = optimizationPrices.get(asset.ticker)!;
      const returns = calculateReturns(prices);
      returnsData.push(returns);
      
      // Calculate annualized mean return
      const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length * 252;
      meanReturns.push(meanReturn);
      tickers.push(asset.ticker);
    }
    
    // Calculate covariance matrix
    const covMatrix = calculateCovarianceMatrix(returnsData);
    console.log("Covariance matrix calculated");
    
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
    
    // Calculate correlation matrix from covariance matrix
    const correlationMatrix = calculateCorrelationMatrix(covMatrix);
    const avgCorrelation = calculateAverageCorrelation(correlationMatrix);
    
    // Run backtest for advanced analytics
    console.log("Running historical backtest...");
    
    // Use ONLY the backtest period (after optimization window)
    const backtestDateArray = historicalData[0].dates.slice(optimizationPoints);
    
    console.log(`Backtest period: ${backtestDateArray[0]} to ${backtestDateArray[backtestDateArray.length - 1]} (${backtestDateArray.length} days)`);
    
    const backtest = runBacktest(
      backtestPrices,  // Use only backtest period prices
      backtestDateArray,  // Use only backtest period dates
      optimization.weights,
      tickers,
      { frequency: 'quarterly', transactionCost: 0.001 },
      10000
    );
    
    // Strategy comparison (also on backtest period only)
    console.log("Running strategy comparison...");
    const comparison = compareStrategies(
      backtestPrices,  // Use only backtest period prices
      backtestDateArray,  // Use only backtest period dates
      tickers,
      optimization.weights,
      { frequency: 'quarterly', transactionCost: 0.001 }
    );
    
    // Find worst crisis period
    const worstPeriod = findWorstPeriod(backtest.portfolioValues, backtestDateArray, 30);
    
    console.log("=== RETURNING RESULTS ===");
    console.log("Metrics:", metrics);
    
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
