"use client";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ChatPageContent() {
  const pid = useSearchParams().get("pid");
  const router = useRouter();
  if (!pid) { if (typeof window !== "undefined") router.replace("/dashboard"); return null; }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[var(--bg-start)] to-[var(--bg-end)] text-white p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-extrabold">Chat with AI (Coming Soon)</h1>
        <p className="mt-2 text-white/90">
          We’ll wire a real chat endpoint next. For now, go back to the draft and accept or regenerate.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href={`/portfolio/ai-full?pid=${pid}`} className="rounded-xl border border-white/70 bg-white/10 px-5 py-3 font-semibold backdrop-blur hover:bg-white/20">
            Back to proposal
          </Link>
          <Link href="/dashboard" className="rounded-xl bg-white text-[var(--bg-end)] px-5 py-3 font-semibold hover:opacity-95">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}