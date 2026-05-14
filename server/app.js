import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDatabase } from "./db.js";
import { migrateLegacyPayments } from "./paymentEngine.js";
import apiRoutes from "./routes/api.js";

dotenv.config();

const app = express();

// Initialize database
initDatabase();
migrateLegacyPayments();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

export default app;
