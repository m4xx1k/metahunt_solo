import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 4200 },
  // The artifact is a single ~800 KB JSON imported at build time. Warning about
  // it on every build would train us to ignore the warning that matters.
  build: { chunkSizeWarningLimit: 2000 },
});
