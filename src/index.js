import "dotenv/config";
import express from "express";
import cors from "cors";
import { albumRoutes } from "./routes/albums.js";
import { coverRoutes } from "./routes/covers.js";
import { pdfRoutes } from "./routes/pdf.js";
import { adminRoutes } from "./routes/admin.js";

const app = express();
const PORT = process.env.PORT || 3010;

// Reflect any browser Origin (production + previews). Server must not crash — missing CORS on 500 is often a symptom.
app.use(
  cors({
    origin: true,
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
