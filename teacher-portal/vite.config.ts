import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const portalRoot = path.dirname(fileURLToPath(import.meta.url));
const tailwindConfig = path.join(portalRoot, "tailwind.config.js");

function redirectRootToTeacher(): Plugin {
  return {
    name: "redirect-root-to-teacher",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/" || req.url?.startsWith("/?")) {
          res.writeHead(302, { Location: "/teacher/" });
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
  base: "/teacher/",
  css: {
    postcss: {
      plugins: [tailwindcss({ config: tailwindConfig }), autoprefixer()],
    },
  },
  plugins: [react(), redirectRootToTeacher()],
  build: {
    outDir: path.resolve(portalRoot, "..", "dist-teacher"),
    emptyOutDir: true,
  },
  server: {
    port: 5176,
    host: true,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
