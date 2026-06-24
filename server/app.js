import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { initDatabase, db, dataDir } from "./db.js";
import { migrateLegacyPayments, refreshAllInvoiceStatementAmountsForStudent } from "./paymentEngine.js";
import { backfillParentStudentsFromHouseholds } from "./parentStudents.js";
import apiRoutes from "./routes/api.js";

dotenv.config();

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "../dist");
const distParentPath = join(__dirname, "../dist-parent");
const distTeacherPath = join(__dirname, "../dist-teacher");
const uploadsPath = join(__dirname, "uploads");

fs.mkdirSync(uploadsPath, { recursive: true });

// Initialize database
initDatabase();
backfillParentStudentsFromHouseholds();
migrateLegacyPayments();
for (const row of db.prepare(`SELECT DISTINCT studentId FROM invoices`).all()) {
  refreshAllInvoiceStatementAmountsForStudent(row.studentId);
}

// Middleware
app.use((req, res, next) => {
  if (req.hostname === "www.sproutsvalley.ac.pk") {
    return res.redirect(301, `https://sproutsvalley.ac.pk${req.originalUrl}`);
  }
  next();
});
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", apiRoutes);
app.use("/api/uploads", express.static(join(dataDir, "uploads")));

const staffAppPaths = [
  "/login",
  "/students",
  "/students-list",
  "/fee-structures",
  "/class-groups",
  "/invoices",
  "/notifications",
  "/parent-management",
  "/teacher-management",
  "/invoice-template",
  "/settings",
];

for (const path of staffAppPaths) {
  app.get(path, (req, res) => {
    const queryIndex = req.originalUrl.indexOf("?");
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
    res.redirect(301, `/staff${path}${query}`);
  });
}

const publicPath = join(__dirname, "../public");
const landingPagePath = join(publicPath, "landing.html");

app.use(express.static(publicPath, { index: false }));

app.get("/", (_req, res) => {
  res.sendFile(landingPagePath);
});

// Serve staff admin SPA (production build)
if (fs.existsSync(distPath)) {
  app.use("/staff", express.static(distPath, { index: false }));
  app.get("/staff/{*splat}", (_req, res) => {
    res.sendFile(join(distPath, "index.html"));
  });
}

// Serve parent portal SPA (production build)
if (fs.existsSync(distParentPath)) {
  app.use("/parents", express.static(distParentPath, { index: false }));
  app.get("/parents/{*splat}", (_req, res) => {
    res.sendFile(join(distParentPath, "index.html"));
  });
}

// Serve teacher portal SPA (production build)
if (fs.existsSync(distTeacherPath)) {
  app.use("/teacher", express.static(distTeacherPath, { index: false }));
  app.get("/teacher/{*splat}", (_req, res) => {
    res.sendFile(join(distTeacherPath, "index.html"));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

export default app;
