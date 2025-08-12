"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getPortfolio,
  updatePortfolio,            // ← use this to persist currentHoldings
  type Portfolio,
  type Holding,
} from "@/lib/portfolioStore";

/**
 * Small table cell helpers to keep markup tidy.
 */
function Th({
  children,
  className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`py-2 pl-3 pr-2 text-xs font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
}: { children?: React.ReactNode; className?: string }) {
  return <td className={`py-2 pl-3 pr-2 align-top ${className}`}>{children}</td>;
}

/** Local type for a user-owned position (persisted in Portfolio.currentHoldings). */
type UserPosition = { symbol: string; shares: number; buyPrice: number; note?: string };

export default function PortfolioDetail() {
  // Auth / routing
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? "";
  const { id } = useParams<{ id: string }>();
  const pid = typeof id === "string" ? id : Array.isArray(id) ? id[0] : undefined;

  // State
  const [p, setP] = useState<Portfolio & { currentHoldings?: UserPosition[] }>();
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);

  // Form state (must be before any early returns)
  const [sym, setSym] = useState("");
  const [buy, setBuy] = useState("");
  const [shares, setShares] = useState("");

  // Load portfolio
  useEffect(() => {
    if (!isLoaded || !userId || !pid) return;
    setP(getPortfolio(userId, pid) as any);
  }, [isLoaded, userId, pid]);

  // Fetch quotes for proposal + current holdings
  useEffect(() => {
    const propSyms = (p?.proposalHoldings ?? []).map((h) => String(h.symbol).trim());
    const userSyms = (p?.currentHoldings ?? []).map((h) => String(h.symbol).trim());
    const all = Array.from(new Set([...propSyms, ...userSyms])).filter(Boolean);
    if (all.length === 0) return;

    (async () => {
      try {
        setQuotesLoading(true);
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: all }),
        });
        const data = await res.json();
        setQuotes(data?.quotes || {});
      } finally {
        setQuotesLoading(false);
      }
    })();
  }, [p?.proposalHoldings, p?.currentHoldings]);

  // Proposal stats
  const proposalMove = useMemo(() => {
    if (!p?.proposalHoldings?.length) return null;
    let covered = 0;
    let sum = 0;
    for (const h of p.proposalHoldings) {
      const w = (h.weight ?? 0) / 100;
      const cp = quotes[h.symbol]?.changePercent;
      if (w > 0 && typeof cp === "number") {
        sum += w * (cp / 100);
        covered += w;
      }
    }
    if (covered === 0) return null;
    return { pct: sum * 100, coveragePct: covered * 100 };
  }, [p?.proposalHoldings, quotes]);

  const totalWeight = useMemo(
    () => (p?.proposalHoldings ?? []).reduce((a, h) => a + (h.weight || 0), 0),
    [p]
  );

  // Current holdings helpers
  const positions: UserPosition[] = p?.currentHoldings ?? [];

  function saveCurrentHoldings(next: UserPosition[]) {
    if (!userId || !p) return;
    updatePortfolio(userId, p.id, { currentHoldings: next } as any);
    setP((prev) => (prev ? { ...prev, currentHoldings: next } : prev));
  }

  function addPosition() {
    const s = sym.trim().toUpperCase();
    const b = Number(buy);
    const q = Number(shares);
    if (!s || !Number.isFinite(b) || !Number.isFinite(q) || b <= 0 || q <= 0) return;
    const next = [...positions.filter((x) => x.symbol !== s), { symbol: s, buyPrice: b, shares: q }];
    saveCurrentHoldings(next);
    setSym(""); setBuy(""); setShares("");
  }

  function removePosition(s: string) {
    saveCurrentHoldings(positions.filter((x) => x.symbol !== s));
  }

  // Current totals (must be before early returns)
  const currentTotals = useMemo(() => {
    let totalCost = 0;
    let totalValue = 0;
    let pricedCount = 0;
    for (const pos of positions) {
      const cost = (pos.buyPrice ?? 0) * (pos.shares ?? 0);
      totalCost += cost;
      const price = quotes[pos.symbol]?.price;
      if (typeof price === "number") {
        totalValue += price * (pos.shares ?? 0);
        pricedCount++;
      }
    }
    const pnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : null;
    return { totalCost, totalValue, pnl, pnlPct, pricedCount, count: positions.length };
  }, [positions, quotes]);

  // Early returns AFTER all hooks
  if (!isLoaded) return null;
  if (!p) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border bg-white p-6">
          <p className="mb-4">Portfolio not found.</p>
          <Link href="/dashboard" className="rounded-xl border px-4 py-2 hover:shadow">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  // Render
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EAF7FF] via-[#E8F3FF] to-[#DDEBFF]">
      <main className="mx-auto max-w-6xl p-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
            <p className="text-sm text-zinc-500">Created {new Date(p.createdAt).toLocaleString()}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="rounded-xl border px-4 py-2 text-sm hover:shadow">
              Back to dashboard
            </Link>
            <Link href={`/chat?pid=${p.id}`} className="rounded-xl border px-4 py-2 text-sm hover:shadow">
              Refine with AI
            </Link>
            <button
              onClick={() => downloadCSV(p.proposalHoldings ?? [], p.name)}
              className="rounded-xl border px-4 py-2 text-sm hover:shadow"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Positions" value={(p.proposalHoldings?.length ?? 0).toString()} />
          <StatCard
            label="Weights sum"
            value={`${totalWeight.toFixed(0)}%`}
            hint={totalWeight === 100 ? "Perfect" : "Adjust to 100%"}
            tone={totalWeight === 100 ? "ok" : totalWeight > 100 ? "bad" : "warn"}
          />
          {p.currency && <StatCard label="Currency" value={p.currency} />}
          {proposalMove && (
            <StatCard
              label="Today's move (proposal)"
              value={formatChange(proposalMove.pct)}
              hint={`${proposalMove.coveragePct.toFixed(0)}% weight covered`}
              tone={proposalMove.pct > 0 ? "ok" : proposalMove.pct < 0 ? "bad" : "neutral"}
            />
          )}
        </div>

        {/* Proposed holdings */}
        <section className="rounded-2xl border bg-white p-4 md:p-6">
          <h2 className="mb-3 text-lg font-semibold">AI proposed holdings</h2>
          {p.proposalHoldings?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <Th>Symbol</Th>
                    <Th className="text-right">Weight</Th>
                    <Th className="text-right">Price</Th>
                    <Th className="text-right">1D</Th>
                    <Th>Note</Th>
                  </tr>
                </thead>
                <tbody>
                  {p.proposalHoldings.map((h) => {
                    const q = quotes[h.symbol];
                    return (
                      <tr key={h.symbol} className="border-t hover:bg-zinc-50/60">
                        <Td className="font-medium">{h.symbol}</Td>
                        <Td className="text-right">{formatPct(h.weight)}</Td>
                        <Td className="text-right">{formatMoney(q?.price, q?.currency || p.currency)}</Td>
                        <Td className="text-right">{formatChange(q?.changePercent)}</Td>
                        <Td className="text-zinc-600">{h.note}</Td>
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-zinc-50 font-medium">
                    <Td>Total</Td>
                    <Td className="text-right">{formatPct(totalWeight)}</Td>
                    <Td className="text-right">—</Td>
                    <Td className="text-right">—</Td>
                    <Td />
                  </tr>
                </tbody>
              </table>
              {quotesLoading && <div className="px-3 py-2 text-xs text-zinc-500">Loading quotes…</div>}
            </div>
          ) : (
            <EmptyHoldings id={p.id} />
          )}
        </section>

        {/* Summary */}
        {!!p.proposalSummary && (
          <section className="mt-6 rounded-2xl border bg-white p-4 md:p-6">
            <h2 className="mb-3 text-lg font-semibold">Why this portfolio?</h2>
            <SummaryBlock summary={p.proposalSummary} />
          </section>
        )}

        {/* Current holdings */}
        <section className="mt-6 rounded-2xl border bg-white p-4 md:p-6">
          <h2 className="mb-3 text-lg font-semibold">Your current holdings</h2>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              value={sym}
              onChange={(e) => setSym(e.target.value.toUpperCase())}
              placeholder="Symbol (e.g., SPY)"
              className="rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-200"
            />
            <input
              value={buy}
              onChange={(e) => setBuy(e.target.value)}
              type="number"
              step="0.0001"
              min="0"
              placeholder="Buy price"
              className="rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-200"
            />
            <input
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              type="number"
              step="0.0001"
              min="0"
              placeholder="Shares"
              className="rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-200"
            />
            <button onClick={addPosition} className="rounded-xl border px-4 py-2 font-medium hover:shadow">
              Add position
            </button>
          </div>

          {positions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-zinc-600">
              No positions yet. Add one above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <Th>Symbol</Th>
                    <Th className="text-right">Shares</Th>
                    <Th className="text-right">Buy price</Th>
                    <Th className="text-right">Current</Th>
                    <Th className="text-right">Cost</Th>
                    <Th className="text-right">Value</Th>
                    <Th className="text-right">P&L</Th>
                    <Th className="text-right">P&L %</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const q = quotes[pos.symbol];
                    const current = typeof q?.price === "number" ? q.price : null;
                    const cost = (pos.buyPrice ?? 0) * (pos.shares ?? 0);
                    const value = current != null ? current * (pos.shares ?? 0) : null;
                    const pnl = value != null ? value - cost : null;
                    const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;

                    return (
                      <tr key={pos.symbol} className="border-t hover:bg-zinc-50/60">
                        <Td className="font-medium">{pos.symbol}</Td>
                        <Td className="text-right">{formatNumber(pos.shares)}</Td>
                        <Td className="text-right">{formatMoney(pos.buyPrice, q?.currency || p.currency)}</Td>
                        <Td className="text-right">{formatMoney(current, q?.currency || p.currency)}</Td>
                        <Td className="text-right">{formatMoney(cost, q?.currency || p.currency)}</Td>
                        <Td className="text-right">{formatMoney(value, q?.currency || p.currency)}</Td>
                        <Td className="text-right">{formatMoneyColored(pnl, q?.currency || p.currency)}</Td>
                        <Td className="text-right">{formatChange(pnlPct)}</Td>
                        <Td className="text-right">
                          <button
                            onClick={() => removePosition(pos.symbol)}
                            className="rounded-lg border px-2 py-1 text-xs hover:shadow"
                          >
                            Delete
                          </button>
                        </Td>
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-zinc-50 font-medium">
                    <Td>Total</Td>
                    <Td className="text-right">—</Td>
                    <Td className="text-right">—</Td>
                    <Td className="text-right">—</Td>
                    <Td className="text-right">{formatMoney(currentTotals.totalCost, p.currency)}</Td>
                    <Td className="text-right">{formatMoney(currentTotals.totalValue, p.currency)}</Td>
                    <Td className="text-right">{formatMoneyColored(currentTotals.pnl, p.currency)}</Td>
                    <Td className="text-right">{formatChange(currentTotals.pnlPct)}</Td>
                    <Td className="text-right text-xs text-zinc-500">
                      {currentTotals.pricedCount}/{currentTotals.count} priced
                    </Td>
                  </tr>
                </tbody>
              </table>
              {quotesLoading && <div className="px-3 py-2 text-xs text-zinc-500">Loading quotes…</div>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}


/* =========================
   Small UI components
   ========================= */
function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;    // allow colored spans
  hint?: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const toneClasses =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50"
      : tone === "bad"
      ? "border-rose-200 bg-rose-50"
      : "border-zinc-200 bg-zinc-50";

  return (
    <div className={`rounded-2xl border ${toneClasses} p-4`}>
      <div className="text-xs uppercase tracking-wide text-zinc-600">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-zinc-600">{hint}</div>}
    </div>
  );
}

/**
 * Empty state for when there is no proposal yet.
 */
function EmptyHoldings({ id }: { id: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-dashed p-4">
      <p className="text-sm text-zinc-600">No holdings yet.</p>
      <Link href={`/portfolio/setup?pid=${id}`} className="rounded-xl border px-4 py-2 text-sm hover:shadow">
        Choose an option
      </Link>
    </div>
  );
}

/**
 * Renders the structured summary (string or object with sections).
 */
function SummaryBlock({ summary }: { summary: any }) {
  if (!summary) return null;
  if (typeof summary === "string") return <p className="text-zinc-700">{summary}</p>;
  const sections: Array<[string, any]> = [
    ["Economic Thesis", summary["Economic Thesis"]],
    ["How Your Answers Shaped This", summary["How Your Answers Shaped This"]],
    ["Portfolio Logic", summary["Portfolio Logic"]],
    ["Key Trade-offs", summary["Key Trade-offs"]],
  ];
  return (
    <div className="space-y-4">
      {sections.filter(([, v]) => v != null).map(([title, body]) => (
        <section key={title}>
          <h3 className="font-semibold">{title}</h3>
          {Array.isArray(body) ? (
            <ul className="mt-1 list-disc pl-5 text-zinc-700">
              {body.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-zinc-700">{String(body)}</p>
          )}
        </section>
      ))}
    </div>
  );
}

/* =========================
   Formatting / utilities
   ========================= */
function formatNumber(n?: number) {
  if (!Number.isFinite(n as number)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n as number);
}
function formatPct(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(+n).toFixed(2)}%`;
}
function formatMoney(n?: number | null, ccy?: string) {
  if (n == null || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy || "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return (n as number).toFixed(2);
  }
}
function formatMoneyColored(n?: number | null, ccy?: string) {
  if (n == null || !Number.isFinite(n)) return "—";
  const tone = (n as number) > 0 ? "text-emerald-600" : (n as number) < 0 ? "text-rose-600" : "text-zinc-600";
  const sign = (n as number) > 0 ? "+" : "";
  return <span className={tone}>{sign}{formatMoney(n, ccy)}</span>;
}
function formatChange(pct?: number | null) {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  const tone = pct > 0 ? "text-emerald-600" : pct < 0 ? "text-rose-600" : "text-zinc-600";
  return <span className={tone}>{`${sign}${pct.toFixed(2)}%`}</span>;
}
/**
 * Export proposed holdings as CSV (Symbol, Weight, Note).
 */
function downloadCSV(rows: Holding[], name: string) {
  const header = ["Symbol", "Weight", "Note"];
  const data = rows.map((r) => [r.symbol, r.weight, r.note ?? ""]);
  const csv =
    [header, ...data]
      .map((r) =>
        r.map((x) => {
          const s = String(x ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(",")
      )
      .join("\n") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\s+/g, "_")}_holdings.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
