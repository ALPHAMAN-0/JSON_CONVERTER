import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { ConversionResult, Line, PageResult, Segment } from '../types'
import { ocrCanvas, type ProgressFn } from './ocr'
import { buildResult } from './resultBuilder'
import { structureLines } from './structurer'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Pages whose text layer has fewer characters than this get the OCR fallback. */
const SCANNED_PAGE_CHAR_THRESHOLD = 12
const OCR_RENDER_MAX_DIM = 3400

export async function convertPdf(file: File, onProgress: ProgressFn): Promise<ConversionResult> {
  onProgress(0, 'opening PDF')
  const data = new Uint8Array(await file.arrayBuffer())
  let doc: PDFDocumentProxy
  try {
    doc = await pdfjs.getDocument({ data }).promise
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'PasswordException') throw new Error('This PDF is password-protected.')
    if (name === 'InvalidPDFException') throw new Error('Not a valid PDF file.')
    throw new Error(`Could not open PDF: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    const metadata = await readMetadata(doc)
    const pages: PageResult[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress((i - 1) / doc.numPages, `page ${i}/${doc.numPages}`)
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 1 })

      let lines = await extractTextLines(page, viewport)
      let method: PageResult['extractionMethod'] = 'text-layer'

      const charCount = lines.reduce((n, l) => n + l.text.trim().length, 0)
      if (charCount < SCANNED_PAGE_CHAR_THRESHOLD) {
        let ocrLines: Line[] | null = null
        try {
          ocrLines = await ocrPage(page, (frac, label) =>
            onProgress((i - 1 + frac) / doc.numPages, `OCR ${label} · page ${i}/${doc.numPages}`),
          )
        } catch (err) {
          throw new Error(
            `Page ${i} looks scanned and OCR failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        if (ocrLines) {
          lines = ocrLines
          method = 'ocr'
        }
      }

      pages.push({
        pageNumber: i,
        width: round2(viewport.width),
        height: round2(viewport.height),
        extractionMethod: method,
        blocks: structureLines(lines),
      })
    }
    onProgress(1, 'finalizing')
    return buildResult(file, 'pdf', pages, metadata)
  } finally {
    void doc.destroy()
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

const METADATA_FIELDS = [
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
  'PDFFormatVersion',
] as const

async function readMetadata(doc: PDFDocumentProxy): Promise<Record<string, string> | undefined> {
  try {
    const { info } = await doc.getMetadata()
    const record = info as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const field of METADATA_FIELDS) {
      const value = record?.[field]
      if (typeof value === 'string' && value.trim()) out[field] = value.trim()
    }
    return Object.keys(out).length ? out : undefined
  } catch {
    return undefined
  }
}

async function extractTextLines(page: PDFPageProxy, viewport: PageViewport): Promise<Line[]> {
  const content = await page.getTextContent()
  const styles = (content.styles ?? {}) as Record<string, { fontFamily?: string }>

  interface Positioned {
    text: string
    x: number
    y: number
    width: number
    height: number
    fontSize: number
    bold: boolean
  }

  const items: Positioned[] = []
  for (const it of content.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const t = it.transform
    // Map through the viewport so rotated pages and offset media boxes land in
    // the same top-left coordinate space as the reported page width/height.
    const m = pdfjs.Util.transform(viewport.transform, t)
    const fontSize = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]) || 10
    // The advance runs along the text direction in user space; map its endpoint
    // to viewport space to get the horizontal extent on rotated pages too.
    const dirLen = Math.hypot(t[0], t[1]) || 1
    const advance = it.width || it.str.length * fontSize * 0.5
    const ex = t[4] + (advance * t[0]) / dirLen
    const ey = t[5] + (advance * t[1]) / dirLen
    const v = viewport.transform
    const end = [v[0] * ex + v[2] * ey + v[4], v[1] * ex + v[3] * ey + v[5]]
    const family = (styles[it.fontName]?.fontFamily ?? '').toLowerCase()
    items.push({
      text: it.str,
      x: Math.min(m[4], end[0]),
      y: m[5],
      width: Math.abs(end[0] - m[4]) || it.str.length * fontSize * 0.5,
      height: fontSize,
      fontSize,
      bold: family.includes('bold') || family.includes('black') || family.includes('heavy'),
    })
  }

  items.sort((a, b) => a.y - b.y || a.x - b.x)

  // Group items whose baselines sit within half a font size of each other.
  const rawLines: Positioned[][] = []
  for (const item of items) {
    const line = rawLines[rawLines.length - 1]
    if (line && Math.abs(item.y - line[0].y) <= Math.max(line[0].fontSize, item.fontSize) * 0.45) {
      line.push(item)
    } else {
      rawLines.push([item])
    }
  }

  return rawLines.map((lineItems) => {
    lineItems.sort((a, b) => a.x - b.x)
    const segments: Segment[] = []
    let segText = ''
    let segX = lineItems[0].x
    let segEnd = lineItems[0].x
    for (const item of lineItems) {
      const gap = item.x - segEnd
      const ref = item.fontSize || 10
      if (segText && gap > ref * 1.5) {
        segments.push({ text: segText.trim(), x: round2(segX), width: round2(segEnd - segX) })
        segText = item.text
        segX = item.x
      } else {
        if (segText && gap > ref * 0.12 && !segText.endsWith(' ') && !item.text.startsWith(' ')) {
          segText += ' '
        }
        segText += item.text
      }
      segEnd = Math.max(segEnd, item.x + item.width)
    }
    if (segText.trim()) segments.push({ text: segText.trim(), x: round2(segX), width: round2(segEnd - segX) })

    // Dominant style comes from the longest run in the line.
    const longest = lineItems.reduce((a, b) => (b.text.length > a.text.length ? b : a))
    const boldChars = lineItems.reduce((n, i) => n + (i.bold ? i.text.length : 0), 0)
    const totalChars = lineItems.reduce((n, i) => n + i.text.length, 0)
    const fontSize = longest.fontSize
    const top = Math.min(...lineItems.map((i) => i.y)) - fontSize

    return {
      text: segments.map((s) => s.text).join(' '),
      x: round2(lineItems[0].x),
      y: round2(top),
      width: round2(segEnd - lineItems[0].x),
      height: round2(Math.max(...lineItems.map((i) => i.height))),
      fontSize,
      bold: totalChars > 0 && boldChars / totalChars > 0.6,
      segments,
    }
  })
}

/**
 * Render a (likely scanned) page to canvas and OCR it. Coordinates come back
 * in PDF units. Errors propagate so the file is marked failed, not silently empty.
 */
async function ocrPage(page: PDFPageProxy, onProgress: ProgressFn): Promise<Line[] | null> {
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(2.5, OCR_RENDER_MAX_DIM / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise

  const { lines } = await ocrCanvas(canvas, onProgress)
  return lines.map((l) => ({
    ...l,
    x: round2(l.x / scale),
    y: round2(l.y / scale),
    width: round2(l.width / scale),
    height: round2(l.height / scale),
    fontSize: l.fontSize / scale,
    segments: l.segments.map((s) => ({ ...s, x: round2(s.x / scale), width: round2(s.width / scale) })),
  }))
}
