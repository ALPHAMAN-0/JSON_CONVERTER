import type { ConversionResult, ConversionStats, PageResult } from '../types'

export const CONVERTER_NAME = 'json-converter'
export const CONVERTER_VERSION = '1.0.0'

export function buildResult(
  file: File,
  kind: 'pdf' | 'image',
  pages: PageResult[],
  metadata?: Record<string, string>,
): ConversionResult {
  const fullText = pages
    .flatMap((p) => p.blocks.map((b) => b.text))
    .join('\n\n')

  const stats: ConversionStats = {
    blocks: 0,
    // Only count tokens with a letter or digit — not "|" table separators.
    words: fullText.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length,
    characters: fullText.length,
    headings: 0,
    paragraphs: 0,
    listItems: 0,
    keyValues: 0,
    tables: 0,
  }
  for (const page of pages) {
    for (const block of page.blocks) {
      stats.blocks++
      if (block.type === 'heading') stats.headings++
      else if (block.type === 'paragraph') stats.paragraphs++
      else if (block.type === 'list-item') stats.listItems++
      else if (block.type === 'key-value') stats.keyValues++
      else if (block.type === 'table') stats.tables++
    }
  }

  return {
    converter: { name: CONVERTER_NAME, version: CONVERTER_VERSION },
    source: {
      fileName: file.name,
      kind,
      mimeType: file.type || (kind === 'pdf' ? 'application/pdf' : 'image/*'),
      sizeBytes: file.size,
      lastModified: new Date(file.lastModified).toISOString(),
    },
    convertedAt: new Date().toISOString(),
    document: {
      pageCount: pages.length,
      ...(metadata && Object.keys(metadata).length ? { metadata } : {}),
      pages,
      fullText,
    },
    stats,
  }
}
