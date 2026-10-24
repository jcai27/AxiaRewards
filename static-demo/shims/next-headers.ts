// Stand-in for "next/headers" in the browser-only demo. demo-api.ts sets the
// identity headers for each request before calling the API handler.
let current = new Headers();

export function setRequestHeaders(headers: Headers) {
  current = headers;
}

export async function headers() {
  return current;
}
