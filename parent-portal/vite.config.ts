import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const portalRoot = path.dirname(fileURLToPath(import.meta.url));
const tailwindConfig = path.join(portalRoot, "tailwind.config.js");

function redirectRootToParents(): Plugin {
  return {
    name: "redirect-root-to-parents",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/" || req.url?.startsWith("/?")) {
          res.writeHead(302, { Location: "/parents/" });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: portalRoot,
  base: "/parents/",
  cacheDir: path.join(portalRoot, ".vite"),
  css: {
    postcss: {
      plugins: [tailwindcss({ config: tailwindConfig }), autoprefixer()],
    },
  },
  plugins: [react(), redirectRootToParents()],
  build: {
    outDir: path.resolve(portalRoot, "..", "dist-parent"),
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
