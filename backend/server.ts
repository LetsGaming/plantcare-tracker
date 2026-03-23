/**
 * server.ts
 *
 * Backend entry point — SQLite edition.
 * Replaces the mysql2 pool with the better-sqlite3 singleton from src/core/database/db.ts.
 *
 * Start: `pnpm run dev`  or  `pnpm run build && pnpm run start`
 */

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Open (and initialise) the SQLite database before anything else imports it.
import { getDb, closeDb } from "./src/core/database/db";
const db = getDb(); // singleton — schema auto-applied on first run

import {
  requestIdMiddleware,
  globalErrorHandler,
  notFoundHandler,
} from "./src/core/middleware";
import { logger } from "./src/core/logging";

import { createAuthRouter }      from "./src/modules/auth/presentation/authRoutes";
import { createSalesRouter }     from "./src/modules/sales/presentation/salesRoutes";
import { createPlantsRouter }    from "./src/modules/plants/presentation/plantsRoutes";
import { createWateringRouter }  from "./src/modules/watering/presentation/wateringRoutes";
import { createSubstrateRouter } from "./src/modules/substrate/presentation/substrateRoutes";
import { createComponentRouter } from "./src/modules/components/presentation/componentRoutes";
import { createImageRouter }     from "./src/modules/images/presentation/imageRoutes";
import { createMoreInfoRouter }  from "./src/modules/moreInfo/presentation/moreInfoRoutes";
import { closeBrowser }          from "./src/modules/sales/infrastructure/HttpFetcher";

const app = express();
const PORT = Number(process.env.PORT ?? 5000);
const isDev = process.env.NODE_ENV !== "production";

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, cb) => {
      const isLocalhost =
        isDev && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? "");
      if (!origin || isLocalhost || allowedOrigins.includes(origin))
        cb(null, true);
      else cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use(requestIdMiddleware);

const uploadDir = process.env.NAS_PATH
  ? path.resolve(process.env.NAS_PATH)
  : path.resolve(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadDir));

// get version for /api/vX prefix from env or package.json ("versionPath" field)
function getVersionPath(): string {
  if (process.env.API_VERSION_PATH) return process.env.API_VERSION_PATH;
  try {
    const raw = fs.readFileSync(
      path.resolve(process.cwd(), "package.json"),
      "utf-8",
    );
    const pkg = JSON.parse(raw) as { versionPath?: string };
    return pkg.versionPath ?? "v2";
  } catch {
    return "v2";
  }
}
const versionPath = getVersionPath();
const V = `/api/${versionPath}`;

// Routes — no pool argument needed; repositories use the db singleton
app.use(`${V}/auth`,       createAuthRouter());
app.use(`${V}/sales`,      createSalesRouter());
app.use(`${V}/plants`,     createPlantsRouter());
app.use(`${V}/watering`,   createWateringRouter());
app.use(`${V}/substrates`, createSubstrateRouter());
app.use(`${V}/components`, createComponentRouter());
app.use(`${V}/images`,     createImageRouter());
app.use(`${V}/more-info`,  createMoreInfoRouter());

app.get(`${V}/health`, (_req, res) => {
  try {
    // Synchronous ping — better-sqlite3 throws immediately if the DB is closed
    db.prepare("SELECT 1").get();
    const uptimeSeconds = process.uptime();
    const d = Math.floor(uptimeSeconds / 86400);
    const h = Math.floor((uptimeSeconds % 86400) / 3600);
    const m = Math.floor((uptimeSeconds % 3600) / 60);
    const s = Math.floor(uptimeSeconds % 60);

    res.json({
      status: "ok",
      uptime: `${d}d ${h}h ${m}m ${s}s`,
      uptime_s: Math.floor(uptimeSeconds),
      db: "connected",
      version: versionPath,
    });
  } catch (err) {
    logger.error("Health check failed", { err });
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.get(`${V}/health/ready`, (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

const server = app.listen(PORT, () => {
  logger.info(`V2 server running on port ${PORT}`);
});

const handleShutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} — shutting down gracefully...`);
  server.close(async () => {
    try {
      await closeBrowser();
      closeDb();          // flushes WAL checkpoint and closes the SQLite file
      logger.info("Shutdown complete.");
    } catch (err) {
      logger.error("Error during shutdown", { err });
    }
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
