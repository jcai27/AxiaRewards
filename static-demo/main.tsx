import "./set-base";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import "../app/admin.css";
import "../app/consumer.css";
import "./demo.css";
import Portal from "../app/portal";
import { stripBase, withBase } from "../lib/base-path";
import { installDemoApi, resetDemo, setSignedIn } from "./demo-api";
import { DemoSignIn } from "./sign-in";

function safeReturn(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "";
}

function DemoNotice() {
  const [busy, setBusy] = useState(false);
  return (
    <aside className="demo-notice" aria-label="Demo information">
      <span><b>Demo</b> Fictional data, stored only in this browser.</span>
      <button disabled={busy} onClick={async () => {
        if (!window.confirm("Reset the demo? This erases every change made in this browser.")) return;
        setBusy(true);
        await resetDemo();
        window.location.assign(withBase("/"));
      }}>Reset demo</button>
    </aside>
  );
}

installDemoApi();
const path = stripBase(window.location.pathname);
const returnTo = safeReturn(new URLSearchParams(window.location.search).get("return_to"));

if (path === "/signout-with-chatgpt") {
  setSignedIn(false);
  window.location.replace(withBase(returnTo || "/"));
} else {
  createRoot(document.getElementById("root")!).render(
    path === "/signin-with-chatgpt" ? <DemoSignIn returnTo={returnTo || "/home"} /> : <><Portal /><DemoNotice /></>,
  );
}
