"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { useMemo } from "react";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const address = process.env.NEXT_PUBLIC_CONVEX_URL;
  const client = useMemo(() => (address ? new ConvexReactClient(address) : null), [address]);

  if (client === null) {
    return (
      <main className="setup-shell">
        <p className="eyebrow">Local setup needed</p>
        <h1>Connect the book to Convex.</h1>
        <p>Run <code>npx convex dev --local</code>, then restart the web app. This creates the local database address.</p>
      </main>
    );
  }
  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}

