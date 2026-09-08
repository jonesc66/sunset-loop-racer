import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/sunset-loop-racer/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Local acceptance browser profiles contain locked databases, not app source.
    watch: { ignored: ["**/.edge-*-profile/**"] }
  }
});
