// Vendored from @openai/sites-vite-plugin 0.2.0 (openai/sites#9).
// See sites-vite-plugin.LICENSE for the upstream MIT license.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { access, cp, mkdir, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const localUserId = "local_seedy";
const localEmail = "seedy@sites.test";
const localFullName = "Seedy";
const localCookieName = "__sites_local_auth";
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const localAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const authPaths = new Set([
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
  "/callback",
]);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function sites({ mockAuth = true } = {}): Plugin {
  let root = process.cwd();
  let command: "build" | "serve" = "build";

  return {
    name: "sites",
    configResolved(config) {
      root = config.root;
      command = config.command;
    },
    configureServer(server) {
      if (!mockAuth) return;
      const secure = Boolean(server.config.server.https);

      server.config.logger.info(`Sites local sign-in: ${localEmail}`);
      const password = readAdminPassword(root);
      const remote = password ? remoteSignIn(password) : null;
      server.config.logger.info(
        remote
          ? "Remote administrator sign-in: password protected"
          : "Remote administrator sign-in: disabled (set AXIA_ADMIN_USERNAME and AXIA_ADMIN_PASSWORD in .env.local)",
      );
      server.middlewares.use((request, response, next) => {
        for (const name of Object.keys(request.headers)) {
          if (name.startsWith("oai-authenticated-user-")) {
            removeHeader(request, name);
          }
        }

        let authority: URL;
        let url: URL;
        try {
          authority = new URL(
            `${secure ? "https" : "http"}://${request.headers.host}`,
          );
          url = new URL(request.url ?? "/", authority);
        } catch {
          if (authPaths.has((request.url ?? "/").split("?")[0])) {
            respond(response, 403);
          } else {
            next();
          }
          return;
        }

        const hostname = authority.hostname
          .replace(/^\[|\]$/g, "")
          .toLowerCase();
        if (
          !localHosts.has(hostname) ||
          !localAddresses.has(request.socket.remoteAddress ?? "") ||
          url.origin !== authority.origin
        ) {
          if (remote) remote.handle(request, response, url, next);
          else if (authPaths.has(url.pathname)) respond(response, 403);
          else next();
          return;
        }

        const cookies = (request.headers.cookie ?? "")
          .split(";")
          .map((cookie) => cookie.trim())
          .filter(Boolean);
        const signInCookies = cookies
          .filter((cookie) => cookie.startsWith(`${localCookieName}=`))
          .map((cookie) => cookie.slice(localCookieName.length + 1));
        const applicationCookies = cookies.filter(
          (cookie) => !cookie.startsWith(`${localCookieName}=`),
        );
        if (applicationCookies.length !== cookies.length) {
          removeHeader(request, "cookie");
          if (applicationCookies.length) {
            setHeader(request, "cookie", applicationCookies.join("; "));
          }
        }

        if (url.pathname === "/callback") {
          respond(response, 501);
          return;
        }

        const signIn = url.pathname === "/signin-with-chatgpt";
        const signOut = url.pathname === "/signout-with-chatgpt";
        if (!signIn && !signOut) {
          if (signInCookies.length === 1 && signInCookies[0] === "1") {
            setHeader(request, "oai-authenticated-user-id", localUserId);
            setHeader(request, "oai-authenticated-user-email", localEmail);
            setHeader(
              request,
              "oai-authenticated-user-full-name",
              localFullName,
            );
            setHeader(
              request,
              "oai-authenticated-user-full-name-encoding",
              "percent-encoded-utf-8",
            );
          }
          next();
          return;
        }

        if (
          (request.headers.origin && request.headers.origin !== url.origin) ||
          request.headers["sec-fetch-site"] === "cross-site"
        ) {
          respond(response, 403);
          return;
        }

        if (
          request.headers["next-router-prefetch"] !== undefined ||
          request.headers["x-middleware-prefetch"] === "1" ||
          [request.headers.purpose, request.headers["sec-purpose"]].some(
            (value) =>
              typeof value === "string" &&
              value
                .split(/[;,]/)
                .some((part) => part.trim().toLowerCase() === "prefetch"),
          )
        ) {
          respond(response, 204);
          return;
        }

        if (
          request.method !== "GET" &&
          (!signOut || request.method !== "POST")
        ) {
          response.setHeader("Allow", signIn ? "GET" : "GET, POST");
          respond(response, 405);
          return;
        }

        response.statusCode = request.method === "POST" ? 303 : 302;
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader(
          "Location",
          safeReturn(url.searchParams.get("return_to")),
        );
        response.setHeader(
          "Set-Cookie",
          `${localCookieName}=${signIn ? "1" : ""}; Path=/; ${
            signOut ? "Max-Age=0; " : ""
          }HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
        );
        response.end();
      });
    },
    async closeBundle() {
      if (command !== "build") return;

      const outputDirectory = resolve(root, "dist", ".openai");
      const hostingConfig = resolve(root, ".openai", "hosting.json");
      const drizzleSource = resolve(root, "drizzle");

      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });

      await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      if (await exists(drizzleSource)) {
        await cp(drizzleSource, resolve(outputDirectory, "drizzle"), {
          recursive: true,
        });
      }
    },
  };
}

// Not part of the vendored plugin: password sign-in for requests that arrive
// through a public hostname (e.g. Tailscale Funnel), where the localhost-only
// mock sign-in above refuses to run. A valid session signs in as the local owner.
const remoteCookieName = "__axia_admin_session";
const sessionMaxAgeSeconds = 12 * 60 * 60;
const failureWindowMs = 15 * 60 * 1000;
const maxFailuresPerClient = 5;
const maxFailuresOverall = 30;

function readAdminPassword(
  root: string,
): { username: string; password: string } | null {
  let file = "";
  try {
    file = readFileSync(resolve(root, ".env.local"), "utf8");
  } catch {
    // No .env.local: fall back to the process environment only.
  }
  const read = (name: string) =>
    process.env[name] ??
    file
      .match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]
      .trim()
      .replace(/^["']|["']$/g, "");
  const password = read("AXIA_ADMIN_PASSWORD");
  return password
    ? { username: read("AXIA_ADMIN_USERNAME") || "admin", password }
    : null;
}

function remoteSignIn({ username, password }: { username: string; password: string }) {
  const credential = (user: string, pass: string) =>
    createHash("sha256").update(`${user}\u0000${pass}`).digest();
  const expected = credential(username, password);
  const sessions = new Map<string, number>();
  const failures: number[] = [];
  const clientFailures = new Map<string, number[]>();

  const recent = (times: number[]) =>
    times.filter((time) => Date.now() - time < failureWindowMs);
  // The proxy appends the real client address last; earlier entries are client-supplied.
  const clientKey = (request: IncomingMessage) =>
    String(request.headers["x-forwarded-for"] ?? "unknown")
      .split(",")
      .at(-1)!
      .trim();
  const sessionToken = (request: IncomingMessage) => {
    const cookies = (request.headers.cookie ?? "")
      .split(";")
      .map((cookie) => cookie.trim());
    const own = cookies.filter((cookie) =>
      cookie.startsWith(`${remoteCookieName}=`),
    );
    const others = cookies.filter(
      (cookie) =>
        cookie &&
        !cookie.startsWith(`${remoteCookieName}=`) &&
        !cookie.startsWith(`${localCookieName}=`),
    );
    removeHeader(request, "cookie");
    if (others.length) setHeader(request, "cookie", others.join("; "));
    const token = own[0]?.slice(remoteCookieName.length + 1);
    const expiry = token ? sessions.get(token) : undefined;
    if (token && expiry && expiry > Date.now()) return token;
    if (token) sessions.delete(token);
    return null;
  };
  // Prefer Fetch Metadata: browsers can send `Origin: null` for same-origin form posts.
  const sameSite = (request: IncomingMessage) => {
    const site = request.headers["sec-fetch-site"];
    if (site) return site === "same-origin";
    const origin = request.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === request.headers.host;
    } catch {
      return false;
    }
  };
  const redirect = (response: ServerResponse, to: string, cookie?: string) => {
    response.statusCode = 303;
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Location", to);
    if (cookie) response.setHeader("Set-Cookie", cookie);
    response.end();
  };

  return {
    handle(
      request: IncomingMessage,
      response: ServerResponse,
      url: URL,
      next: () => void,
    ): void {
      const token = sessionToken(request);
      const returnTo = safeReturn(url.searchParams.get("return_to"));

      if (url.pathname === "/callback") {
        respond(response, 404);
        return;
      }

      if (url.pathname === "/signout-with-chatgpt") {
        if (token) sessions.delete(token);
        redirect(
          response,
          returnTo,
          `${remoteCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
        );
        return;
      }

      if (url.pathname !== "/signin-with-chatgpt") {
        if (token) {
          setHeader(request, "oai-authenticated-user-id", localUserId);
          setHeader(request, "oai-authenticated-user-email", localEmail);
          setHeader(request, "oai-authenticated-user-full-name", localFullName);
          setHeader(
            request,
            "oai-authenticated-user-full-name-encoding",
            "percent-encoded-utf-8",
          );
        }
        next();
        return;
      }

      if (token) {
        redirect(response, returnTo);
        return;
      }
      if (request.method === "GET") {
        signInPage(response, returnTo, "");
        return;
      }
      if (request.method !== "POST" || !sameSite(request)) {
        respond(response, request.method === "POST" ? 403 : 405);
        return;
      }

      const key = clientKey(request);
      const clientRecent = recent(clientFailures.get(key) ?? []);
      const overallRecent = recent(failures);
      if (
        clientRecent.length >= maxFailuresPerClient ||
        overallRecent.length >= maxFailuresOverall
      ) {
        signInPage(
          response,
          returnTo,
          "Too many failed attempts. Try again in 15 minutes.",
          429,
        );
        return;
      }

      let body = "";
      let tooLarge = false;
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > 4096) {
          tooLarge = true;
          request.destroy();
        }
      });
      request.on("end", () => {
        if (tooLarge) return;
        const fields = new URLSearchParams(body);
        const actual = credential(
          fields.get("username")?.trim() ?? "",
          fields.get("password") ?? "",
        );
        if (!timingSafeEqual(actual, expected)) {
          const now = Date.now();
          clientFailures.set(key, [...clientRecent, now]);
          failures.splice(0, failures.length, ...overallRecent, now);
          signInPage(
            response,
            returnTo,
            "That username or password is incorrect.",
            401,
          );
          return;
        }
        clientFailures.delete(key);
        const session = randomBytes(32).toString("base64url");
        sessions.set(session, Date.now() + sessionMaxAgeSeconds * 1000);
        redirect(
          response,
          returnTo,
          `${remoteCookieName}=${session}; Path=/; Max-Age=${sessionMaxAgeSeconds}; HttpOnly; SameSite=Lax; Secure`,
        );
      });
    },
  };
}

function signInPage(
  response: ServerResponse,
  returnTo: string,
  error: string,
  status = 200,
): void {
  const escape = (value: string) =>
    value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  response.statusCode = status;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Axia admin sign in</title>
<style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f6;color:#1b1726;font:14px/1.5 Inter,system-ui,-apple-system,'Segoe UI',sans-serif;padding:16px}
main{width:100%;max-width:380px;background:#fff;border:1px solid #e3e2e8;border-radius:6px;padding:28px}
.brand{display:flex;align-items:baseline;gap:6px;margin-bottom:20px}.brand b{font-size:26px;letter-spacing:-1.5px;color:#4815a5}.brand span{font-size:12px;color:#6b6677}
h1{font-size:18px;font-weight:600;margin:0}p{margin:4px 0 20px;color:#6b6677}label{display:block;font-size:13px;font-weight:500;color:#4f4a5c;margin-bottom:6px}
input{width:100%;height:38px;border:1px solid #cdcbd5;border-radius:4px;padding:0 10px;font:inherit}input:focus{outline:0;border-color:#4815a5;box-shadow:0 0 0 3px #4815a522}
button{margin-top:16px;width:100%;height:38px;border:0;border-radius:4px;background:#4815a5;color:#fff;font:inherit;font-weight:500;cursor:pointer}button:hover{background:#3a0f88}button:focus-visible{outline:2px solid #4815a5;outline-offset:2px}
.error{background:#fbe9e7;color:#ae2216;border:1px solid #f0c9c4;border-radius:4px;padding:8px 10px;margin-bottom:16px;font-size:13px}a{color:#4815a5;font-size:13px}.back{display:block;margin-top:16px;text-align:center}</style></head>
<body><main><div class="brand"><b>axia</b><span>by Qcells · Admin</span></div><h1>Sign in</h1><p>Sign in to manage the rebate and referral program.</p>
${error ? `<div class="error" role="alert">${escape(error)}</div>` : ""}<form method="post" action="/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}"><label for="username">Username</label><input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus><label for="password" style="margin-top:14px">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form>
<a class="back" href="/">Back to the rebate site</a></main></body></html>`);
}

function removeHeader(request: IncomingMessage, name: string): void {
  delete request.headers[name];
  for (let index = request.rawHeaders.length - 2; index >= 0; index -= 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) {
      request.rawHeaders.splice(index, 2);
    }
  }
}

function setHeader(
  request: IncomingMessage,
  name: string,
  value: string,
): void {
  removeHeader(request, name);
  request.headers[name] = value;
  request.rawHeaders.push(name, value);
}

function respond(response: ServerResponse, status: number): void {
  response.statusCode = status;
  response.setHeader("Cache-Control", "private, no-store");
  response.end();
}

function safeReturn(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost" || authPaths.has(url.pathname)) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
