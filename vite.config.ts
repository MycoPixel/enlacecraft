import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Using a relative base so the build works when hosted at any sub-path
// (GitHub Pages project sites, Vercel, a plain static file server, etc).
export default defineConfig({
  plugins: [react()],
  base: "./",
});
