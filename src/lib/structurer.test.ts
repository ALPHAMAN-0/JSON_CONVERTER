import { describe, expect, it } from 'vitest'
import type { Line } from '../types'
import { structureLines } from './structurer'

function line(text: string, y: number, opts: Partial<Line> = {}): Line {
  const fontSize = opts.fontSize ?? 10
  const x = opts.x ?? 50
  const width = opts.width ?? text.length * fontSize * 0.5
  return {
    text,
    x,
    y,
    width,
    height: opts.height ?? fontSize,
    fontSize,
    bold: opts.bold ?? false,
    segments: opts.segments ?? [{ text, x, width }],
    ...(opts.confidence !== undefined ? { confidence: opts.confidence } : {}),
  }
}

describe('structureLines', () => {
  it('returns no blocks for empty input', () => {
    expect(structureLines([])).toEqual([])
    expect(structureLines([line('   ', 10)])).toEqual([])
  })

  it('classifies larger text as a heading above body text', () => {
    const blocks = structureLines([
      line('Invoice Summary', 40, { fontSize: 22 }),
      line('This is the body of the document which carries most of the text.', 90),
      line('It keeps going with plenty of regular sized words to set the body font.', 105),
    ])
    expect(blocks[0].type).toBe('heading')
    expect(blocks[0].text).toBe('Invoice Summary')
    if (blocks[0].type === 'heading') expect(blocks[0].level).toBe(1)
    expect(blocks[1].type).toBe('paragraph')
  })

  it('joins wrapped paragraph lines and repairs hyphenation', () => {
    const blocks = structureLines([
      line('The quick brown fox jumps over the extra-', 100),
      line('ordinarily lazy dog near the river bank.', 114),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('The quick brown fox jumps over the extraordinarily lazy dog near the river bank.')
  })

  it('detects key-value pairs, one block per line', () => {
    const blocks = structureLines([
      line('Customer: John Doe', 100),
      line('Total: 42.50', 114),
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'key-value', key: 'Customer', value: 'John Doe' })
    expect(blocks[1]).toMatchObject({ type: 'key-value', key: 'Total', value: '42.50' })
  })

  it('does not treat URLs as key-value pairs', () => {
    const blocks = structureLines([line('https://example.com/page', 100)])
    expect(blocks[0].type).toBe('paragraph')
  })

  it('does not treat clock times as key-value pairs', () => {
    const blocks = structureLines([
      line('The meeting starts at 10:30 sharp in the main conference room downstairs.', 100),
    ])
    expect(blocks[0].type).toBe('paragraph')
  })

  it('detects list items and strips markers', () => {
    const blocks = structureLines([
      line('• first entry in the list', 100),
      line('• second entry in the list', 114),
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'list-item', text: 'first entry in the list', marker: '•' })
  })

  it('detects aligned columns as a table', () => {
    const mk = (a: string, b: string, c: string, y: number): Line =>
      line(`${a} ${b} ${c}`, y, {
        segments: [
          { text: a, x: 50, width: 60 },
          { text: b, x: 200, width: 60 },
          { text: c, x: 350, width: 60 },
        ],
      })
    const blocks = structureLines([
      mk('Item', 'Qty', 'Price', 100),
      mk('Bolt', '12', '4.20', 114),
      mk('Nut', '30', '1.10', 128),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('table')
    if (blocks[0].type === 'table') {
      expect(blocks[0].columnCount).toBe(3)
      expect(blocks[0].rows).toEqual([
        ['Item', 'Qty', 'Price'],
        ['Bolt', '12', '4.20'],
        ['Nut', '30', '1.10'],
      ])
    }
  })

  it('carries OCR confidence onto blocks', () => {
    const blocks = structureLines([
      line('Scanned paragraph text goes here.', 100, { confidence: 91.5 }),
    ])
    expect(blocks[0].confidence).toBeCloseTo(91.5)
  })

  it('splits blocks on large vertical gaps', () => {
    const blocks = structureLines([
      line('First paragraph line one.', 100),
      line('First paragraph line two.', 114),
      line('Second paragraph far below.', 220),
    ])
    expect(blocks).toHaveLength(2)
  })
})
