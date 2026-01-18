import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

const REPO = "osucount";

export default defineConfig(({ command, mode }) => {
  const isDev = command === "serve";        // npm run dev
  const isWeb = mode === "web";              // github pages build

  return {
    // 🔑 КЛЮЧЕВОЕ МЕСТО
    base: isWeb ? `/${REPO}/` : "/",

    plugins: [
      react(),

      // Electron ТОЛЬКО в dev
      isDev &&
      electron({
        main: { entry: "electron/main.ts" },
        preload: {
          input: path.join(__dirname, "electron/preload.ts"),
        },
        renderer: {},
      }),
    ].filter(Boolean),

    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});