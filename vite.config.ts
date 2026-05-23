/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "netlify/functions/**/*.test.ts",
      "src/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
});
