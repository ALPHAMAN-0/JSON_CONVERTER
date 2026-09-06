---
tags: [component, JSON_CONVERTER]
---
- Path: src/lib/convertController.ts
- Role: Runs conversions over file nodes (`runConversions`), dispatching per-file state patches back to `App`
- Talks to: [[App]], [[PdfConverter]], [[ImageConverter]], [[ResultBuilder]]
- Back: [[ARCHITECTURE]]
