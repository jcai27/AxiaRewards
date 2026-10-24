// Stand-in for the "cloudflare:workers" module in the browser-only demo.
// demo-api.ts installs the sql.js-backed D1 binding at startup.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const env: Record<string, any> = { DB: null };
