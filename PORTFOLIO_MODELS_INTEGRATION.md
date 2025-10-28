# Portfolio Optimization Models Integration Guide

## ✅ What's Been Added

I've created `/src/lib/portfolioOptimization.ts` with the following models:

### 1. **Global Minimum Variance (GMV)** - Markowitz 1952
```typescript
optimizeGMV(covMatrix, maxIterations, tolerance)
```
- **Objective**: Minimize portfolio variance
- **Formula**: min (1/2) × x^T × Σ × x
- **Constraints**: Σx = 1, x ≥ 0
- **Use case**: Maximum risk reduction, ignore returns

### 2. **Maximum Sharpe Ratio** (Tangency Portfolio)
```typescript
optimizeMaxSharpe(expectedReturns, covMatrix, riskFreeRate, maxIterations, tolerance)
```
- **Objective**: Maximize Sharpe ratio
- **Formula**: max (μ^T × x - r_f) / √(x^T × Σ × x)
- **Use case**: Best risk-adjusted returns

### 3. **Mean-Variance Optimization (MVO)**
```typescript
optimizeMVO(expectedReturns, covMatrix, targetReturn, maxIterations, tolerance)
```
- **Objective**: Minimize variance for target return
- **Use case**: Achieve specific return target with minimum risk

### 4. **Equal Weight (1/N)**
```typescript
optimizeEqualWeight(n)
```
- **Simplest diversification**
- Often outperforms complex models (DeMiguel et al. 2009)

### 5. **Risk Parity/ERC** (Already exists)
```typescript
optimizeERC(covMatrix, maxIterations, tolerance, targetBudgets)
```
- Your existing implementation

---

## 🔧 How to Integrate

### Step 1: Add Model Selector to Frontend

Add this to `/src/app/portfolio/full-analysis-option3/page.tsx`:

```typescript
// State
const [optimizationModel, setOptimizationModel] = useState<string>('ERC');

// UI (add before asset selection)
<div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
  <h2 className="text-xl font-semibold mb-4">Optimization Model</h2>
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
    {[
      { id: 'ERC', name: 'Risk Parity (ERC)', description: 'Equal risk contribution' },
      { id: 'GMV', name: 'Min Variance', description: 'Lowest risk (Markowitz 1952)' },
      { id: 'MAX_SHARPE', name: 'Max Sharpe', description: 'Best risk-adjusted return' },
      { id: 'MVO', name: 'Mean-Variance', description: 'Target return optimization' },
      { id: 'EQUAL_WEIGHT', name: 'Equal Weight', description: 'Simple 1/N' },
    ].map((model) => (
      <button
        key={model.id}
        onClick={() => setOptimizationModel(model.id)}
        className={`rounded-xl border-2 p-4 text-left transition ${
          optimizationModel === model.id
            ? 'border-emerald-400 bg-emerald-500/20'
            : 'border-white/20 bg-white/5 hover:bg-white/10'
        }`}
      >
        <div className="font-semibold text-base mb-1">{model.name}</div>
        <div className="text-xs text-white/70">{model.description}</div>
      </button>
    ))}
  </div>
</div>
```

### Step 2: Pass Model to API

Update the API call payload:

```typescript
const payload = { 
  assetClasses: enabled.map(a => ({ ticker: a.ticker, name: a.name })),
  customBudgets: useCustomBudgets 
    ? enabled.map(a => customBudgets[a.id] || 0)
    : undefined,
  targetVolatility: useVolatilityTarget && targetVolatility 
    ? targetVolatility / 100
    : undefined,
  lookbackPeriod: lookbackPeriod,
  optimizationModel: optimizationModel,  // ADD THIS
};
```

### Step 3: Update API Route

In `/src/app/api/risk-budgeting/route.ts`, replace the optimization section with:

```typescript
// After calculating covMatrix and meanReturns...

const { optimizationModel = 'ERC' } = await req.json();

let optimization;

switch (optimizationModel) {
  case 'GMV':
    optimization = optimizeGMV(covMatrix, 1000, 1e-6);
    break;
    
  case 'MAX_SHARPE':
    optimization = optimizeMaxSharpe(meanReturns, covMatrix, 0, 1000, 1e-6);
    break;
    
  case 'MVO':
    const targetReturn = 0.08 / 252; // 8% annual
    optimization = optimizeMVO(meanReturns, covMatrix, targetReturn, 1000, 1e-6);
    break;
    
  case 'EQUAL_WEIGHT':
    optimization = optimizeEqualWeight(assetClasses.length);
    break;
    
  case 'ERC':
  default:
    const targetBudgets = customBudgets 
      ? customBudgets.map((b: number) => b / 100)
      : undefined;
    optimization = optimizeERC(covMatrix, 1000, 1e-6, targetBudgets);
    break;
}

// Calculate risk contributions (for display consistency across all models)
const portfolioVol = Math.sqrt(
  optimization.weights.reduce((sum, wi, i) =>
    sum + optimization.weights.reduce((innerSum, wj, j) =>
      innerSum + wi * wj * covMatrix[i][j], 0
    ), 0
  )
);

const riskContributions = optimization.weights.map((wi, i) => {
  const marginalContribution = optimization.weights.reduce(
    (sum, wj, j) => sum + wj * covMatrix[i][j],
    0
  );
  return (wi * marginalContribution / (portfolioVol * portfolioVol)) * 100;
});

// Continue with existing code using optimization.weights and riskContributions...
```

---

## 📊 Expected Results by Model

### GMV (Global Minimum Variance)
```
Conservative allocation:
- High weight to low-vol assets (bonds)
- Low weight to high-vol assets (stocks)
- Lowest portfolio volatility
- May have lower returns
```

### Max Sharpe
```
Balanced allocation:
- Weights based on return/risk tradeoff
- Higher Sharpe ratio than GMV
- Moderate risk
```

### Equal Weight
```
Simple diversification:
- All assets get equal weight
- Surprisingly competitive performance
- Easy to implement
```

### ERC (Your existing model)
```
Risk-balanced:
- Equal risk contribution from each asset
- Between GMV and Equal Weight typically
```

---

## 🎯 Next Steps

1. Add the model selector UI to your page
2. Update the API payload to include `optimizationModel`
3. Update the API route to handle different models
4. Test each model and compare results
5. (Optional) Add model comparison in analytics section

---

## 📖 References

- **Markowitz (1952)**: "Portfolio Selection" - Foundation of MPT
- **DeMiguel, Garlappi, Uppal (2009)**: "Optimal Versus Naive Diversification: How Inefficient is the 1/N Portfolio Strategy?"
- **Roncalli**: Risk Parity & ERC

---

Need help with any integration step? Let me know!
