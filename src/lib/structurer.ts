import type { BBox, Block, Line } from '../types'

const round2 = (n: number): number => Math.round(n * 100) / 100

const LIST_MARKER = /^([•◦▪‣∙·●○*]|[-–—]|\d{1,3}[.)]|[a-z][.)]|[ivxIVX]{1,4}[.)])\s+(\S.*)$/
const KEY_VALUE = /^([^:：]{1,60}?)\s*[:：]([ \t]*)(\S.*)$/

/**
 * Turns positioned lines (from the PDF text layer or OCR) into classified
 * content blocks: headings, paragraphs, list items, key-value pairs, tables.
 */
export function structureLines(input: Line[]): Block[] {
  const lines = input
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text.length > 0)
    .sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.height, b.height) * 0.5 ? a.y - b.y : a.x - b.x))
  if (lines.length === 0) return []

  const bodySize = dominantFontSize(lines)
  const headingLevels = rankHeadingSizes(lines, bodySize)
  const groups = groupIntoBlocks(lines, bodySize)

  const blocks: Block[] = []
  for (const group of groups) {
    for (const block of emitBlocks(group, bodySize, headingLevels)) {
      blocks.push({ ...block, id: `b${blocks.length + 1}` })
    }
  }
  return blocks
}

/** Most common font size, weighted by how much text uses it. */
function dominantFontSize(lines: Line[]): number {
  const weights = new Map<number, number>()
  for (const l of lines) {
    const key = roundSize(l.fontSize)
    weights.set(key, (weights.get(key) ?? 0) + l.text.length)
  }
  let best = lines[0].fontSize
  let bestWeight = -1
  for (const [size, weight] of weights) {
    if (weight > bestWeight) {
      best = size
      bestWeight = weight
    }
  }
  return best
}

const roundSize = (s: number): number => Math.round(s * 2) / 2

const isHeadingSize = (size: number, bodySize: number): boolean => size >= bodySize * 1.15

/** Distinct heading sizes, largest first → heading level 1..6. */
function rankHeadingSizes(lines: Line[], bodySize: number): Map<number, number> {
  const sizes = [...new Set(lines.filter((l) => isHeadingSize(l.fontSize, bodySize)).map((l) => roundSize(l.fontSize)))]
  sizes.sort((a, b) => b - a)
  const levels = new Map<number, number>()
  sizes.forEach((size, i) => levels.set(size, Math.min(i + 1, 6)))
  return levels
}

/** Group consecutive lines into visual blocks using vertical gaps and style changes. */
function groupIntoBlocks(lines: Line[], bodySize: number): Line[][] {
  const groups: Line[][] = []
  let current: Line[] = []
  for (const line of lines) {
    const prev = current[current.length - 1]
    if (!prev) {
      current.push(line)
      continue
    }
    const gap = line.y - prev.y
    const ref = Math.max(prev.fontSize, line.fontSize, 1)
    const styleBreak = isHeadingSize(prev.fontSize, bodySize) !== isHeadingSize(line.fontSize, bodySize)
    const columnJump = gap < -ref * 0.4
    const listStart = LIST_MARKER.test(line.text)
    if (gap > ref * 1.9 || columnJump || styleBreak || listStart) {
      groups.push(current)
      current = [line]
    } else {
      current.push(line)
    }
  }
  if (current.length) groups.push(current)
  return groups
}

// Omit must distribute over the discriminated union to keep variant fields.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type DraftBlock = DistributiveOmit<Block, 'id'>

function emitBlocks(group: Line[], bodySize: number, headingLevels: Map<number, number>): DraftBlock[] {
  const bbox = unionBBox(group)
  const confidence = averageConfidence(group)

  const table = detectTable(group)
  if (table) {
    return [
      {
        type: 'table',
        text: table.rows.map((r) => r.join(' | ')).join('\n'),
        bbox,
        columnCount: table.columnCount,
        rows: table.rows,
        ...(confidence !== undefined ? { confidence } : {}),
      },
    ]
  }

  // A run of lines that all look like "Key: value" → one key-value block per line.
  const kvMatches = group.map((l) => matchKeyValue(l.text))
  if (kvMatches.every((m) => m !== null)) {
    return group.map((l, i) => {
      const [key, value] = kvMatches[i] as [string, string]
      return {
        type: 'key-value' as const,
        text: l.text,
        bbox: lineBBox(l),
        key,
        value,
        ...(l.confidence !== undefined ? { confidence: round2(l.confidence) } : {}),
      }
    })
  }

  const text = joinLines(group)
  const size = weightedSize(group)
  const bold = group.every((l) => l.bold)

  if ((isHeadingSize(size, bodySize) || (bold && group.length <= 2 && text.length <= 80)) && text.length <= 120) {
    const level = headingLevels.get(roundSize(size)) ?? Math.min(headingLevels.size + 1, 6)
    return [
      {
        type: 'heading',
        text,
        bbox,
        level: Math.max(level, 1),
        ...(confidence !== undefined ? { confidence } : {}),
      },
    ]
  }

  const listMatch = LIST_MARKER.exec(text)
  if (listMatch) {
    return [
      {
        type: 'list-item',
        text: listMatch[2],
        bbox,
        marker: listMatch[1],
        ...(confidence !== undefined ? { confidence } : {}),
      },
    ]
  }

  return [{ type: 'paragraph', text, bbox, ...(confidence !== undefined ? { confidence } : {}) }]
}

function matchKeyValue(text: string): [string, string] | null {
  const m = KEY_VALUE.exec(text)
  if (!m) return null
  const key = m[1].trim()
  const spaceAfterColon = m[2].length > 0
  const value = m[3].trim()
  // Reject URLs ("http://…") and prose sentences masquerading as keys.
  if (value.startsWith('/')) return null
  // Reject clock times like "10:30" where the colon sits between digits.
  if (!spaceAfterColon && /\d$/.test(key) && /^\d/.test(value)) return null
  if (key.split(/\s+/).length > 8) return null
  return [key, value]
}

/** Join wrapped lines into one string, repairing hyphenated line breaks. */
function joinLines(group: Line[]): string {
  let out = ''
  for (const l of group) {
    if (!out) {
      out = l.text
    } else if (/[A-Za-z]-$/.test(out)) {
      out = out.slice(0, -1) + l.text
    } else {
      out += ' ' + l.text
    }
  }
  return out
}

function weightedSize(group: Line[]): number {
  let total = 0
  let weight = 0
  for (const l of group) {
    total += l.fontSize * l.text.length
    weight += l.text.length
  }
  return weight ? total / weight : group[0].fontSize
}

function averageConfidence(group: Line[]): number | undefined {
  const confs = group.map((l) => l.confidence).filter((c): c is number => c !== undefined)
  if (!confs.length) return undefined
  return round2(confs.reduce((a, b) => a + b, 0) / confs.length)
}

function lineBBox(l: Line): BBox {
  return { x: round2(l.x), y: round2(l.y), width: round2(l.width), height: round2(l.height) }
}

function unionBBox(group: Line[]): BBox {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const l of group) {
    x0 = Math.min(x0, l.x)
    y0 = Math.min(y0, l.y)
    x1 = Math.max(x1, l.x + l.width)
    y1 = Math.max(y1, l.y + l.height)
  }
  return { x: round2(x0), y: round2(y0), width: round2(x1 - x0), height: round2(y1 - y0) }
}

// ---------------------------------------------------------------------------
// Table detection: consecutive lines whose segments align into ≥2 x-clusters
// ---------------------------------------------------------------------------

interface TableShape {
  rows: string[][]
  columnCount: number
}

function detectTable(group: Line[]): TableShape | null {
  if (group.length < 2) return null
  const multi = group.filter((l) => l.segments.length >= 2)
  if (multi.length < Math.max(2, Math.ceil(group.length * 0.6))) return null

  const tolerance = median(group.map((l) => l.fontSize)) * 1.2
  const starts = group
    .flatMap((l) => l.segments.map((s) => s.x))
    .sort((a, b) => a - b)

  // 1-D clustering of segment start positions.
  const clusters: { center: number; count: number }[] = []
  for (const x of starts) {
    const last = clusters[clusters.length - 1]
    if (last && x - last.center <= tolerance) {
      last.center = (last.center * last.count + x) / (last.count + 1)
      last.count++
    } else {
      clusters.push({ center: x, count: 1 })
    }
  }
  if (clusters.length < 2 || clusters.length > 12) return null

  const rows: string[][] = []
  for (const line of group) {
    const cells: string[] = Array.from({ length: clusters.length }, () => '')
    for (const seg of line.segments) {
      let best = 0
      let bestDist = Infinity
      clusters.forEach((c, i) => {
        const d = Math.abs(seg.x - c.center)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      cells[best] = cells[best] ? `${cells[best]} ${seg.text}` : seg.text
    }
    rows.push(cells)
  }
  return { rows, columnCount: clusters.length }
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
