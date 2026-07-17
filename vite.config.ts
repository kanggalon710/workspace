import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "react-vendor";
          if (id.includes("@radix-ui")) return "radix-vendor";
          if (id.includes("framer-motion")) return "motion-vendor";
          if (id.includes("@tanstack")) return "query-vendor";
          if (id.includes("react-hook-form") || id.includes("@hookform") || id.includes("/zod/") || id.includes("drizzle-zod")) return "forms-vendor";
          if (id.includes("@react-google-maps") || id.includes("/leaflet/") || id.includes("react-leaflet")) return "maps-vendor";
          if (id.includes("recharts") || id.includes("d3-")) return "chart-vendor";
        },
      },
    },
  },
  server: {
    port: 3002,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
});
