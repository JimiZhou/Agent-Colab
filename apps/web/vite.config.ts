import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/skill.md": "http://localhost:8787",
      "/.well-known": "http://localhost:8787",
    },
  },
});
