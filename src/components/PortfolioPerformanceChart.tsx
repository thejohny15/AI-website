"use client";

import { useState, useEffect } from "react";

interface PortfolioPerformanceChartProps {
  holdings: Array<{ symbol: string; weight: number }>;
  lookbackPeriod: string;
  createdAt: string;
  rebalancingDates?: string[]; // Array of rebalancing dates in ISO format
  savedBacktestData?: {
    portfolioValues: number[];
    dates: string[];
  };
}

export default function PortfolioPerformanceChart({ 
  holdings, 
  lookbackPeriod, 
  createdAt,
  rebalancingDates = [],
  savedBacktestData
}: PortfolioPerformanceChartProps) {
  const [chartData, setChartData] = useState<{ dates: string[], values: number[], creationIndex: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    // If we have saved backtest data, use it directly
    if (savedBacktestData?.portfolioValues && savedBacktestData?.dates) {
      console.log('✅ Using saved backtest data for chart');
      console.log('Data points:', savedBacktestData.portfolioValues.length);
      
      const creationDate = new Date(createdAt).toISOString().split('T')[0];
      const creationIndex = savedBacktestData.dates.findIndex(d => d >= creationDate);
      
      setChartData({
        dates: savedBacktestData.dates,
        values: savedBacktestData.portfolioValues,
        creationIndex
      });
      setLastUpdate(new Date());
      setLoading(false);
      return;
    }
    
    // Fallback: fetch and calculate (for old portfolios without saved data)
    console.log('⚠️ No saved backtest data, fetching from API (fallback)');
    
    async function fetchPerformanceData() {
      setLoading(true);
      try {
        const endDate = new Date();
        const startDate = new Date();
        
        switch(lookbackPeriod) {
          case '1y':
            startDate.setFullYear(endDate.getFullYear() - 1);
            break;
          case '3y':
            startDate.setFullYear(endDate.getFullYear() - 3);
            break;
          case '5y':
          default:
            startDate.setFullYear(endDate.getFullYear() - 5);
            break;
        }

        const symbols = holdings.map(h => h.symbol);
        const response = await fetch('/api/historical-quotes', {
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
        const historicalPrices = data.historicalPrices;

        const allDates = new Set<string>();
        Object.values(historicalPrices).forEach((priceData: any) => {
          priceData.forEach((item: any) => allDates.add(item.date));
        });
        
        const dates = Array.from(allDates).sort();
        
        const values = dates.map(date => {
          let portfolioValue = 0;
          holdings.forEach(holding => {
            const symbolData = historicalPrices[holding.symbol] || [];
            const priceItem = symbolData.find((item: any) => item.date === date);
            if (priceItem && priceItem.price) {
              portfolioValue += priceItem.price * (holding.weight / 100);
            }
          });
          return portfolioValue;
        });

        const firstValue = values.find(v => v > 0) || 1;
        const normalizedValues = values.map(v => (v / firstValue) * 10000);

        const creationDate = new Date(createdAt).toISOString().split('T')[0];
        const creationIndex = dates.findIndex(d => d >= creationDate);

        console.log('Portfolio creation date:', creationDate);
        console.log('Creation index in data:', creationIndex);
        console.log('Total dates:', dates.length);

        setChartData({ dates, values: normalizedValues, creationIndex });
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Error fetching performance data:', error);
        setChartData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchPerformanceData();

    return () => {};
  }, [holdings, lookbackPeriod, createdAt, savedBacktestData]);

  if (loading && !chartData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-500"></div>
      </div>
    );
  }

  if (!chartData || chartData.values.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300">
        <p>Unable to load performance data</p>
      </div>
    );
  }

  const { dates, values, creationIndex } = chartData;
  
  // Filter out invalid values before calculating min/max
  const validValues = values.filter(v => Number.isFinite(v) && v > 0);
  
  if (validValues.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300">
        <p>No valid data available</p>
      </div>
    );
  }
  
  const minValue = Math.min(...validValues);
  const maxValue = Math.max(...validValues);
  const range = maxValue - minValue;
  const padding = range * 0.1;

  const height = 300;
  const width = 1000;

  const sampleRate = Math.max(1, Math.ceil(values.length / 200));
  const sampledValues = values.filter((_: number, i: number) => i % sampleRate === 0);
  const sampledDates = dates.filter((_: string, i: number) => i % sampleRate === 0);

  const points = sampledValues.map((value: number, i: number) => {
    const x = (i / (sampledValues.length - 1)) * width;
    const y = height - ((value - minValue + padding) / (range + 2 * padding)) * height;
    return { x, y, value, date: sampledDates[i] };
  }).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300">
        <p>Unable to render chart data</p>
      </div>
    );
  }

  const pathData = points.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const creationX = creationIndex >= 0 ? (creationIndex / (dates.length - 1)) * width : -1;

  // Calculate X positions for rebalancing dates
  const rebalancingPositions = rebalancingDates
    .map(dateStr => {
      const rebalanceDate = new Date(dateStr).toISOString().split('T')[0];
      const index = dates.findIndex(d => d >= rebalanceDate);
      if (index >= 0) {
        return {
          x: (index / (dates.length - 1)) * width,
          date: rebalanceDate
        };
      }
      return null;
    })
    .filter((pos): pos is { x: number; date: string } => pos !== null && pos.x >= 0 && pos.x <= width);

  return (
    <div className="relative">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-slate-400">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </span>
      </div>
      
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line key={ratio} x1={0} y1={height * ratio} x2={width} y2={height * ratio} stroke="rgba(148, 163, 184, 0.1)" strokeWidth="1" />
        ))}
        
        {/* Area under curve */}
        <path d={`${pathData} L ${width} ${height} L 0 ${height} Z`} fill="url(#gradient-perf)" opacity="0.3" />
        
        {/* Main line */}
        <path d={pathData} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Portfolio creation line */}
        {creationX >= 0 && creationX <= width && (
          <>
            <line 
              x1={creationX} 
              y1={0} 
              x2={creationX} 
              y2={height} 
              stroke="#a855f7" 
              strokeWidth="3" 
              strokeDasharray="8,4" 
              opacity="0.8"
            />
            <text 
              x={creationX} 
              y={-15} 
              fontSize="12" 
              fill="#a855f7" 
              textAnchor="middle" 
              fontWeight="bold"
            >
              Portfolio Created
            </text>
          </>
        )}
        
        {/* Rebalancing lines */}
        {rebalancingPositions.map((pos, idx) => (
          <line 
            key={`rebalance-${idx}`}
            x1={pos.x} 
            y1={0} 
            x2={pos.x} 
            y2={height} 
            stroke="#f59e0b" 
            strokeWidth="3" 
            strokeDasharray="8,4" 
            opacity="0.8"
          />
        ))}
        
        {/* Gradient definition */}
        <defs>
          <linearGradient id="gradient-perf" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Hover point */}
        {hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < points.length && (
          <circle cx={points[hoveredIndex]!.x} cy={points[hoveredIndex]!.y} r="5" fill="#10b981" stroke="white" strokeWidth="2" />
        )}
      </svg>

      {hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < points.length && (
        <div className="absolute bg-slate-900/95 text-white px-4 py-2 rounded-lg text-sm pointer-events-none border border-slate-600 shadow-xl z-10"
          style={{ left: `${(points[hoveredIndex]!.x / width) * 100}%`, top: `${(points[hoveredIndex]!.y / height) * 100}%`, transform: 'translate(-50%, -120%)' }}>
          <div className="font-semibold">${points[hoveredIndex]!.value.toFixed(2)}</div>
          <div className="text-xs text-slate-300">{points[hoveredIndex]!.date}</div>
        </div>
      )}

      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="absolute top-0 left-0"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * width;
          const closestIndex = Math.round((x / width) * (points.length - 1));
          setHoveredIndex(Math.max(0, Math.min(points.length - 1, closestIndex)));
        }}
        onMouseLeave={() => setHoveredIndex(null)}>
        <rect width={width} height={height} fill="transparent" />
      </svg>

      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>${minValue.toFixed(0)}</span>
        <span className="text-center text-slate-300 font-medium">Portfolio Value Over Time (Starting: $10,000)</span>
        <span>${maxValue.toFixed(0)}</span>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-emerald-500"></div>
          <span className="text-slate-300">Portfolio Performance</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 border-t-2 border-dashed border-purple-500"></div>
          <span className="text-slate-300">Portfolio Created</span>
        </div>
        {rebalancingPositions.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 border-t-2 border-dashed border-amber-500"></div>
            <span className="text-slate-300">Rebalanced ({rebalancingPositions.length})</span>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-xs text-slate-400">Total Return</div>
          <div className={`text-lg font-bold ${values[values.length - 1] >= 10000 ? 'text-emerald-400' : 'text-red-400'}`}>
            {((values[values.length - 1] - 10000) / 10000 * 100).toFixed(2)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400">Current Value</div>
          <div className="text-lg font-bold text-white">${values[values.length - 1].toFixed(2)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400">Period</div>
          <div className="text-lg font-bold text-white">
            {lookbackPeriod === '1y' && '1 Year'}
            {lookbackPeriod === '3y' && '3 Years'}
            {lookbackPeriod === '5y' && '5 Years'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400">Since Creation</div>
          <div className={`text-lg font-bold ${creationIndex >= 0 && values[values.length - 1] >= (values[creationIndex] || 10000) ? 'text-emerald-400' : 'text-red-400'}`}>
            {creationIndex >= 0 ? ((values[values.length - 1] - (values[creationIndex] || 10000)) / (values[creationIndex] || 10000) * 100).toFixed(2) : '0.00'}%
          </div>
        </div>
      </div>
    </div>
  );
}
