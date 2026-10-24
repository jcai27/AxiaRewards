import React, { useState } from "react";
import { withBase } from "../lib/base-path";
import { setSignedIn } from "./demo-api";

export function DemoSignIn({ returnTo }: { returnTo: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (username.trim() === "demo" && password === "demo") {
      setSignedIn(true);
      window.location.replace(withBase(returnTo));
    } else setError("That username or password is incorrect.");
  }
  return (
    <main className="demo-signin">
      <form className="demo-signin-card" onSubmit={submit}>
        <div className="demo-signin-brand">
          <img src={withBase("/axia-logo.png")} alt="Axia by Qcells" width={724} height={312} />
          <span>Admin</span>
        </div>
        <h1>Sign in</h1>
        <p>Sign in to manage the rebate and referral program.</p>
        <div className="demo-signin-hint">This is a demo. Use username <b>demo</b> and password <b>demo</b>.</div>
        {error && <div className="demo-signin-error" role="alert">{error}</div>}
        <label htmlFor="username">Username</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Sign in</button>
        <a href={withBase("/")}>Back to the rebate site</a>
      </form>
    </main>
  );
}
