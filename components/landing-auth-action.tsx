"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { AuthForm } from "./auth-form";

type AuthMode = "signUp" | "signIn";

function safeReturnPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/book";
}

export function LandingAuthAction({
  children,
  className,
  mode,
  authenticatedLabel,
  respondToRedirect = false,
}: {
  children: ReactNode;
  className: string;
  mode: AuthMode;
  authenticatedLabel?: ReactNode;
  respondToRedirect?: boolean;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [open, setOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<AuthMode>(mode);
  const [returnTo, setReturnTo] = useState("/book");
  const [pendingReturnTo, setPendingReturnTo] = useState<string | null>(null);

  useEffect(() => {
    if (!respondToRedirect || isAuthenticated) return;
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams(window.location.search);
      const requestedMode = parameters.get("auth");
      if (requestedMode !== "sign-in" && requestedMode !== "sign-up") return;
      setActiveMode(requestedMode === "sign-in" ? "signIn" : "signUp");
      setReturnTo(safeReturnPath(parameters.get("next")));
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, respondToRedirect]);

  useEffect(() => {
    if (isAuthenticated && pendingReturnTo) router.replace(pendingReturnTo);
  }, [isAuthenticated, pendingReturnTo, router]);

  if (isAuthenticated) {
    return <Link className={className} href="/book">{authenticatedLabel ?? children}</Link>;
  }

  function close() {
    setOpen(false);
    if (respondToRedirect && window.location.search) router.replace("/");
  }

  return (
    <>
      <button
        className={className}
        type="button"
        disabled={isLoading}
        onClick={() => { setActiveMode(mode); setReturnTo("/book"); setOpen(true); }}
      >
        {children}
      </button>
      {open ? (
        <div className="landing-auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="landing-auth-dialog" role="dialog" aria-modal="true" aria-label={activeMode === "signIn" ? "Sign in to Postcard" : "Create a Postcard account"}>
            <button className="landing-auth-close" type="button" onClick={close} aria-label="Close authentication">Close</button>
            <AuthForm
              context={returnTo.startsWith("/share/") ? "share" : "book"}
              initialMode={activeMode}
              onSuccess={() => {
                setOpen(false);
                setPendingReturnTo(returnTo);
              }}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
