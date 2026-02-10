import "dotenv/config";
import express from "express";
import cors from "cors";
import { albumRoutes } from "./routes/albums.js";
import { coverRoutes } from "./routes/covers.js";
import { pdfRoutes } from "./routes/pdf.js";
import { adminRoutes } from "./routes/admin.js";

const app = express();
const PORT = process.env.PORT || 3010;

app.use(cors({ origin: process.env.FRONT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.use("/api/albums", albumRoutes);
app.use("/api/covers", coverRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (_, res) => res.json({ ok: true }));

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
