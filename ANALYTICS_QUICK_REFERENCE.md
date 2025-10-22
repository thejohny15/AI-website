# Advanced Analytics Quick Reference

## 📊 Backtest Metrics Cheat Sheet

| Metric | Formula | Good Value | What It Means |
|--------|---------|------------|---------------|
| **Total Return** | (Final - Initial) / Initial | > 20% | Overall profit percentage |
| **Annual Return** | (1 + Total)^(1/Years) - 1 | > 5% | Yearly growth rate |
| **Volatility** | StdDev(Returns) × √252 | < 15% | How much it bounces around |
| **Sharpe Ratio** | Return / Volatility | > 0.5 | Return per unit of risk |
| **Max Drawdown** | Worst Peak-to-Trough | < 20% | Biggest loss you'd face |

---

## 🔍 How to Read Results

### Sharpe Ratio Interpretation
```
> 1.0  = Excellent (rare)
0.5-1.0 = Good
0.2-0.5 = Acceptable
< 0.2  = Poor
```

### Volatility Levels
```
< 5%   = Very Low (bonds)
5-10%  = Low (balanced)
10-15% = Moderate (mixed)
15-25% = High (equities)
> 25%  = Very High (aggressive)
```

### Max Drawdown Context
```
-10%   = Mild correction
-20%   = Bear market
-30%   = Severe crisis
-50%   = Catastrophic (rare)
```

---

## 🧮 Quick Calculations

### Annualize Daily Volatility
```
Daily Vol × √252 = Annual Vol
Example: 0.7% × 15.87 = 11.1%
```

### De-annualize to Daily
```
Annual Vol / √252 = Daily Vol
Example: 11.1% / 15.87 = 0.7%
```

### Compound Returns Over Years
```
(1 + Return)^Years = Future Value
Example: (1.045)^5 = 1.246 = +24.6%
```

---

## 📈 Chart Reading Tips

### Performance Chart
- **Upward trend** = Portfolio growing
- **Flat sections** = Sideways markets
- **Dips** = Market corrections
- **Recovery** = Bounce back from losses

### Risk Contribution Chart
- **Equal bars** = Equal Risk Contribution achieved
- **Unequal bars** = Custom risk budgets in use
- **Taller bars** = Assets contributing more risk

---

## 🔥 Stress Test Scenarios

### 2x Volatility Shock
```
Simulates: Market panic (like March 2020)
Expected: Shift toward safer assets
Example: Bonds ↑, Stocks ↓
```

### Worst 30-Day Period
```
Shows: Actual worst historical crisis
Use: "Could I handle this loss?"
Context: Compare to S&P 500 same period
```

---

## 🏆 Strategy Comparison Guide

### Risk Budgeting vs Equal Weight
```
Risk Budgeting usually wins on:
- Sharpe Ratio (better risk-adjusted returns)
- Max Drawdown (smaller losses)
- Volatility (more consistent)

Equal Weight sometimes wins on:
- Raw returns (in bull markets)
- Simplicity (easier to understand)
```

### When Risk Budgeting Shines
- ✅ Volatile markets
- ✅ Crisis periods
- ✅ Mixed asset types
- ✅ Long-term investing

### When Equal Weight Competes
- 🔶 Strong bull markets
- 🔶 Similar asset risks
- 🔶 Short time horizons

---

## 💡 Pro Tips

### Rebalancing Frequency
```
Annual: Low costs, more drift
Quarterly: Balanced (recommended)
Monthly: Tight control, higher costs
```

### Transaction Costs Matter
```
0.1% per trade × 4 assets × 4 rebalances/year = 1.6%/year
Over 5 years: ~8% total impact
```

### Diversification Benefit
```
4 assets at 11% vol each
Portfolio vol: ~8% (not 11%)
Reduction: ~27% thanks to diversification
```

---

## 🎯 Performance Targets

### Conservative Portfolio
```
Return: 4-6%
Volatility: 6-10%
Sharpe: 0.4-0.7
Max DD: -10% to -15%
```

### Balanced Portfolio
```
Return: 6-8%
Volatility: 8-12%
Sharpe: 0.6-0.9
Max DD: -15% to -20%
```

### Growth Portfolio
```
Return: 8-12%
Volatility: 12-18%
Sharpe: 0.5-0.8
Max DD: -20% to -30%
```

---

## 🚨 Red Flags

### Warning Signs
```
❌ Sharpe < 0.2 (poor risk-adjusted returns)
❌ Max DD > -40% (excessive risk)
❌ Volatility > 25% (too unstable)
❌ Negative returns over 5 years (underperforming cash)
```

### Green Lights
```
✅ Sharpe > 0.5 (good risk-adjusted returns)
✅ Max DD < -20% (manageable losses)
✅ Volatility 8-15% (reasonable risk)
✅ Beating equal weight strategy
```

---

## 📝 Key Takeaways

1. **Sharpe Ratio** = Most important metric (return per risk)
2. **Max Drawdown** = Worst pain you'll feel
3. **Volatility** = How bumpy the ride is
4. **Rebalancing** = Essential for maintaining risk balance
5. **Diversification** = Reduces risk without sacrificing much return

---

## 🔗 Related Files

- Full documentation: `/ADVANCED_ANALYTICS_DOCS.md`
- Backtest engine: `/src/lib/backtest.ts`
- API route: `/src/app/api/risk-budgeting/route.ts`
- Frontend: `/src/app/portfolio/full-analysis-option3/page.tsx`
