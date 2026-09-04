"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { FormEvent, useState } from "react";

export function AuthForm({
  context = "book",
  initialMode = "signUp",
  onSuccess,
}: {
  context?: "book" | "share";
  initialMode?: "signUp" | "signIn";
  onSuccess?: () => void;
}) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signUp" | "signIn">(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    form.set("flow", mode);
    try {
      await signIn("password", form);
      onSuccess?.();
    } catch {
      setError(mode === "signUp" ? "That email may already have an account. Try signing in." : "The email or password did not match.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-intro" aria-labelledby="auth-title">
        <p className="wordmark">Postcard</p>
        <p className="eyebrow">{context === "share" ? "A journey shared with you" : "A private travel book"}</p>
        <h1 id="auth-title">{context === "share" ? "Someone saved the details worth passing on." : "The photographs you kept. The stories only you know."}</h1>
        <p>{context === "share" ? "Sign in to read the complete journey. Shared books stay private to people who have the link." : "Shape one completed trip into a quiet chapter, built from your photos and told in your voice."}</p>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div>
          <p className="eyebrow">{context === "share" ? "Open the shared journey" : mode === "signUp" ? "Begin your book" : "Return to your book"}</p>
          <h2>{mode === "signUp" ? "Create a private account" : "Sign in"}</h2>
        </div>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === "signUp" ? "new-password" : "current-password"} minLength={8} required /><span>At least 8 characters.</span></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" disabled={busy}>{busy ? "Opening…" : mode === "signUp" ? "Create account" : "Sign in"}</button>
        <button className="text-button" type="button" onClick={() => { setMode(mode === "signUp" ? "signIn" : "signUp"); setError(""); }}>
          {mode === "signUp" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </div>
  );
}
