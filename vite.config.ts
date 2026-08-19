import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    // Listen on all interfaces so friends on the same LAN/VPN (e.g. Hamachi)
    // can open http://<your-ip>:5173 — the signaling URL follows the page
    // hostname (src/config.ts), so no further config is needed.
    host: true,
  },
});
