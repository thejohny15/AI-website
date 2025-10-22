"use client";

export default function DebugPage() {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  console.log("Clerk PK in browser =", pk);
  return (
    <main style={{ padding: 24 }}>
      <h1>Debug</h1>
      <p>Publishable key (client): <code>{String(pk)}</code></p>
    </main>
  );
}