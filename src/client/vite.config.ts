import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// dev UI on :8004, proxying the API + sockets to the CRANE server on :8000
export default defineConfig({
  plugins: [react()],
  server: { port: 8004, host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:8000", "/ws": { target: "ws://127.0.0.1:8000", ws: true } } },
  build: { outDir: "../server/static", emptyOutDir: true },
});
