import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/sunset-loop-racer/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Generated evidence and local tool runtimes are not application source.
    // Windows can lock a just-written evidence file while chokidar starts watching it.
    watch: { ignored: ["**/.edge-*-profile/**", "**/verification/**", "**/.tools/**"] }
  }
});
