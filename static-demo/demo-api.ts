/// <reference types="vite/client" />
// Browser-only stand-in for the portal's server. The real API handlers in
// app/api/program/route.ts run unchanged in the page against SQLite compiled to
// WebAssembly (sql.js), wrapped in the subset of Cloudflare's D1 API they use.
// The database persists in this browser's IndexedDB; nothing leaves the browser.
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import schema0 from "../drizzle/0000_familiar_moon_knight.sql?raw";
import schema1 from "../drizzle/0001_dashing_wolverine.sql?raw";
import { env } from "./shims/cloudflare-workers";
import { setRequestHeaders } from "./shims/next-headers";

const DB_KEY = "portal-db-v1";
const SESSION_KEY = "axia-demo-admin";
export const DEMO_ADMIN = { id: "demo_admin", email: "demo@axia-demo.test", name: "Demo Admin" };

let dirty = false;
let persist: () => Promise<void> = async () => {};

class Statement {
  constructor(private db: Database, private sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }
  private rows<T>(): T[] {
    const stmt = this.db.prepare(this.sql);
    try {
      stmt.bind(this.params.map(toSql));
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      return out;
    } finally {
      stmt.free();
    }
  }
  exec() {
    this.db.run(this.sql, this.params.map(toSql));
    const changes = this.db.getRowsModified();
    if (changes) dirty = true;
    return { meta: { changes } };
  }
  async first<T>() {
    return this.rows<T>()[0] ?? null;
  }
  async all<T>() {
    return { results: this.rows<T>() };
  }
  async run() {
    return this.exec();
  }
}
const toSql = (v: unknown): SqlValue => (v === undefined ? null : typeof v === "boolean" ? Number(v) : (v as SqlValue));

class D1 {
  constructor(private db: Database) {}
  prepare(sql: string) {
    return new Statement(this.db, sql);
  }
  async batch(statements: Statement[]) {
    this.db.run("BEGIN");
    try {
      const results = statements.map((s) => s.exec());
      this.db.run("COMMIT");
      return results;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }
}

function store(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("axia-demo", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadBytes(): Promise<Uint8Array | undefined> {
  try {
    const db = await store();
    return await new Promise((resolve) => {
      const get = db.transaction("kv").objectStore("kv").get(DB_KEY);
      get.onsuccess = () => resolve(get.result as Uint8Array | undefined);
      get.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}
async function saveBytes(bytes: Uint8Array | null) {
  try {
    const db = await store();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("kv", "readwrite");
      if (bytes) tx.objectStore("kv").put(bytes, DB_KEY);
      else tx.objectStore("kv").delete(DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Private mode or blocked storage: the demo still works for this page view.
  }
}

async function init() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await loadBytes();
  const db = saved ? new SQL.Database(saved) : new SQL.Database();
  if (!saved) for (const sql of [schema0, schema1]) db.exec(sql.replaceAll("--> statement-breakpoint", ""));
  env.DB = new D1(db);
  persist = () => saveBytes(db.export());
}

export const isSignedIn = () => {
  try {
    return localStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
};
export const setSignedIn = (on: boolean) => {
  try {
    if (on) localStorage.setItem(SESSION_KEY, "1");
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable: sign-in lasts until the page reloads.
  }
};
export async function resetDemo() {
  await saveBytes(null);
  setSignedIn(false);
}

let ready: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function handle(url: URL, init?: RequestInit) {
  await ready;
  const { GET, POST } = await import("../app/api/program/route");
  const identity = new Headers();
  if (isSignedIn()) {
    identity.set("oai-authenticated-user-id", DEMO_ADMIN.id);
    identity.set("oai-authenticated-user-email", DEMO_ADMIN.email);
    identity.set("oai-authenticated-user-full-name", encodeURIComponent(DEMO_ADMIN.name));
    identity.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
  }
  setRequestHeaders(identity);
  const request = new Request(url.href, init);
  const response = request.method === "POST" ? await POST(request) : await GET(request);
  if (dirty) {
    dirty = false;
    await persist();
  }
  return response;
}

/** Answer the portal's /api/program requests in the page instead of over the network. */
export function installDemoApi() {
  ready = init();
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith("/api/program")) return realFetch(input, init);
    // One request at a time, like a single server worker.
    const run = queue.then(() => handle(url, init));
    queue = run.catch(() => undefined);
    return run;
  };
}
