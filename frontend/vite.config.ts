import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Le backend tourne sur 8000 en développement. En production, servir le
    // frontend et l'API derrière le même domaine évite toute question de CORS.
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
});
