"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { listPortfolios, removePortfolio, type Portfolio } from "@/lib/portfolioStore"; // <-- add remove

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? "";
  const [items, setItems] = useState<Portfolio[]>([]);

  useEffect(() => {
    if (!isLoaded || !userId) return;
    const load = () => setItems(listPortfolios(userId));
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("portfolios:")) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isLoaded, userId]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [items]
  );

  function handleDelete(id: string) {
    if (!isLoaded || !userId) return;
    const ok = confirm("Delete this portfolio? This cannot be undone.");
    if (!ok) return;
    removePortfolio(userId, id);
    setItems(listPortfolios(userId));
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAF2FF] via-[#B8F2FF] to-[#DDE7FF] py-10">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Your portfolios</h1>
            <p className="text-sm text-zinc-600">Click a card to continue or view details.</p>
          </div>
          <Link
            href="/portfolio/new"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:shadow-md"
          >
            + Create portfolio
          </Link>
        </div>

        {sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((p) => (
              <PortfolioCard key={p.id} p={p} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function PortfolioCard({
  p,
  onDelete,
}: {
  p: Portfolio;
  onDelete: (id: string) => void;
}) {
  const pid = encodeURIComponent(String(p.id));
  const hasProposal = Array.isArray(p.proposalHoldings) && p.proposalHoldings.length > 0;
  const href = hasProposal ? `/dashboard/${pid}` : `/portfolio/setup?pid=${pid}`;

  return (
    <Link
      href={href}
      className="relative block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900">{p.name}</h3>
          <p className="mt-1 text-sm text-zinc-600">
            {p.riskTolerance} • {p.timeHorizon} • {p.currency}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={hasProposal ? "ok" : "warn"}>
            {hasProposal ? "Proposal ready" : "Incomplete"}
          </Chip>
          {/* Delete button (stops link navigation) */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(String(p.id));
            }}
            className="rounded-lg bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"
            aria-label="Delete portfolio"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">Created {new Date(p.createdAt ?? Date.now()).toLocaleString()}</p>
    </Link>
  );
}

function Chip({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn"; children: React.ReactNode }) {
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-zinc-200 bg-zinc-50 text-zinc-700";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">No portfolios yet</h2>
      <p className="mt-1 text-sm text-zinc-600">Create your first portfolio and let AI help you design it.</p>
      <Link
        href="/portfolio/new"
        className="mt-4 inline-flex rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:shadow-md"
      >
        + Create portfolio
      </Link>
    </div>
  );
}
