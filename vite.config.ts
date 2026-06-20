import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

function redirectRootToStaff(): Plugin {
  return {
    name: "redirect-root-to-staff",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/" || req.url?.startsWith("/?")) {
          res.writeHead(302, { Location: "/staff/" });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: "/staff/",
  cacheDir: path.join(repoRoot, ".vite-staff"),
  plugins: [react(), redirectRootToStaff()],
  optimizeDeps: {
    include: ["jspdf", "jspdf-autotable"],
    needsInterop: ["jspdf-autotable"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
