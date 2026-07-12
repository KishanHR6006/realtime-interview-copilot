import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    port: 5175,
    strictPort: true,
    hmr: { port: 5175 },
  },
  build: {
    rollupOptions: {
      // offscreen.html isn't referenced by any manifest field crxjs tracks
      // (it's only opened at runtime via chrome.offscreen.createDocument),
      // so it has to be registered as an explicit build entry.
      input: {
        offscreen: "src/offscreen.html",
      },
    },
  },
});
