"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { FormEvent, useState } from "react";

export function AuthForm() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signUp" | "signIn">("signUp");
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
    } catch {
      setError(mode === "signUp" ? "That email may already have an account. Try signing in." : "The email or password did not match.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-intro" aria-labelledby="auth-title">
        <p className="wordmark">Triplog</p>
        <p className="eyebrow">A private travel book</p>
        <h1 id="auth-title">The photographs you kept. The stories only you know.</h1>
        <p>Shape one completed trip into a quiet chapter, built from your photos and told in your voice.</p>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div>
          <p className="eyebrow">{mode === "signUp" ? "Begin your book" : "Return to your book"}</p>
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
