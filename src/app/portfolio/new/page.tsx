"use client";

import { useRouter } from "next/navigation";
import { useUser, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { createPortfolio } from "@/lib/portfolioStore";
import { useState } from "react";

export default function NewPortfolioPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[var(--bg-start)] to-[var(--bg-end)] text-white p-6">
      <SignedOut>
        <div className="mx-auto max-w-xl text-center grid gap-4 mt-20">
          <h1 className="text-3xl font-bold">Please sign in to create a portfolio</h1>
          <SignInButton mode="modal">
            <button className="mx-auto rounded-xl bg-white text-[var(--bg-end)] px-5 py-3 font-semibold hover:opacity-95">
              Sign in
            </button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <CreatePortfolioForm />
      </SignedIn>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold text-white/90">{children}</span>;
}

function CreatePortfolioForm() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? "";

  // Basic
  const [name, setName] = useState("");

  // Questionnaire
  const [riskTolerance, setRiskTolerance] =
    useState<"Conservative" | "Balanced" | "Aggressive">("Balanced");
  const [timeHorizon, setTimeHorizon] =
    useState<"0-2" | "3-5" | "6-10" | "10+">("3-5");
  const [approximateValue, setApproximateValue] = useState<string>("");
  const [currency, setCurrency] =
    useState<"USD" | "EUR" | "GBP" | "CHF" | "JPY">("USD");
  const [exchanges, setExchanges] = useState<string[]>([]);
  const [focus, setFocus] = useState<string>("");
  const [rebalancing, setRebalancing] =
    useState<"Monthly" | "Quarterly" | "Annually" | "On-demand">("Quarterly");
  const [targetHoldings, setTargetHoldings] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleExchange(x: string) {
    setExchanges((prev) =>
      prev.includes(x) ? prev.filter((e) => e !== x) : [...prev, x]
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Guard: wait for Clerk
    if (!isLoaded || !userId) {
      setError("One sec—sign-in is still loading. Please try again in a moment.");
      return;
    }

    if (!name.trim()) {
      setError("Please provide a name.");
      return;
    }

    const valueNum = Number(approximateValue);
    if (approximateValue && (Number.isNaN(valueNum) || valueNum < 0)) {
      setError("Approximate value must be a non-negative number.");
      return;
    }

    const thNum = Number(targetHoldings);
    if (targetHoldings && (!Number.isInteger(thNum) || thNum <= 0)) {
      setError("Target number of stocks must be a positive integer.");
      return;
    }

    try {
      setSaving(true);

      // Create under the real, loaded userId
      const id = createPortfolio(userId, {
        name: name.trim(),
        riskTolerance,
        timeHorizon,
        approximateValue: approximateValue ? valueNum : undefined,
        currency,
        exchanges,
        focus: focus.trim() || undefined,
        rebalancing,
        targetHoldings: targetHoldings ? thNum : undefined,
      });

      const pid = typeof id === "string" ? id : id.id;
      router.push(`/portfolio/setup?pid=${encodeURIComponent(pid)}`);
    } finally {
      setSaving(false);
    }
  }

  const buttonDisabled = saving || !isLoaded || !userId;

  return (
    <div className="mx-auto max-w-2xl mt-10">
      <h1 className="text-3xl font-bold">Create portfolio</h1>
      <p className="mt-2 text-white/90">
        Name your portfolio and answer a few quick questions so the AI can tailor its plan.
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-6">
        {/* Name */}
        <div className="grid gap-2">
          <Label>Name</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-white/30 bg-white/90 text-[var(--bg-end)] px-3 py-2 outline-none focus:ring-4 focus:ring-white/30"
            placeholder="e.g. Core Macro Thesis"
            required
          />
        </div>

        {/* Risk tolerance */}
        <div className="grid gap-2">
          <Label>Risk tolerance</Label>
          <div className="flex flex-wrap gap-2">
            {["Conservative", "Balanced", "Aggressive"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRiskTolerance(r as any)}
                className={`rounded-xl px-3 py-2 font-semibold ${
                  riskTolerance === r
                    ? "bg-white text-[var(--bg-end)]"
                    : "bg-white/10 border border-white/30 text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Time horizon */}
        <div className="grid gap-2">
          <Label>Time horizon</Label>
          <select
            value={timeHorizon}
            onChange={(e) => setTimeHorizon(e.target.value as any)}
            className="w-full rounded-xl border border-white/30 bg-white/90 text-[var(--bg-end)] px-3 py-2 outline-none focus:ring-4 focus:ring-white/30"
          >
            <option value="0-2">0–2 years</option>
            <option value="3-5">3–5 years</option>
            <option value="6-10">6–10 years</option>
            <option value="10+">10+ years</option>
          </select>
        </div>

        {/* Approximate value + currency */}
        <div className="grid gap-2">
          <Label>Approximate portfolio value (optional)</Label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step="any"
              value={approximateValue}
              onChange={(e) => setApproximateValue(e.target.value)}
              className="w-full rounded-xl border border-white/30 bg-white/90 text-[var(--bg-end)] px-3 py-2 outline-none focus:ring-4 focus:ring-white/30"
              placeholder="e.g. 25000"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="w-36 rounded-xl border border-white/30 bg-white/90 text-[var(--bg-end)] px-3 py-2 outline-none focus:ring-4 focus:ring-white/30"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CHF">CHF</option>
              <option value="JPY">JPY</option>
            </select>
          </div>
        </div>

        {/* Exchanges (optional) */}
        <div className="grid gap-2">
          <Label>Preferred exchanges (optional)</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "US", label: "US (NYSE/Nasdaq)" },
              { id: "LSE", label: "London (LSE)" },
              { id: "HKEX", label: "Hong Kong (HKEX)" },
              { id: "ALL", label: "All markets" },
            ].map(({ id, label }) => (
              <label
                key={id}
                className="inline-flex items-center gap-2 bg-white/10 border border-white/30 rounded-xl px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={exchanges.includes(id)}
                  onChange={() => toggleExchange(id)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Focus (optional) */}
        <div className="grid gap-2">
          <Label>Particular focus (optional)</Label>
          <textarea
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-white/30 bg-white/90 text-[var(--bg-end)] px-3 py-2 outline-none focus:ring-4 focus:ring-white/30"
            placeholder="e.g., overweight semiconductors; focus on dividend aristocrats; ESG constraints; avoid China ADRs; etc."
          />
        </div>

        {/* Rebalancing preference */}
        <div className="grid gap-2">
          <Label>Rebalancing preference</Label>
          <select
            value={rebalancing}
            onChange={(e) => setRebalancing(e.target.value as any)}
            className="w-full rounded-xl border border-white/30 bg-white/90 text-[var(--bg-end)] px-3 py-2 outline-none focus:ring-4 focus:ring-white/30"
          >
            <option value="Monthly">Monthly</option>
            <option value="Quarterly">Quarterly</option>
            <option value="Annually">Annually</option>
            <option value="On-demand">On-demand</option>
          </select>
        </div>

        {/* Target number of stocks (optional) */}
        <div className="grid gap-2">
          <Label>Target number of stocks (optional)</Label>
          <input
            type="number"
            min={1}
            step={1}
            value={targetHoldings}
            onChange={(e) => setTargetHoldings(e.target.value)}
            className="w-full rounded-xl border border-white/30 bg-white/90 text-[var(--bg-end)] px-3 py-2 outline-none focus:ring-4 focus:ring-white/30"
            placeholder="e.g. 15"
          />
        </div>

        {error && <p className="text-sm text-red-200">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            disabled={buttonDisabled}
            aria-disabled={buttonDisabled}
            className="rounded-xl bg-white text-[var(--bg-end)] px-5 py-3 font-semibold hover:opacity-95 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : !isLoaded
              ? "Connecting…"
              : !userId
              ? "Please sign in"
              : "Create portfolio"}
          </button>
        </div>
      </form>
    </div>
  );
}
