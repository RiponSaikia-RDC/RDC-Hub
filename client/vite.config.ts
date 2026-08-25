import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Set via `VITE_BASE=/hub/ npm run build -w client` when building for the
  // unified RDC Dashboard (see ../../dashboard). Defaults to "/" for
  // standalone dev/build, unchanged from before.
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
