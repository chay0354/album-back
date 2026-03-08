import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas, registerFont } from "canvas";
import { PDFDocument, rgb } from "pdf-lib";
import { supabase } from "../supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pdfRoutes = Router();

/**
 * Render text as PNG (Hebrew + emoji supported). Segments into text vs emoji runs;
 * draws each run with the right font. Returns { pngBuffer, widthPt, heightPt }.
 */
async function renderTextToPng(content, opts = {}) {
  const fontSizePt = typeof opts.fontSize === "number" ? opts.fontSize : 28;
  const color = opts.color || "#000000";
  const scale = 2;
  const fontSizePx = fontSizePt * scale;
  const padding = fontSizePx * 0.5;
  const textHeightPx = fontSizePx * 1.3;

  const runs = segmentText(content);
  const measureCtx = createCanvas(1, 1).getContext("2d");
  let totalWidthPx = 0;
  const runInfos = [];

  for (const run of runs) {
    const font = run.emoji ? EMOJI_FONT : TEXT_FONT;
    measureCtx.font = `${fontSizePx}px ${font}`;
    measureCtx.direction = !run.emoji && hasHebrew(run.text) ? "rtl" : "ltr";
    const w = measureCtx.measureText(run.text).width;
    totalWidthPx += w;
    runInfos.push({ text: run.text, emoji: run.emoji, widthPx: w });
  }

  const w = Math.ceil(totalWidthPx + padding * 2);
  const h = Math.ceil(textHeightPx + padding * 2);
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.font = `${fontSizePx}px ${TEXT_FONT}`;

  let x = padding;
  const y = h / 2;
  for (const run of runInfos) {
    const font = run.emoji ? EMOJI_FONT : TEXT_FONT;
    ctx.font = `${fontSizePx}px ${font}`;
    ctx.direction = !run.emoji && hasHebrew(run.text) ? "rtl" : "ltr";
    ctx.textAlign = "left";
    ctx.fillText(run.text, x, y);
    x += run.widthPx;
  }

  const pngBuffer = c.toBuffer("image/png");
  const widthPt = totalWidthPx / scale;
  const heightPt = textHeightPx / scale;
  return { pngBuffer, widthPt, heightPt };
}

const HEBREW_FONT_LOCAL = path.join(__dirname, "../../fonts/NotoSansHebrew-Regular.ttf");
const SYMBOLS_FONT_LOCAL = path.join(__dirname, "../../fonts/NotoSansSymbols2-Regular.ttf");
try {
  registerFont(HEBREW_FONT_LOCAL, { family: "Noto Sans Hebrew" });
} catch (_) {}
try {
  registerFont(SYMBOLS_FONT_LOCAL, { family: "Noto Sans Symbols 2" });
} catch (_) {}

const TEXT_FONT = '"Noto Sans Hebrew", sans-serif';
const EMOJI_FONT = '"Noto Sans Symbols 2", sans-serif';

function hasHebrew(str) {
  return /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF]/.test(str);
}

function isEmojiOrSymbol(ch) {
  if (!ch || ch.length === 0) return false;
  const code = (typeof ch === "string" ? ch : ch[0]).codePointAt(0);
  if (code == null) return false;
  return (code >= 0x2600 && code <= 0x26ff) || (code >= 0x2700 && code <= 0x27bf) ||
    (code >= 0x1f300 && code <= 0x1f9ff) || (code >= 0x1f600 && code <= 0x1f64f) ||
    (code >= 0x1f1e0 && code <= 0x1f1ff) || (code >= 0xfe00 && code <= 0xfe0f);
}

function segmentText(text) {
  const runs = [];
  const chars = Array.from(String(text));
  let i = 0;
  while (i < chars.length) {
    const emoji = isEmojiOrSymbol(chars[i]);
    const runChars = [chars[i]];
    i++;
    while (i < chars.length && isEmojiOrSymbol(chars[i]) === emoji) {
      runChars.push(chars[i]);
      i++;
    }
    runs.push({ text: runChars.join(""), emoji });
  }
  return runs;
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
    const pdfW = 595;
    const pdfH = 842;
    const EDITOR_PAGE_WIDTH = 420;
    const PDF_TEXT_SCALE = pdfW / EDITOR_PAGE_WIDTH;
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
    let coverImgBounds = { x: 0, y: 0, w: pdfW, h: pdfH };
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
          coverImgBounds = { x: drawX, y: drawY, w: drawW, h: drawH };
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
      const { x: cx, y: cy, w: cw, h: ch } = coverImgBounds;
      for (const t of textsToDraw) {
        const content = (t.content || "").trim();
        if (!content) continue;
        try {
          const { pngBuffer, widthPt, heightPt } = await renderTextToPng(content, {
            fontSize: typeof t.fontSize === "number" ? t.fontSize : 28,
            color: t.color || "#ffffff",
          });
          const xPct = typeof t.x === "number" ? t.x : 50;
          const yPct = typeof t.y === "number" ? t.y : 18;
          const fontSize = typeof t.fontSize === "number" ? t.fontSize : 28;
          const halfImgW = cw / 2;
          const xCenter = cx + (xPct / 100) * halfImgW;
          const centerY = cy + ch - (yPct / 100) * ch;
          const img = await doc.embedPng(pngBuffer);
          coverPdfPage.drawImage(img, {
            x: xCenter - widthPt / 2,
            y: centerY - heightPt / 2,
            width: widthPt,
            height: heightPt,
          });
        } catch (e) {
          console.warn("[PDF] Cover text PNG failed:", e.message);
        }
      }
    }

    const baseUrl = supabase.storage.from("album-photos").getPublicUrl("").data.publicUrl.replace(/\/$/, "");

    for (const p of pages || []) {
      const photos = (p.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
      const pageConfig = p.page_config || {};
      const pageTexts = Array.isArray(pageConfig.texts) ? pageConfig.texts : [];
      if (photos.length === 0 && pageTexts.length === 0) continue;
      const pdfPage = doc.addPage([pdfW, pdfH]);
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
          const scale = Math.min(w / img.width, h / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = x + (w - drawW) / 2;
          const drawY = y + (h - drawH) / 2;
          pdfPage.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
        } catch (_) {}
      }
      if (pageTexts.length > 0) {
        for (const t of pageTexts) {
          const content = (t.content || "").trim();
          if (!content) continue;
          try {
            const designFontSize = typeof t.fontSize === "number" ? t.fontSize : 28;
            const fontSize = Math.round(designFontSize * PDF_TEXT_SCALE);
            const { pngBuffer, widthPt, heightPt } = await renderTextToPng(content, {
              fontSize,
              color: t.color || "#000000",
            });
            const xPct = typeof t.x === "number" ? t.x : 50;
            const yPct = typeof t.y === "number" ? t.y : 25;
            const centerX = (xPct / 100) * pdfW;
            const centerY = pdfH - (yPct / 100) * pdfH;
            const img = await doc.embedPng(pngBuffer);
            pdfPage.drawImage(img, {
              x: centerX - widthPt / 2,
              y: centerY - heightPt / 2,
              width: widthPt,
              height: heightPt,
            });
          } catch (e) {
            console.warn("[PDF] Page text PNG failed:", e.message);
          }
        }
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
