// The URL prefix the portal is served under: "" locally, "/AxiaRewards" on GitHub Pages.
// The static demo entry sets window.__AXIA_BASE__ before the app loads.
export const BASE: string =
  (typeof window !== "undefined" && (window as unknown as { __AXIA_BASE__?: string }).__AXIA_BASE__) || "";

export const withBase = (path: string) => (path.startsWith("/") ? BASE + path : path);
export const stripBase = (path: string) => (BASE && path.startsWith(BASE) ? path.slice(BASE.length) || "/" : path);
