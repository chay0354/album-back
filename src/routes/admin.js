import { Router } from "express";
import { supabase } from "../supabase.js";

const adminRoutes = Router();

adminRoutes.get("/pdf-deliveries", async (_, res) => {
  try {
    const { data, error } = await supabase
      .from("pdf_deliveries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export { adminRoutes };
