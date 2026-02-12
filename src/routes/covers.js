import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabase.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const coverRoutes = Router();

/** List all file paths in a storage bucket (root + one level of subfolders) */
async function listBucketPaths(bucketName) {
  const paths = [];
  const { data: root, error: rootErr } = await supabase.storage.from(bucketName).list("", { limit: 500 });
  if (rootErr) throw rootErr;
  for (const item of root || []) {
    if (item.name?.includes(".")) {
      paths.push(item.name);
    } else {
      const { data: sub } = await supabase.storage.from(bucketName).list(item.name, { limit: 500 });
      for (const f of sub || []) {
        if (f.name?.includes(".")) paths.push(`${item.name}/${f.name}`);
      }
    }
  }
  return paths;
}

async function listCoversBucket() {
  return listBucketPaths("covers");
}

coverRoutes.get("/list", async (_, res) => {
  try {
    const paths = await listCoversBucket();
    res.json(paths.map((path) => ({ path })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** List all file paths in the "premade-covers" bucket */
coverRoutes.get("/premade", async (_, res) => {
  try {
    const paths = await listBucketPaths("premade-covers");
    res.json(paths.map((path) => ({ path })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** List all file paths in the "elements" bucket (stickers/decorations for pages) */
coverRoutes.get("/elements", async (_, res) => {
  try {
    const paths = await listBucketPaths("elements");
    res.json(paths.map((path) => ({ path })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

coverRoutes.get("/base", async (_, res) => {
  try {
    const { data, error } = await supabase.from("base_covers").select("*").order("created_at");
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

coverRoutes.post("/base", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const ext = req.file.originalname.split(".").pop() || "jpg";
    const path = `base/${uuidv4()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("covers").upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from("covers").getPublicUrl(path);
    const { data: row, error: insertError } = await supabase
      .from("base_covers")
      .insert({ name: req.file.originalname, storage_path: path })
      .select()
      .single();
    if (insertError) throw insertError;
    res.status(201).json({ ...row, url: urlData.publicUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

coverRoutes.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const ext = req.file.originalname.split(".").pop() || "jpg";
    const path = `custom/${uuidv4()}.${ext}`;
    const { error } = await supabase.storage.from("covers").upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("covers").getPublicUrl(path);
    res.status(201).json({ path, url: data.publicUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
