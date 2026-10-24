// Stand-in for "next/navigation" in the browser-only demo. The API never redirects;
// this only satisfies the import in app/chatgpt-auth.ts.
export function redirect(url: string): never {
  window.location.assign(url);
  throw new Error(`Redirecting to ${url}`);
}
