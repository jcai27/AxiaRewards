/// <reference types="vite/client" />
// Must be the first import in main.tsx: lib/base-path.ts reads this when it loads.
(window as unknown as { __AXIA_BASE__: string }).__AXIA_BASE__ = import.meta.env.BASE_URL.replace(/\/$/, "");
