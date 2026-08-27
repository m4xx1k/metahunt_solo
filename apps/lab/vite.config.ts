import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 4200 },
  // The graph artifact is fetched at runtime from public/data/, not bundled;
  // the graphology + louvain deps still push the chunk past the default warn.
  build: { chunkSizeWarningLimit: 2000 },
});
