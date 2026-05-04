import "dotenv/config";
import express from "express";
import cors from "cors";
import { albumRoutes } from "./routes/albums.js";
import { coverRoutes } from "./routes/covers.js";
import { pdfRoutes } from "./routes/pdf.js";
import { adminRoutes } from "./routes/admin.js";

const app = express();
const PORT = process.env.PORT || 3010;

/** Strip trailing slashes so env matches browser Origin exactly (common Vercel misconfig). */
function normalizeOrigin(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

/**
 * CORS: ALLOWED_ORIGINS or FRONT_URL, comma-separated (e.g. prod + preview).
 * If unset, any origin is reflected (dev / single-deploy). With credentials: true, origin must be explicit or permissive.
 */
function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || process.env.FRONT_URL || "";
  return raw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function createCorsOrigin() {
  const list = parseAllowedOrigins();
  if (list.length === 0) return true;
  return (origin, callback) => {
    if (!origin) return callback(null, true);
    callback(null, list.includes(normalizeOrigin(origin)));
  };
}

app.use(
  cors({
    origin: createCorsOrigin(),
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/", (_, res) => res.json({ name: "Album API", health: "/api/health" }));

app.use("/api/albums", albumRoutes);
app.use("/api/covers", coverRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (_, res) => res.json({ ok: true }));

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
