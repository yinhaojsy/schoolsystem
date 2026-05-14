import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { initDatabase } from "./db.js";
import { migrateLegacyPayments } from "./paymentEngine.js";
import apiRoutes from "./routes/api.js";

dotenv.config();

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "../dist");

// Initialize database
initDatabase();
migrateLegacyPayments();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", apiRoutes);

// Serve frontend static files (production build)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Catch-all: send index.html for any non-API route so React Router works
  app.get("*", (req, res) => {
    res.sendFile(join(distPath, "index.html"));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

export default app;
