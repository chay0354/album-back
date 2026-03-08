import { Router } from "express";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { supabase } from "../supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pdfRoutes = Router();

// Hebrew: use TTF from CDN (pdf-lib has known issues with WOFF Hebrew – shows dots). Latin: WOFF from node_modules or CDN.
const HEBREW_FONT_TTF_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanshebrew/NotoSansHebrew-Regular.ttf";
const FONTS_DIR = path.join(__dirname, "../../node_modules/@fontsource/noto-sans-hebrew/files");
const HEBREW_WOFF_PATH = path.join(FONTS_DIR, "noto-sans-hebrew-hebrew-400-normal.woff");
const LATIN_FONT_PATH = path.join(FONTS_DIR, "noto-sans-hebrew-latin-400-normal.woff");
let hebrewFontBytes = null;
let latinFontBytes = null;

const HEBREW_FONT_FALLBACK_URL = "https://raw.githubusercontent.com/openmaptiles/fonts/master/noto-sans/NotoSansHebrew-Regular.ttf";

// Emoji: Noto Emoji TTF so PDF can render emoji (outline; color may not show in all viewers)
const EMOJI_FONT_URL = "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/fonts/NotoEmoji-Regular.ttf";
const EMOJI_FONT_FALLBACK_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/NotoEmoji-Regular.ttf";
let emojiFontBytes = null;

async function getHebrewFontBytes() {
  if (hebrewFontBytes) return hebrewFontBytes;
  for (const url of [HEBREW_FONT_TTF_URL, HEBREW_FONT_FALLBACK_URL]) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        hebrewFontBytes = new Uint8Array(await res.arrayBuffer());
        return hebrewFontBytes;
      }
    } catch (e) {
      console.warn("[PDF] Hebrew font fetch failed:", url, e.message);
    }
  }
  try {
    hebrewFontBytes = await readFile(HEBREW_WOFF_PATH);
    return hebrewFontBytes;
  } catch (_) {}
  return null;
}

async function getLatinFontBytes() {
  if (latinFontBytes) return latinFontBytes;
  try {
    latinFontBytes = await readFile(LATIN_FONT_PATH);
    return latinFontBytes;
  } catch (_) {}
  return null;
}

async function getEmojiFontBytes() {
  if (emojiFontBytes) return emojiFontBytes;
  for (const url of [EMOJI_FONT_URL, EMOJI_FONT_FALLBACK_URL]) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        emojiFontBytes = new Uint8Array(await res.arrayBuffer());
        return emojiFontBytes;
      }
    } catch (e) {
      console.warn("[PDF] Emoji font fetch failed:", url, e.message);
    }
  }
  return null;
}

function hasHebrew(str) {
  return /[\u0590-\u05FF]/.test(str);
}

/** True if the character (single code point) is emoji/symbol we want to draw with emoji font. */
function isEmojiCodePoint(ch) {
  if (!ch || ch.length === 0) return false;
  const code = ch.codePointAt(0);
  if (code === undefined) return false;
  return (code >= 0x2600 && code <= 0x26ff) || (code >= 0x2700 && code <= 0x27bf) ||
    (code >= 0x1f300 && code <= 0x1f9ff) || (code >= 0x1f600 && code <= 0x1f64f) ||
    (code >= 0x1f1e0 && code <= 0x1f1ff) || (code >= 0xfe00 && code <= 0xfe0f);
}

/** Segment text into runs of emoji vs non-emoji (Hebrew/Latin). Uses Array.from for surrogate pairs. */
function segmentText(text) {
  const runs = [];
  const chars = Array.from(String(text));
  let i = 0;
  while (i < chars.length) {
    const emoji = isEmojiCodePoint(chars[i]);
    const runChars = [chars[i]];
    i++;
    while (i < chars.length && isEmojiCodePoint(chars[i]) === emoji) {
      runChars.push(chars[i]);
      i++;
    }
    runs.push({ text: runChars.join(""), emoji });
  }
  return runs;
}

/** Reverse string for RTL Hebrew so it displays correctly when drawn LTR in PDF. */
function reverseForRtl(str) {
  return Array.from(str).reverse().join("");
}

/**
 * Draw text with correct font per segment (Hebrew/Latin vs emoji) and RTL for Hebrew.
 * Options: { centerX, baselineY, size, color, hebrewFont, latinFont, emojiFont }.
 * Fonts can be null; fallback to first available.
 */
function drawSegmentedText(page, content, opts) {
  const { centerX, baselineY, size, color, hebrewFont, latinFont, emojiFont } = opts;
  const mainFont = hebrewFont || latinFont;
  if (!mainFont || !content.trim()) return;
  const runs = segmentText(content);
  let totalWidth = 0;
  const drawInfos = [];
  for (const run of runs) {
    let text = run.text;
    let font = run.emoji ? (emojiFont || mainFont) : (hasHebrew(text) ? (hebrewFont || mainFont) : (latinFont || mainFont));
    if (!run.emoji && hasHebrew(text)) text = reverseForRtl(text);
    const w = font.widthOfTextAtSize(text, size);
    totalWidth += w;
    drawInfos.push({ text, font, width: w });
  }
  let x = centerX - totalWidth / 2;
  for (const { text, font, width } of drawInfos) {
    if (text) {
      try {
        page.drawText(text, { x, y: baselineY, size, font, color });
      } catch (e) {
        console.warn("[PDF] drawText segment failed (missing glyph?):", e.message);
      }
    }
    x += width;
  }
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
      let hebrewFontEmbed = null;
      let latinFontEmbed = null;
      let emojiFontEmbed = null;
      try {
        hebrewFontEmbed = await doc.embedFont(await getHebrewFontBytes());
      } catch (e) {
        console.warn("[PDF] Hebrew font load failed:", e.message);
      }
      try {
        latinFontEmbed = await doc.embedFont(await getLatinFontBytes());
      } catch (e) {
        console.warn("[PDF] Latin font load failed:", e.message);
      }
      try {
        const emojiBytes = await getEmojiFontBytes();
        if (emojiBytes) emojiFontEmbed = await doc.embedFont(emojiBytes);
      } catch (e) {
        console.warn("[PDF] Emoji font load failed:", e.message);
      }
      const font = hebrewFontEmbed || latinFontEmbed;
      if (font) {
        const { x: cx, y: cy, w: cw, h: ch } = coverImgBounds;
        for (const t of textsToDraw) {
          const content = (t.content || "").trim();
          if (!content) continue;
          const xPct = typeof t.x === "number" ? t.x : 50;
          const yPct = typeof t.y === "number" ? t.y : 18;
          const fontSize = typeof t.fontSize === "number" ? t.fontSize : 28;
          const halfImgW = cw / 2;
          const xCenter = cx + (xPct / 100) * halfImgW;
          const centerY = cy + ch - (yPct / 100) * ch;
          const baselineY = centerY - fontSize * 0.35;
          drawSegmentedText(coverPdfPage, content, {
            centerX: xCenter,
            baselineY,
            size: fontSize,
            color: hexToRgb(t.color || "#ffffff"),
            hebrewFont: hebrewFontEmbed,
            latinFont: latinFontEmbed,
            emojiFont: emojiFontEmbed,
          });
        }
      }
    }

    const baseUrl = supabase.storage.from("album-photos").getPublicUrl("").data.publicUrl.replace(/\/$/, "");
    let hebrewFontEmbed = null;
    let latinFontEmbed = null;
    let emojiFontEmbed = null;
    try {
      hebrewFontEmbed = await doc.embedFont(await getHebrewFontBytes());
    } catch (_) {}
    try {
      latinFontEmbed = await doc.embedFont(await getLatinFontBytes());
    } catch (_) {}
    try {
      const emojiBytes = await getEmojiFontBytes();
      if (emojiBytes) emojiFontEmbed = await doc.embedFont(emojiBytes);
    } catch (_) {}
    const textFont = hebrewFontEmbed || latinFontEmbed;

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
      if (textFont && pageTexts.length > 0) {
        for (const t of pageTexts) {
          const content = (t.content || "").trim();
          if (!content) continue;
          const xPct = typeof t.x === "number" ? t.x : 50;
          const yPct = typeof t.y === "number" ? t.y : 25;
          const designFontSize = typeof t.fontSize === "number" ? t.fontSize : 28;
          const fontSize = Math.round(designFontSize * PDF_TEXT_SCALE);
          const centerX = (xPct / 100) * pdfW;
          const centerY = pdfH - (yPct / 100) * pdfH;
          const baselineY = centerY - fontSize * 0.35;
          drawSegmentedText(pdfPage, content, {
            centerX,
            baselineY,
            size: fontSize,
            color: hexToRgb(t.color || "#000000"),
            hebrewFont: hebrewFontEmbed,
            latinFont: latinFontEmbed,
            emojiFont: emojiFontEmbed,
          });
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
