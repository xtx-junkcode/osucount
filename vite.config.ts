import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

// ❗️ВАЖНО
// заменишь osucount на имя своего репозитория на GitHub
export default defineConfig({
  base: "/osucount/",

  plugins: [
    react(),

    electron({
      main: {
        entry: "electron/main.ts",
      },
      preload: {
        input: path.join(__dirname, "electron/preload.ts"),
      },

      // для web-версии Electron API просто игнорится
      renderer: {},
    }),
  ],

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});