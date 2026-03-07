/**
 * server.ts
 *
 * Backend entry point. Replaces V1 (server.js).
 * Start: `pnpm run dev`  or  `pnpm run build && pnpm run start`
 */

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import {
  requestIdMiddleware,
  globalErrorHandler,
  notFoundHandler,
} from "./src/core/middleware";
import { logger } from "./src/core/logging";

import { createAuthRouter } from "./src/modules/auth/presentation/authRoutes";
import { createSalesRouter } from "./src/modules/sales/presentation/salesRoutes";
import { createPlantsRouter } from "./src/modules/plants/presentation/plantsRoutes";
import { createWateringRouter } from "./src/modules/watering/presentation/wateringRoutes";
import { createSubstrateRouter } from "./src/modules/substrate/presentation/substrateRoutes";
import { createComponentRouter } from "./src/modules/components/presentation/componentRoutes";
import { createImageRouter } from "./src/modules/images/presentation/imageRoutes";
import { createMoreInfoRouter } from "./src/modules/moreInfo/presentation/moreInfoRoutes";
import { closeBrowser } from "./src/modules/sales/infrastructure/HttpFetcher";

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

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

app.use(`${V}/auth`, createAuthRouter(pool));
app.use(`${V}/sales`, createSalesRouter());
app.use(`${V}/plants`, createPlantsRouter(pool));
app.use(`${V}/watering`, createWateringRouter(pool));
app.use(`${V}/substrates`, createSubstrateRouter(pool));
app.use(`${V}/components`, createComponentRouter(pool));
app.use(`${V}/images`, createImageRouter(pool));
app.use(`${V}/more-info`, createMoreInfoRouter(pool));

app.get(`${V}/health`, async (_req, res) => {
  try {
    await pool.query("SELECT 1");
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
    res.status(503).json({
      status: "error",
      db: "disconnected",
    });
  }
});

app.get(`${V}/health/ready`, async (_req, res) => {
  try {
    await pool.query("SELECT 1");
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
      await pool.end();
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
