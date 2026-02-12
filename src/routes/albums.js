import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabase.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
export const albumRoutes = Router();

albumRoutes.get("/", async (_, res) => {
  try {
    const { data, error } = await supabase
      .from("albums")
      .select("*, album_pages(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: album, error: albumError } = await supabase
      .from("albums")
      .select("*")
      .eq("id", id)
      .single();
    if (albumError || !album) {
      return res.status(404).json({ error: "Album not found" });
    }
    const { data: pages } = await supabase
      .from("album_pages")
      .select("*, album_photos(*)")
      .eq("album_id", id)
      .order("page_order");
    res.json({ ...album, pages: pages || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.post("/", async (req, res) => {
  try {
    const { title, cover_id, cover_config } = req.body;
    const { data: album, error: albumError } = await supabase
      .from("albums")
      .insert({ title: title || "אלבום חדש", cover_id: cover_id || null, cover_config: cover_config || {} })
      .select()
      .single();
    if (albumError) throw albumError;
    // Create first empty page
    await supabase.from("album_pages").insert({ album_id: album.id, page_order: 0 });
    const { data: pages } = await supabase
      .from("album_pages")
      .select("*, album_photos(*)")
      .eq("album_id", album.id)
      .order("page_order");
    res.status(201).json({ ...album, pages: pages || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, cover_id, cover_config } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (cover_id !== undefined) updates.cover_id = cover_id;
    if (cover_config !== undefined) updates.cover_config = cover_config;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("albums").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("albums").delete().eq("id", id);
    if (error) throw error;
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pages
albumRoutes.post("/:albumId/pages", async (req, res) => {
  try {
    const { albumId } = req.params;
    const { data: max } = await supabase
      .from("album_pages")
      .select("page_order")
      .eq("album_id", albumId)
      .order("page_order", { ascending: false })
      .limit(1)
      .single();
    const order = (max?.page_order ?? -1) + 1;
    const { data, error } = await supabase
      .from("album_pages")
      .insert({ album_id: albumId, page_order: order })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.delete("/:albumId/pages/:pageId", async (req, res) => {
  try {
    const { albumId, pageId } = req.params;
    const { data: page } = await supabase.from("album_pages").select("id").eq("id", pageId).eq("album_id", albumId).single();
    if (!page) return res.status(404).json({ error: "Page not found" });
    const { error } = await supabase.from("album_pages").delete().eq("id", pageId);
    if (error) throw error;
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.patch("/:albumId/pages/:pageId", async (req, res) => {
  try {
    const { albumId, pageId } = req.params;
    const { page_config } = req.body;
    const { data: page } = await supabase.from("album_pages").select("id").eq("id", pageId).eq("album_id", albumId).single();
    if (!page) return res.status(404).json({ error: "Page not found" });
    const updates = {};
    if (page_config !== undefined) updates.page_config = page_config;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No updates" });
    const { data, error } = await supabase.from("album_pages").update(updates).eq("id", pageId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Photos on a page
albumRoutes.post("/:albumId/pages/:pageId/photos", async (req, res) => {
  try {
    const { pageId } = req.params;
    const { storage_path, photo_order } = req.body;
    const { data: max } = await supabase
      .from("album_photos")
      .select("photo_order")
      .eq("page_id", pageId)
      .order("photo_order", { ascending: false })
      .limit(1)
      .single();
    const order = photo_order ?? (max?.photo_order ?? -1) + 1;
    const { data, error } = await supabase
      .from("album_photos")
      .insert({ page_id: pageId, storage_path, photo_order: order })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.patch("/:albumId/pages/:pageId/photos/reorder", async (req, res) => {
  try {
    const { pageId } = req.params;
    const { photo_ids } = req.body; // array of id in order
    for (let i = 0; i < photo_ids.length; i++) {
      await supabase.from("album_photos").update({ photo_order: i }).eq("id", photo_ids[i]).eq("page_id", pageId);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.delete("/:albumId/pages/:pageId/photos/:photoId", async (req, res) => {
  try {
    const { photoId } = req.params;
    const { error } = await supabase.from("album_photos").delete().eq("id", photoId);
    if (error) throw error;
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.patch("/:albumId/photos/:photoId/move", async (req, res) => {
  try {
    const { albumId, photoId } = req.params;
    const { page_id, photo_order } = req.body;
    if (!page_id) return res.status(400).json({ error: "page_id required" });
    const { data: page } = await supabase.from("album_pages").select("id").eq("id", page_id).eq("album_id", albumId).single();
    if (!page) return res.status(400).json({ error: "Page not found" });
    let order = typeof photo_order === "number" ? photo_order : null;
    if (order === null) {
      const { data: max } = await supabase.from("album_photos").select("photo_order").eq("page_id", page_id).order("photo_order", { ascending: false }).limit(1).single();
      order = (max?.photo_order ?? -1) + 1;
    }
    const { data, error } = await supabase.from("album_photos").update({ page_id, photo_order: order }).eq("id", photoId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.patch("/:albumId/photos/:photoId/layout", async (req, res) => {
  try {
    const { albumId, photoId } = req.params;
    const { layout } = req.body;
    const updates = {};
    if (layout !== undefined) updates.layout = layout;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "layout required" });
    const { data: photo } = await supabase.from("album_photos").select("id, page_id").eq("id", photoId).single();
    if (!photo) return res.status(404).json({ error: "Photo not found" });
    const { data: page } = await supabase.from("album_pages").select("id").eq("id", photo.page_id).eq("album_id", albumId).single();
    if (!page) return res.status(404).json({ error: "Page not found" });
    const { data, error } = await supabase.from("album_photos").update(updates).eq("id", photoId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

albumRoutes.post("/:albumId/pages/:pageId/upload", upload.array("photos", 50), async (req, res) => {
  try {
    const { albumId, pageId } = req.params;
    const files = req.files || [];
    const inserted = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.originalname.split(".").pop() || "jpg";
      const path = `${albumId}/${pageId}/${uuidv4()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("album-photos").upload(path, f.buffer, {
        contentType: f.mimetype,
        upsert: true,
      });
      if (upErr) continue;
      const { data: max } = await supabase.from("album_photos").select("photo_order").eq("page_id", pageId).order("photo_order", { ascending: false }).limit(1).single();
      const order = (max?.photo_order ?? -1) + 1 + i;
      const { data: row, error } = await supabase.from("album_photos").insert({ page_id: pageId, storage_path: path, photo_order: order }).select().single();
      if (!error && row) inserted.push(row);
    }
    res.status(201).json(inserted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
