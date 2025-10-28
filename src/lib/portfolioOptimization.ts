/**
 * Portfolio Optimization Models
 * 
 * This module implements standard quantitative portfolio optimization models:
 * 1. Global Minimum Variance (GMV) - Markowitz 1952
 * 2. Maximum Sharpe Ratio (Tangency Portfolio)
 * 3. Mean-Variance Optimization (MVO) - with target return
 * 4. Equal Weight (1/N)
 * 5. Risk Parity (already in riskBudgeting.ts)
 * 
 * All functions return weights that satisfy:
 * - Sum to 1 (fully invested)
 * - Non-negative (no short-selling)
 */

export interface OptimizationResult {
  weights: number[];
  converged: boolean;
  iterations: number;
  objective?: number; // Objective function value
}

/**
 * Global Minimum Variance (GMV) Portfolio
 * 
 * Markowitz (1952) - The foundation of modern portfolio theory
 * 
 * Objective: Minimize portfolio variance
 *   min (1/2) × x^T × Σ × x
 * 
 * Subject to:
 *   1^T × x = 1  (weights sum to 1)
 *   x ≥ 0        (no short-selling)
 * 
 * This is the leftmost point on the efficient frontier.
 * 
 * Analytical Solution (without non-negativity constraint):
 *   x_GMV = (Σ^-1 × 1) / (1^T × Σ^-1 × 1)
 * 
 * With non-negativity, we use iterative optimization.
 * 
 * @param covMatrix - Covariance matrix (n×n)
 * @param maxIterations - Maximum iterations for optimization
 * @param tolerance - Convergence tolerance
 * @returns Optimal weights
 */
export function optimizeGMV(
  covMatrix: number[][],
  maxIterations: number = 1000,
  tolerance: number = 1e-6
): OptimizationResult {
  const n = covMatrix.length;
  
  // Try analytical solution first
  const analyticalWeights = computeGMVAnalytical(covMatrix);
  
  // Check if all weights are non-negative
  const allPositive = analyticalWeights.every(w => w >= -1e-10);
  
  if (allPositive) {
    // Analytical solution is feasible
    return {
      weights: analyticalWeights.map(w => Math.max(0, w)), // Clip tiny negatives
      converged: true,
      iterations: 0,
      objective: computePortfolioVariance(analyticalWeights, covMatrix),
    };
  }
  
  // Need constrained optimization (with non-negativity)
  return optimizeGMVConstrained(covMatrix, maxIterations, tolerance);
}

/**
 * Analytical GMV solution (may have negative weights)
 */
function computeGMVAnalytical(covMatrix: number[][]): number[] {
  const n = covMatrix.length;
  
  // Compute Σ^-1
  const invCov = invertMatrix(covMatrix);
  
  // ones vector (1, 1, ..., 1)
  const ones = Array(n).fill(1);
  
  // Σ^-1 × 1
  const invCovOnes = multiplyMatrixVector(invCov, ones);
  
  // 1^T × Σ^-1 × 1 (scalar)
  const denominator = dotProduct(ones, invCovOnes);
  
  // x = (Σ^-1 × 1) / (1^T × Σ^-1 × 1)
  return invCovOnes.map(w => w / denominator);
}

/**
 * GMV with non-negativity constraint (iterative)
 */
function optimizeGMVConstrained(
  covMatrix: number[][],
  maxIterations: number,
  tolerance: number
): OptimizationResult {
  const n = covMatrix.length;
  
  // Start with equal weights
  let weights = Array(n).fill(1 / n);
  
  // Sequential Least Squares Programming (SLSQP) approach
  // Simplified: Use projected gradient descent
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const oldWeights = [...weights];
    
    // Compute gradient: ∇f(x) = Σ × x
    const gradient = multiplyMatrixVector(covMatrix, weights);
    
    // Step size (adaptive)
    const stepSize = 0.01 / (1 + iter / 100);
    
    // Gradient descent step
    weights = weights.map((w, i) => w - stepSize * gradient[i]);
    
    // Project onto feasible set:
    // 1. Non-negativity: x ≥ 0
    weights = weights.map(w => Math.max(0, w));
    
    // 2. Sum to 1: 1^T x = 1
    const sum = weights.reduce((s, w) => s + w, 0);
    if (sum > 0) {
      weights = weights.map(w => w / sum);
    } else {
      // All weights zero, reset to equal
      weights = Array(n).fill(1 / n);
    }
    
    // Check convergence
    const change = weights.reduce((s, w, i) => s + Math.abs(w - oldWeights[i]), 0);
    if (change < tolerance) {
      return {
        weights,
        converged: true,
        iterations: iter + 1,
        objective: computePortfolioVariance(weights, covMatrix),
      };
    }
  }
  
  // Did not converge
  return {
    weights,
    converged: false,
    iterations: maxIterations,
    objective: computePortfolioVariance(weights, covMatrix),
  };
}

/**
 * Maximum Sharpe Ratio Portfolio (Tangency Portfolio)
 * 
 * Objective: Maximize Sharpe ratio
 *   max (μ^T × x - r_f) / √(x^T × Σ × x)
 * 
 * Subject to:
 *   1^T × x = 1
 *   x ≥ 0
 * 
 * This is the tangency portfolio on the efficient frontier.
 * 
 * @param expectedReturns - Expected returns vector
 * @param covMatrix - Covariance matrix
 * @param riskFreeRate - Risk-free rate (default 0)
 * @param maxIterations - Maximum iterations
 * @param tolerance - Convergence tolerance
 * @returns Optimal weights
 */
export function optimizeMaxSharpe(
  expectedReturns: number[],
  covMatrix: number[][],
  riskFreeRate: number = 0,
  maxIterations: number = 1000,
  tolerance: number = 1e-6
): OptimizationResult {
  const n = expectedReturns.length;
  
  // Excess returns
  const excessReturns = expectedReturns.map(r => r - riskFreeRate);
  
  // Try analytical solution first (may have negative weights)
  const invCov = invertMatrix(covMatrix);
  const analyticalWeights = multiplyMatrixVector(invCov, excessReturns);
  const sum = analyticalWeights.reduce((s, w) => s + w, 0);
  const normalizedWeights = analyticalWeights.map(w => w / sum);
  
  // Check feasibility
  const allPositive = normalizedWeights.every(w => w >= -1e-10);
  
  if (allPositive) {
    const weights = normalizedWeights.map(w => Math.max(0, w));
    return {
      weights,
      converged: true,
      iterations: 0,
      objective: computeSharpeRatio(weights, expectedReturns, covMatrix, riskFreeRate),
    };
  }
  
  // Need constrained optimization
  return optimizeMaxSharpeConstrained(
    expectedReturns,
    covMatrix,
    riskFreeRate,
    maxIterations,
    tolerance
  );
}

/**
 * Max Sharpe with constraints (iterative)
 */
function optimizeMaxSharpeConstrained(
  expectedReturns: number[],
  covMatrix: number[][],
  riskFreeRate: number,
  maxIterations: number,
  tolerance: number
): OptimizationResult {
  const n = expectedReturns.length;
  let weights = Array(n).fill(1 / n);
  let bestWeights = [...weights];
  let bestSharpe = computeSharpeRatio(weights, expectedReturns, covMatrix, riskFreeRate);
  
  // Random restart with gradient ascent
  for (let restart = 0; restart < 5; restart++) {
    // Random initialization
    weights = Array(n).fill(0).map(() => Math.random());
    const sum = weights.reduce((s, w) => s + w, 0);
    weights = weights.map(w => w / sum);
    
    for (let iter = 0; iter < maxIterations / 5; iter++) {
      const oldWeights = [...weights];
      
      // Compute numerical gradient
      const gradient = computeSharpeGradient(weights, expectedReturns, covMatrix, riskFreeRate);
      
      // Gradient ascent
      const stepSize = 0.01 / (1 + iter / 50);
      weights = weights.map((w, i) => w + stepSize * gradient[i]);
      
      // Project onto feasible set
      weights = weights.map(w => Math.max(0, w));
      const newSum = weights.reduce((s, w) => s + w, 0);
      if (newSum > 0) {
        weights = weights.map(w => w / newSum);
      } else {
        weights = Array(n).fill(1 / n);
      }
      
      // Check if improved
      const currentSharpe = computeSharpeRatio(weights, expectedReturns, covMatrix, riskFreeRate);
      if (currentSharpe > bestSharpe) {
        bestSharpe = currentSharpe;
        bestWeights = [...weights];
      }
      
      // Check convergence
      const change = weights.reduce((s, w, i) => s + Math.abs(w - oldWeights[i]), 0);
      if (change < tolerance) break;
    }
  }
  
  return {
    weights: bestWeights,
    converged: true,
    iterations: maxIterations,
    objective: bestSharpe,
  };
}

/**
 * Mean-Variance Optimization with Target Return
 * 
 * Objective: Minimize variance for a target return
 *   min (1/2) × x^T × Σ × x
 * 
 * Subject to:
 *   μ^T × x = target_return
 *   1^T × x = 1
 *   x ≥ 0
 * 
 * @param expectedReturns - Expected returns
 * @param covMatrix - Covariance matrix
 * @param targetReturn - Target portfolio return
 * @param maxIterations - Maximum iterations
 * @param tolerance - Convergence tolerance
 * @returns Optimal weights
 */
export function optimizeMVO(
  expectedReturns: number[],
  covMatrix: number[][],
  targetReturn: number,
  maxIterations: number = 1000,
  tolerance: number = 1e-6
): OptimizationResult {
  const n = expectedReturns.length;
  let weights = Array(n).fill(1 / n);
  
  // Check if target return is achievable
  const minReturn = Math.min(...expectedReturns);
  const maxReturn = Math.max(...expectedReturns);
  
  if (targetReturn < minReturn || targetReturn > maxReturn) {
    // Target not achievable with non-negative weights
    // Return closest feasible solution
    if (targetReturn < minReturn) {
      // All weight on minimum return asset
      const minIdx = expectedReturns.indexOf(minReturn);
      weights = Array(n).fill(0);
      weights[minIdx] = 1;
    } else {
      // All weight on maximum return asset
      const maxIdx = expectedReturns.indexOf(maxReturn);
      weights = Array(n).fill(0);
      weights[maxIdx] = 1;
    }
    
    return {
      weights,
      converged: false,
      iterations: 0,
      objective: computePortfolioVariance(weights, covMatrix),
    };
  }
  
  // Augmented Lagrangian method
  for (let iter = 0; iter < maxIterations; iter++) {
    const oldWeights = [...weights];
    
    // Current portfolio return
    const currentReturn = dotProduct(weights, expectedReturns);
    
    // Gradient of variance
    const varGradient = multiplyMatrixVector(covMatrix, weights);
    
    // Penalty for return constraint
    const returnError = currentReturn - targetReturn;
    const returnGradient = expectedReturns.map(r => r * returnError * 100);
    
    // Combined gradient
    const gradient = varGradient.map((g, i) => g + returnGradient[i]);
    
    // Gradient descent
    const stepSize = 0.01 / (1 + iter / 100);
    weights = weights.map((w, i) => w - stepSize * gradient[i]);
    
    // Project
    weights = weights.map(w => Math.max(0, w));
    const sum = weights.reduce((s, w) => s + w, 0);
    if (sum > 0) {
      weights = weights.map(w => w / sum);
    } else {
      weights = Array(n).fill(1 / n);
    }
    
    // Convergence
    const change = weights.reduce((s, w, i) => s + Math.abs(w - oldWeights[i]), 0);
    if (change < tolerance && Math.abs(returnError) < tolerance) {
      return {
        weights,
        converged: true,
        iterations: iter + 1,
        objective: computePortfolioVariance(weights, covMatrix),
      };
    }
  }
  
  return {
    weights,
    converged: false,
    iterations: maxIterations,
    objective: computePortfolioVariance(weights, covMatrix),
  };
}

/**
 * Equal Weight Portfolio (1/N)
 * 
 * The simplest diversification strategy.
 * Often outperforms sophisticated models out-of-sample!
 * 
 * DeMiguel, Garlappi, Uppal (2009): "1/N is hard to beat"
 */
export function optimizeEqualWeight(n: number): OptimizationResult {
  const weights = Array(n).fill(1 / n);
  
  return {
    weights,
    converged: true,
    iterations: 0,
    objective: 0,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function computePortfolioVariance(weights: number[], covMatrix: number[][]): number {
  // σ² = x^T × Σ × x
  const Σx = multiplyMatrixVector(covMatrix, weights);
  return dotProduct(weights, Σx);
}

function computeSharpeRatio(
  weights: number[],
  expectedReturns: number[],
  covMatrix: number[][],
  riskFreeRate: number
): number {
  const portfolioReturn = dotProduct(weights, expectedReturns);
  const portfolioVariance = computePortfolioVariance(weights, covMatrix);
  const portfolioVol = Math.sqrt(portfolioVariance);
  
  if (portfolioVol === 0) return 0;
  
  return (portfolioReturn - riskFreeRate) / portfolioVol;
}

function computeSharpeGradient(
  weights: number[],
  expectedReturns: number[],
  covMatrix: number[][],
  riskFreeRate: number
): number[] {
  const n = weights.length;
  const epsilon = 1e-8;
  const gradient: number[] = [];
  
  const baseSharpe = computeSharpeRatio(weights, expectedReturns, covMatrix, riskFreeRate);
  
  for (let i = 0; i < n; i++) {
    const perturbedWeights = [...weights];
    perturbedWeights[i] += epsilon;
    
    // Normalize
    const sum = perturbedWeights.reduce((s, w) => s + w, 0);
    const normalizedWeights = perturbedWeights.map(w => w / sum);
    
    const perturbedSharpe = computeSharpeRatio(
      normalizedWeights,
      expectedReturns,
      covMatrix,
      riskFreeRate
    );
    
    gradient[i] = (perturbedSharpe - baseSharpe) / epsilon;
  }
  
  return gradient;
}

function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  
  // Create augmented matrix [A | I]
  const augmented: number[][] = matrix.map((row, i) =>
    row.concat(Array(n).fill(0).map((_, j) => (i === j ? 1 : 0)))
  );
  
  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    // Scale pivot row
    const pivot = augmented[i][i];
    if (Math.abs(pivot) < 1e-10) {
      // Singular matrix, add regularization
      augmented[i][i] += 1e-8;
    }
    
    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot;
    }
    
    // Eliminate column
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = augmented[k][i];
        for (let j = 0; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
  }
  
  // Extract inverse (right half of augmented matrix)
  return augmented.map(row => row.slice(n));
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map(row => dotProduct(row, vector));
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}
