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

function sendLandingPage(res) {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sprouts Valley</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #0f172a; }
      main { text-align: center; padding: 2rem; }
      h1 { margin: 0 0 0.5rem; font-size: 2rem; }
      p { margin: 0 0 2rem; color: #475569; }
      nav { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
      a { display: inline-block; padding: 0.75rem 1.25rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; }
      a.admin { background: #0f172a; color: #f8fafc; }
      a.parents { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; }
      a.teacher { background: #6d28d9; color: #fff; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sprouts Valley</h1>
      <p>School management portal</p>
      <nav>
        <a class="admin" href="/staff/">Admin login</a>
        <a class="teacher" href="/teacher/">Teacher login</a>
        <a class="parents" href="/parents/">Parent login</a>
      </nav>
    </main>
  </body>
</html>`);
}

app.get("/", (_req, res) => {
  sendLandingPage(res);
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
