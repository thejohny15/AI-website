"use client";
import { useEffect, useState } from "react";

export default function RotatingHeadline({ items, intervalMs = 2800 }: { items: string[]; intervalMs?: number }) {
  const [idx, setIdx] = useState(0);
  const current = items[idx];
  useEffect(() => { const id = setInterval(() => setIdx(i => (i + 1) % items.length), intervalMs); return () => clearInterval(id); }, [items.length, intervalMs]);
  return (
    <h1 key={current} className="animate-fade text-center text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight drop-shadow">{current}</h1>
  );
}
