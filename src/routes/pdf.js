import { Router } from "express";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { supabase } from "../supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pdfRoutes = Router();

// Hebrew-capable font from @fontsource/noto-sans-hebrew (cached)
const HEBREW_FONT_PATH = path.join(__dirname, "../../node_modules/@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-400-normal.woff");
let hebrewFontBytes = null;

async function getHebrewFontBytes() {
  if (hebrewFontBytes) return hebrewFontBytes;
  hebrewFontBytes = await readFile(HEBREW_FONT_PATH);
  return hebrewFontBytes;
}

async function getImageBytes(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

pdfRoutes.get("/generate/:albumId", async (req, res) => {
  const { albumId } = req.params;
  console.log("[PDF] generate requested, albumId:", albumId);
  try {
    const { data: album, error: albumError } = await supabase
      .from("albums")
      .select("*")
      .eq("id", albumId)
      .single();
    if (albumError || !album) return res.status(404).json({ error: "Album not found" });

    const { data: pages } = await supabase
      .from("album_pages")
      .select("*, album_photos(*)")
      .eq("album_id", albumId)
      .order("page_order");

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const pdfW = 595;
    const pdfH = 842;
    const coverConfig = album.cover_config || {};
    let coverImageUrl = null;
    if (album.cover_id) {
      const { data: cover } = await supabase.from("base_covers").select("storage_path").eq("id", album.cover_id).single();
      if (cover) coverImageUrl = supabase.storage.from("covers").getPublicUrl(cover.storage_path).data.publicUrl;
    } else if (coverConfig.coverUrl) {
      coverImageUrl = coverConfig.coverUrl;
    }

    // Cover page: center the cover image as-is (preserve aspect ratio, fit on page)
    const coverPdfPage = doc.addPage([595, 842]);
    if (coverImageUrl) {
      try {
        const imgBytes = await getImageBytes(coverImageUrl);
        if (imgBytes) {
          const img = await doc.embedJpg(imgBytes).catch(() => doc.embedPng(imgBytes));
          const pageW = 595;
          const pageH = 842;
          const scale = Math.min(pageW / img.width, pageH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = (pageW - drawW) / 2;
          const drawY = (pageH - drawH) / 2;
          coverPdfPage.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
        }
      } catch (_) {}
    }
    function hexToRgb(hex) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return rgb(1, 1, 1);
      return rgb(
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255
      );
    }
    const textsToDraw = Array.isArray(coverConfig.texts) && coverConfig.texts.length > 0
      ? coverConfig.texts
      : coverConfig.headerText
        ? [{
            content: coverConfig.headerText,
            x: typeof coverConfig.headerX === "number" ? coverConfig.headerX : 50,
            y: typeof coverConfig.headerY === "number" ? coverConfig.headerY : 18,
            fontSize: typeof coverConfig.headerFontSize === "number" ? coverConfig.headerFontSize : 28,
            color: "#ffffff",
          }]
        : [];
    if (textsToDraw.length > 0) {
      let font;
      try {
        const fontBytes = await getHebrewFontBytes();
        font = await doc.embedFont(fontBytes);
      } catch (fontErr) {
        console.warn("[PDF] Hebrew font load failed, skipping cover text:", fontErr.message);
      }
      if (font) {
        for (const t of textsToDraw) {
          const content = (t.content || "").trim();
          if (!content) continue;
          const xPct = typeof t.x === "number" ? t.x : 50;
          const yPct = typeof t.y === "number" ? t.y : 18;
          const fontSize = typeof t.fontSize === "number" ? t.fontSize : 28;
          const x = (xPct / 100) * pdfW;
          const y = pdfH - (yPct / 100) * pdfH;
          const textWidth = font.widthOfTextAtSize(content, fontSize);
          coverPdfPage.drawText(content, {
            x: x - textWidth / 2,
            y,
            size: fontSize,
            font,
            color: hexToRgb(t.color || "#ffffff"),
          });
        }
      }
    }

    const baseUrl = supabase.storage.from("album-photos").getPublicUrl("").data.publicUrl.replace(/\/$/, "");
    for (const p of pages || []) {
      const photos = (p.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
      if (photos.length === 0) continue;
      const pdfPage = doc.addPage([pdfW, pdfH]);
      const pageConfig = p.page_config || {};
      const bgHex = pageConfig.backgroundColor;
      if (bgHex && /^#[0-9A-Fa-f]{6}$/.test(bgHex)) {
        pdfPage.drawRectangle({
          x: 0,
          y: 0,
          width: pdfW,
          height: pdfH,
          color: hexToRgb(bgHex),
        });
      }
      for (let i = 0; i < photos.length; i++) {
        const ph = photos[i];
        const layout = ph.layout && typeof ph.layout.x === "number" ? ph.layout : null;
        const xPct = layout ? layout.x : (i % 2) * 48 + 2;
        const yPct = layout ? layout.y : Math.floor(i / 2) * 48 + 2;
        const wPct = layout && layout.w != null ? layout.w : 46;
        const hPct = layout && layout.h != null ? layout.h : 46;
        const x = (xPct / 100) * pdfW;
        const y = pdfH - (yPct / 100) * pdfH - (hPct / 100) * pdfH;
        const w = (wPct / 100) * pdfW;
        const h = (hPct / 100) * pdfH;
        const url = ph.storage_path.startsWith("http") ? ph.storage_path : `${baseUrl}/${ph.storage_path}`;
        try {
          const imgBytes = await getImageBytes(url);
          if (!imgBytes) continue;
          const img = await doc.embedJpg(imgBytes).catch(() => doc.embedPng(imgBytes));
          // Fit image inside the box preserving aspect ratio (like object-fit: contain)
          const scale = Math.min(w / img.width, h / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = x + (w - drawW) / 2;
          const drawY = y + (h - drawH) / 2;
          pdfPage.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
        } catch (_) {}
      }
    }

    const pdfBytes = await doc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // Save PDF to storage and record (pdf, mail) in DB
    const mail = coverConfig.userEmail || "";
    const storagePath = `${albumId}/${Date.now()}.pdf`;
    console.log("[PDF] cover_config.userEmail:", coverConfig.userEmail, "-> mail:", mail);
    console.log("[PDF] attempting upload to bucket 'pdfs', path:", storagePath);
    try {
      const { error: uploadErr } = await supabase.storage
        .from("pdfs")
        .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: false });
      if (uploadErr) {
        console.error("[PDF] storage upload failed:", uploadErr.message, uploadErr);
      } else {
        console.log("[PDF] storage upload OK");
        const { data: urlData } = supabase.storage.from("pdfs").getPublicUrl(storagePath);
        const pdfUrl = urlData?.publicUrl || storagePath;
        console.log("[PDF] inserting pdf_deliveries: pdf=", pdfUrl.substring(0, 60) + "...", "mail=", mail);
        const { error: insertErr } = await supabase.from("pdf_deliveries").insert({ pdf: pdfUrl, mail });
        if (insertErr) {
          console.error("[PDF] pdf_deliveries insert failed:", insertErr.message, insertErr);
        } else {
          console.log("[PDF] pdf_deliveries insert OK");
        }
      }
    } catch (err) {
      console.error("[PDF] save (upload or insert) failed:", err);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="album.pdf"');
    res.send(pdfBuffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export { pdfRoutes };
