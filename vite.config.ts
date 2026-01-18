import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

const REPO = "osucount"; // имя репозитория

export default defineConfig(({ mode }) => {
  const isWeb = mode === "web";

  return {
    base: isWeb ? "./" : "/",
    plugins: [
      react(),
      // Electron включаем только когда НЕ web
      !isWeb &&
      electron({
        main: { entry: "electron/main.ts" },
        preload: { input: path.join(__dirname, "electron/preload.ts") },
        renderer: process.env.NODE_ENV === "test" ? undefined : {},
      }),
    ].filter(Boolean),
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});