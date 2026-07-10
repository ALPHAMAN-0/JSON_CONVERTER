# JSON Converter

Convert **PDFs and images into well-structured JSON** — entirely in your browser. Drop a single file or a whole folder: folders become a file tree and every convertible file inside is converted in place.

**Live app:** https://alphaman-0.github.io/JSON_CONVERTER/

## Features

- **PDF → JSON** via the PDF text layer ([pdf.js](https://mozilla.github.io/pdf.js/)), preserving reading order and positions
- **Image → JSON** via OCR ([Tesseract.js](https://tesseract.projectnaptha.com/)) — PNG, JPG, WEBP, BMP, GIF, AVIF
- **Scanned-PDF fallback** — pages with no text layer are rendered and OCR'd automatically
- **Structure detection** — headings (with levels), paragraphs (de-hyphenated and unwrapped), list items, `Key: value` pairs, and tables reconstructed from aligned columns
- **Folder upload** — drag a folder (or pick one) to get a collapsible tree; each file converts to its own JSON, plus a combined `workspace.json` export that mirrors the tree
- **100% client-side** — no server, no upload; files never leave your machine

## Output shape

```jsonc
{
  "converter": { "name": "json-converter", "version": "1.0.0" },
  "source": { "fileName": "invoice.pdf", "kind": "pdf", "mimeType": "application/pdf", "sizeBytes": 12345, "lastModified": "…" },
  "convertedAt": "2026-07-10T…",
  "document": {
    "pageCount": 2,
    "metadata": { "Title": "…", "Author": "…" },
    "pages": [
      {
        "pageNumber": 1,
        "width": 612, "height": 792,
        "extractionMethod": "text-layer", // or "ocr"
        "blocks": [
          { "id": "b1", "type": "heading", "level": 1, "text": "Invoice Summary", "bbox": { "x": 72, "y": 48, "width": 210, "height": 24 } },
          { "id": "b2", "type": "key-value", "key": "Customer", "value": "John Doe", "text": "Customer: John Doe", "bbox": { } },
          { "id": "b3", "type": "table", "columnCount": 3, "rows": [["Item", "Qty", "Price"]], "text": "…", "bbox": { } },
          { "id": "b4", "type": "paragraph", "text": "…", "bbox": { } }
        ]
      }
    ],
    "fullText": "…"
  },
  "stats": { "blocks": 12, "words": 340, "characters": 2100, "headings": 3, "paragraphs": 6, "listItems": 0, "keyValues": 2, "tables": 1 }
}
```

OCR-extracted blocks additionally carry a `confidence` score (0–100).

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173/JSON_CONVERTER/
npm test           # unit tests (vitest)
npm run build      # typecheck + production build to dist/
```

## Deployment (GitHub Pages)

Deployment is automated by [.github/workflows/deploy.yml](.github/workflows/deploy.yml): every push to `main` runs tests, builds, and publishes to GitHub Pages.

One-time setup: in the repository **Settings → Pages**, set **Source** to **GitHub Actions**.

## Stack

Vite · React · TypeScript · pdf.js · Tesseract.js — no backend.
