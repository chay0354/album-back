/**
 * A4 trim for album PDFs (72 pt = 1 in). Keep in sync with `front/src/albumPageSize.js`
 * and editor aspect-ratio 210/297 in CSS.
 */
const MM_TO_PT = 72 / 25.4;
const A4_W_MM = 210;
const A4_H_MM = 297;

export function albumPageWidthPt() {
  return A4_W_MM * MM_TO_PT;
}

export function albumPageHeightPt() {
  return A4_H_MM * MM_TO_PT;
}

/** For layout (Preview): height/width of one page. */
export function albumPageHeightOverWidth() {
  return A4_H_MM / A4_W_MM;
}
