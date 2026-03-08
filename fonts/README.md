# PDF fonts

For Hebrew and emoji to appear correctly in generated PDFs, the server tries to load fonts in this order:

1. **Local TTF (recommended if CDN fails)**  
   Place `NotoSansHebrew-Regular.ttf` in this folder.  
   Download from: [Google Fonts – Noto Sans Hebrew](https://fonts.google.com/noto/specimen/Noto+Sans+Hebrew) (use “Download family”, then take the TTF from the zip), or from [notofonts/noto-sans-hebrew](https://github.com/notofonts/noto-sans-hebrew) (`instance_ttf/NotoSansHebrew-Regular.ttf`).

2. **CDN** – The server then tries several public URLs for the same font.

3. **node_modules** – It falls back to the WOFF from `@fontsource/noto-sans-hebrew` (Hebrew may render with dots in some viewers).

If Hebrew still doesn’t show in the PDF, add the TTF file here and restart the server.
