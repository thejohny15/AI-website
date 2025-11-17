# QARM Methodology - Implementation Guide

## Overview

This portfolio application implements the **QARM (Quantitative Asset Risk Management)** methodology using **Equal Risk Contribution (ERC)** with **quarterly dynamic rebalancing**.

---

## Core Principles

### 1. Equal Risk Contribution (ERC)

**Principle:** Each asset contributes **equally** to total portfolio risk.

- ❌ **NOT** equal weights (1/N allocation)
- ✅ **Equal risk contribution** based on volatility

**Example:**
```
Asset A: High volatility (20%) → Lower weight (15%)
Asset B: Medium volatility (12%) → Medium weight (25%)
Asset C: Low volatility (8%) → Higher weight (35%)
Asset D: Low volatility (7%) → Higher weight (25%)

Result: Each contributes ~25% to portfolio risk
```

---

### 2. Dynamic Weight Recalculation

**Why recalculate weights quarterly?**
- Market conditions change constantly
- Volatilities increase/decrease  
- Correlations shift
- **ERC principle must be maintained with current data**

**Process:**
1. Every quarter (60 trading days)
2. Look back using user's selected lookback period:
   - 1 year = 252 trading days
   - 3 years = 756 trading days
   - 5 years = 1260 trading days
3. Calculate current covariance matrix from this window
4. Re-optimize to achieve equal risk contribution
5. Weights change, but risk contribution stays equal

**Important:** The lookback period is what the USER selects when creating the portfolio (1y, 3y, or 5y option).

---

### 3. Data Split Strategy (CORRECTED)

#### ✅ **Correct Implementation:**

```
Total Data: 10 years (2015-2025)
├─ BACKTEST DATA: 5 years (2015-2020) [OLDER - creates historical performance chart]
└─ TODAY'S PORTFOLIO: 5 years (2020-2025) [RECENT - for optimization]
```

**Why this order?**
- **Today's Portfolio:** Uses most recent 5 years to optimize current holdings
  - These optimized weights are shown to the user
  - This is what they should invest in TODAY
  
- **Backtest (Historical Performance):** Uses older 5 years
  - Creates the **historical performance chart** shown on:
    * Dashboard page
    * Full Analysis (Option 3)
  - Shows "how would this strategy have performed 2015-2020?"
  - Validates the strategy on out-of-sample historical data
  - User can see real past performance before investing

**Key Point:** The backtest runs on OLDER data to create the historical chart that users see. This proves the strategy worked in the past without using future information.

---

## Implementation Status

✅ **FIXED:** Data windows now in correct order
✅ **CORRECT:** ERC optimization with equal risk budgets  
✅ **CORRECT:** Dynamic weight recalculation quarterly
✅ **CORRECT:** Multiple lookback periods supported
✅ **CORRECT:** Transaction costs included (0.1%)
✅ **CORRECT:** Dividend reinvestment tracking

---

## Quarterly Rebalancing Process

**Step-by-Step:**

1. **Trigger:** Every ~60 trading days (quarterly)

2. **Calculate Recent Covariance Matrix:**
   - Use rolling window = user's selected lookback period
     * 1 year: last 252 trading days
     * 3 years: last 756 trading days
     * 5 years: last 1260 trading days
   - Extract price returns (no dividends - they're predictable)
   - Compute covariance matrix

3. **Re-optimize Weights:**
   - Run ERC optimization
   - Find weights where each asset contributes equally to risk
   - Use current market volatilities/correlations from the lookback window

4. **Execute Rebalance:**
   - Sell all current positions
   - Deduct 0.1% transaction cost
   - Buy back at new optimal weights

**Example with 3-year lookback:**
```
Q1 2018 rebalance: Use data from Q1 2015 - Q1 2018 (3 years back)
Q2 2018 rebalance: Use data from Q2 2015 - Q2 2018 (3 years back)
Q3 2018 rebalance: Use data from Q3 2015 - Q3 2018 (3 years back)
```

The window SLIDES forward each quarter, always looking back the same amount.

---

## Validation Tests

**How to verify QARM is working correctly:**

1. **Check Console Logs on Portfolio Creation:**
   ```
   === QARM DATA SPLIT (CORRECTED) ===
   BACKTEST (older data): X points - for historical validation
   TODAY'S PORTFOLIO (recent data): Y points - for current optimization
   ```

2. **Check Risk Contributions:**
   - All should be within ±2% of equal (e.g., 23-27% for 4 assets)

3. **Check Weight Changes in Backtest:**
   - Weights should change at each quarterly rebalance
   - Changes reflect volatility shifts

---

## References

- **QARM Project Proposal:** See `QARM_project.pdf`
- **Implementation:** `/src/lib/riskBudgeting.ts` and `/src/lib/backtest.ts`

---

## Visual Data Flow

```
USER CREATES PORTFOLIO (Nov 2025)
│
├─ Step 1: Fetch 10 years of historical data (2015-2025)
│
├─ Step 2: SPLIT DATA INTO TWO PURPOSES
│  │
│  ├─ [A] BACKTEST DATA (2015-2020) - OLDER 5 years
│  │   Purpose: Create historical performance chart
│  │   Displayed on: Dashboard + Full Analysis pages
│  │   Shows: "How would this strategy have performed 2015-2020?"
│  │
│  └─ [B] TODAY'S PORTFOLIO (2020-2025) - RECENT 5 years
│      Purpose: Optimize current portfolio weights
│      Displayed on: Portfolio allocation shown to user
│      Shows: "What should I invest in TODAY?"
│
├─ Step 3: OPTIMIZE TODAY'S PORTFOLIO (uses 2020-2025 data)
│  ├─ Calculate returns from 2020-2025 prices
│  ├─ Compute covariance matrix
│  ├─ Run ERC optimization
│  └─ Output: [25%, 30%, 25%, 20%] ← User's current allocation
│
├─ Step 4: RUN BACKTEST (uses 2015-2020 data)
│  ├─ Start with $10,000 on Jan 1, 2015
│  ├─ Apply initial weights (from today's optimization)
│  ├─ Simulate day-by-day 2015-2020:
│  │   ├─ Track daily portfolio value
│  │   ├─ Reinvest dividends
│  │   └─ Rebalance quarterly with DYNAMIC weights
│  │       (recalculate using user's lookback: 1y/3y/5y)
│  └─ Output: Historical performance metrics + chart
│
└─ Step 5: DISPLAY TO USER
    ├─ Dashboard: Show historical chart (from backtest 2015-2020)
    ├─ Portfolio: Show today's weights (from optimization 2020-2025)
    └─ Full Analysis: Show detailed backtest results
```

---

## Why This Makes Sense

**User Perspective:**
1. "Show me how this strategy performed in the past" → BACKTEST (2015-2020)
2. "What should I invest in today?" → OPTIMIZATION (2020-2025)

**No Future Information:**
- Today's portfolio (2020-2025 optimization) is NEVER used in backtest
- Backtest (2015-2020) is pure historical validation
- This prevents "look-ahead bias"

**Realistic Simulation:**
- Backtest pretends it's 2015 and simulates forward
- At each quarterly rebalance in backtest:
  - Only uses data available UP TO that point
  - Re-optimizes using user's selected lookback (1y/3y/5y)
  - Never uses future information

---

## Lookback Period Options Explained

When creating a portfolio, users select a **lookback period**: 1 year, 3 years, or 5 years.

### What This Controls

The lookback period determines **how far back to look when recalculating weights at each quarterly rebalance**.

**1 Year Lookback (252 trading days):**
- Uses most recent 1 year of data
- Responds QUICKLY to recent market changes
- More adaptive, but potentially more volatile
- Best for: Dynamic markets, frequent regime changes

**3 Year Lookback (756 trading days):**
- Uses most recent 3 years of data
- BALANCED between responsiveness and stability
- Smooths out short-term noise
- Best for: Most users (recommended default)

**5 Year Lookback (1260 trading days):**
- Uses most recent 5 years of data
- More STABLE, less reactive to recent changes
- Incorporates longer-term market cycles
- Best for: Conservative investors, long-term focus

### Example Comparison

**Scenario:** Stock market has a volatile 6-month period

**1-Year Lookback:**
- Sees high recent volatility
- Reduces stock allocation significantly
- Quick reaction

**3-Year Lookback:**
- Sees volatility but also 2.5 years of stability
- Moderate adjustment to stock allocation
- Balanced reaction

**5-Year Lookback:**
- Recent volatility is only 10% of the window
- Minor adjustment to stock allocation
- Slow reaction

### How It's Used

**During Optimization (Today's Portfolio):**
```
User selects 3-year lookback
→ Use last 3 years (2022-2025) to calculate covariance
→ Optimize weights based on this 3-year period
→ Output: Today's portfolio weights
```

**During Backtest (Historical Performance):**
```
Simulating 2018 (during backtest)
User selected 3-year lookback
→ At each quarterly rebalance in 2018:
   - Look back 3 years from that point (2015-2018)
   - Recalculate covariance using those 3 years
   - Re-optimize weights
   - Apply new weights going forward
```

**Key Point:** The lookback period stays CONSTANT. It's always looking back the same amount, but the window SLIDES forward through time.

---
