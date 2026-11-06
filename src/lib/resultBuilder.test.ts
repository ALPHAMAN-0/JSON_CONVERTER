import { describe, expect, it } from 'vitest'
import type { Block, PageResult } from '../types'
import { buildResult, CONVERTER_NAME, CONVERTER_VERSION } from './resultBuilder'

const bbox = { x: 0, y: 0, width: 10, height: 10 }

const page = (pageNumber: number, blocks: Block[]): PageResult => ({
  pageNumber,
  width: 612,
  height: 792,
  extractionMethod: 'text-layer',
  blocks,
})

describe('buildResult', () => {
  const blocks: Block[] = [
    { id: 'b1', type: 'heading', level: 1, text: 'Invoice Summary', bbox },
    { id: 'b2', type: 'paragraph', text: 'Thanks for your order.', bbox },
    { id: 'b3', type: 'list-item', marker: '•', text: 'first entry', bbox },
    { id: 'b4', type: 'key-value', key: 'Total', value: '42.50', text: 'Total: 42.50', bbox },
    { id: 'b5', type: 'table', columnCount: 2, rows: [['Item', 'Qty'], ['Bolt', '12']], text: 'Item | Qty\nBolt | 12', bbox },
  ]

  it('counts blocks per type across pages', () => {
    const result = buildResult(new File(['x'], 'a.pdf'), 'pdf', [page(1, blocks.slice(0, 3)), page(2, blocks.slice(3))])
    expect(result.document.pageCount).toBe(2)
    expect(result.stats).toMatchObject({
      blocks: 5,
      headings: 1,
      paragraphs: 1,
      listItems: 1,
      keyValues: 1,
      tables: 1,
    })
  })

  it('joins block text into fullText and counts only real words', () => {
    const result = buildResult(new File(['x'], 'a.pdf'), 'pdf', [page(1, blocks)])
    expect(result.document.fullText).toBe(
      ['Invoice Summary', 'Thanks for your order.', 'first entry', 'Total: 42.50', 'Item | Qty\nBolt | 12'].join('\n\n'),
    )
    // 2 + 4 + 2 + 2 + 4 — the "|" table separators are not words.
    expect(result.stats.words).toBe(14)
    expect(result.stats.characters).toBe(result.document.fullText.length)
  })

  it('describes the source file and falls back to a MIME type per kind', () => {
    const pdf = buildResult(new File(['12345'], 'scan.pdf', { lastModified: 0 }), 'pdf', [])
    expect(pdf.converter).toEqual({ name: CONVERTER_NAME, version: CONVERTER_VERSION })
    expect(pdf.source).toEqual({
      fileName: 'scan.pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 5,
      lastModified: '1970-01-01T00:00:00.000Z',
    })
    expect(buildResult(new File(['x'], 'photo.heic'), 'image', []).source.mimeType).toBe('image/*')
    expect(buildResult(new File(['x'], 'photo.png', { type: 'image/png' }), 'image', []).source.mimeType).toBe('image/png')
  })

  it('includes metadata only when there is some', () => {
    const file = new File(['x'], 'a.pdf')
    expect(buildResult(file, 'pdf', []).document).not.toHaveProperty('metadata')
    expect(buildResult(file, 'pdf', [], {}).document).not.toHaveProperty('metadata')
    expect(buildResult(file, 'pdf', [], { Title: 'Report' }).document.metadata).toEqual({ Title: 'Report' })
  })

  it('handles a document with no blocks', () => {
    const result = buildResult(new File(['x'], 'blank.pdf'), 'pdf', [page(1, [])])
    expect(result.document.fullText).toBe('')
    expect(result.stats).toMatchObject({ blocks: 0, words: 0, characters: 0 })
  })
})
