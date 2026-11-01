import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

/** Gloss components live above this package. Resolve their imports from desktop/node_modules. */
function desktopModules() {
  const from = path.join(here, "src/main.tsx");
  return {
    name: "desktop-modules",
    enforce: "pre" as const,
    async resolveId(source: string, _importer: string | undefined, options: { skipSelf?: boolean }) {
      if (!source || source.startsWith(".") || source.startsWith("/") || source.startsWith("\0")) return null;
      if (source.startsWith("@/") || source === "next/link" || source === "next/navigation" || source === "@clerk/nextjs") return null;
      return this.resolve(source, from, { ...options, skipSelf: true });
    },
  };
}

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
    "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify("https://www.usegloss.io"),
    "process.env.VERCEL_PROJECT_PRODUCTION_URL": "undefined",
    "process.env.VERCEL_ENV": "undefined",
    "process.env.TOGETHER_API_KEY": "undefined",
    "process.env.DATABASE_URL": "undefined",
    "process.env.EXA_API_KEY": "undefined",
    "process.env.LLAMA_CLOUD_API_KEY": "undefined",
  },
  plugins: [desktopModules(), react(), tailwindcss()],
  publicDir: path.join(repo, "public"),
  resolve: {
    alias: {
      "@": repo,
      "next/link": path.join(here, "src/shims/next-link.tsx"),
      "next/navigation": path.join(here, "src/shims/next-navigation.ts"),
      "@clerk/nextjs": path.join(here, "src/shims/clerk.tsx"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [repo] },
    proxy: {
      "/api": "http://127.0.0.1:3921",
      "/media": "http://127.0.0.1:3921",
      "/user-media": "http://127.0.0.1:3921",
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
