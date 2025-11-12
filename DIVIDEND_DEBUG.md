# Dividend Calculation Discrepancy Debug

## The Problem

**Dividends OFF (Shadow Portfolio):**
- Final Value: $11,394.95
- Total Return: 13.95%
- Dividends if reinvested: $1,280.62

**Dividends ON (Actual Portfolio):**
- Final Value: $11,104.07
- Total Return: 11.04%
- Dividends received & reinvested: $1,264.91

**Difference: $290.88** - The shadow portfolio is HIGHER than the actual ON portfolio!

## Root Cause Analysis

The shadow portfolio and the actual portfolio should produce identical results when both reinvest dividends. The difference suggests:

1. **Different rebalancing costs?** - No, we fixed this
2. **Different dividend amounts?** - Close ($1,280 vs $1,265) but not exact
3. **Timing issue with reinvestment?** - Possible
4. **Transaction costs applied differently?** - Checked, should be same

## Hypothesis

The issue might be that:
- Shadow portfolio: Reinvests at price[t] (current day)
- Actual portfolio: Might be using price[t-1] or applying reinvestment timing differently

OR

- The portfolio value calculation includes something extra when reinvestDividends=true that shouldn't be there

## Solution Needed

We need to ensure EXACT parity between:
- `runBacktest(..., reinvestDividends=true)` 
- Shadow portfolio calculation when `reinvestDividends=false`

They should produce bit-for-bit identical results.