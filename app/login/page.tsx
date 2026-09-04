"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function SignInForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setIsSigningIn(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.href = params.get("next") || "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That password was not accepted.");
      setIsSigningIn(false);
    }
  }

  return (
    <form className="editor-form" onSubmit={signIn}>
      <div className="wordmark"><span>R</span><strong>Reel Rhythm</strong></div>
      <p className="eyebrow">Private tracker</p>
      <h2>Your publishing log, for your eyes.</h2>
      <label>
        Password
        <input name="password" type="password" required autoFocus autoComplete="current-password" />
      </label>
      {error && <p className="form-hint" role="alert">{error}</p>}
      <button className="primary-button full-button" disabled={isSigningIn}>
        {isSigningIn ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

export default function Login() {
  return (
    <main className="login-page">
      <Suspense fallback={<div className="editor-form" />}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
