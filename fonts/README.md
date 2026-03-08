# PDF fonts

- **NotoSansHebrew-Regular.ttf** – Hebrew text (RTL). Loaded from this folder first, then CDN.
- **NotoSansSymbols2-Regular.ttf** – Emoji and symbols. Loaded from this folder or CDN so many Unicode symbols/emoji can render in the PDF.
- **NotoEmoji-Regular.ttf** – Optional; improves emoji coverage if present.

Hebrew is drawn right-to-left by reversing the text when the run is purely Hebrew. Emoji/symbol runs use the symbols (or emoji) font when available.
