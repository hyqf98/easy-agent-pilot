import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), tailwindcss()],

  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1431,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          const packagePath = id.split("node_modules/").at(-1);
          if (!packagePath) {
            return "vendor-misc";
          }
          const segments = packagePath.split("/");
          const packageName = segments[0].startsWith("@")
            ? `${segments[0]}/${segments[1]}`
            : segments[0];

          if (
            packageName === "vue" ||
            packageName === "pinia" ||
            packageName === "vue-router" ||
            packageName === "vue-i18n"
          ) {
            return "vendor-vue";
          }

          if (packageName.startsWith("@tauri-apps/")) {
            return "vendor-tauri";
          }

          if (packageName === "monaco-editor") {
            return "vendor-monaco";
          }

          if (packageName === "@xterm/xterm" || packageName.startsWith("@xterm/addon-")) {
            return "vendor-xterm";
          }

          if (packageName === "echarts" || packageName === "zrender") {
            return "vendor-echarts";
          }

          if (
            packageName === "markdown-it" ||
            packageName === "highlight.js" ||
            packageName === "linkify-it" ||
            packageName === "mdurl" ||
            packageName === "uc.micro" ||
            packageName === "entities"
          ) {
            return "vendor-markdown";
          }

          if (packageName === "naive-ui") {
            return "vendor-naive-ui";
          }

          if (packageName === "lucide-vue-next") {
            return "vendor-lucide";
          }

          return undefined;
        },
      },
    },
  },
}));
