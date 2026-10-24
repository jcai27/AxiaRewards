// Builds the browser-only demo for GitHub Pages: the portal plus its API handlers
// running in the page against an in-browser SQLite database (see static-demo/).
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: path("./static-demo"),
  base: process.env.DEMO_BASE || "/AxiaRewards/",
  publicDir: path("./public"),
  plugins: [react()],
  resolve: {
    alias: {
      "cloudflare:workers": path("./static-demo/shims/cloudflare-workers.ts"),
      "next/headers": path("./static-demo/shims/next-headers.ts"),
      "next/navigation": path("./static-demo/shims/next-navigation.ts"),
    },
  },
  css: { postcss: path(".") },
  build: { outDir: path("./dist-demo"), emptyOutDir: true, target: "es2022" },
});
