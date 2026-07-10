import { createWorker, type Worker } from 'tesseract.js'
import type { Line, Segment } from '../types'

export type ProgressFn = (fraction: number, label: string) => void

let workerPromise: Promise<Worker> | null = null
let currentProgress: ProgressFn | null = null
// Serialize OCR jobs through one shared worker so language data downloads once.
let chain: Promise<unknown> = Promise.resolve()

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('eng', 1, {
    logger: (m) => {
      if (!currentProgress) return
      if (m.status === 'recognizing text') currentProgress(m.progress ?? 0, 'reading text')
      else currentProgress(0, m.status.replace(/_/g, ' '))
    },
  }).catch((err: unknown) => {
    // Don't cache a failed worker — let the next OCR attempt retry.
    workerPromise = null
    throw err
  })
  return workerPromise
}

export interface OcrOutput {
  lines: Line[]
  width: number
  height: number
}

export function ocrCanvas(canvas: HTMLCanvasElement, onProgress?: ProgressFn): Promise<OcrOutput> {
  const job = chain.then(async () => {
    const worker = await getWorker()
    currentProgress = onProgress ?? null
    try {
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true })
      return {
        lines: blocksToLines(data.blocks ?? []),
        width: canvas.width,
        height: canvas.height,
      }
    } finally {
      currentProgress = null
    }
  })
  chain = job.catch(() => undefined)
  return job
}

interface TessBBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface TessWord {
  text: string
  bbox: TessBBox
}

interface TessLine {
  text: string
  bbox: TessBBox
  confidence: number
  words: TessWord[]
}

interface TessParagraph {
  lines: TessLine[]
}

interface TessBlock {
  paragraphs: TessParagraph[]
}

function blocksToLines(blocks: unknown[]): Line[] {
  const lines: Line[] = []
  for (const block of blocks as TessBlock[]) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const converted = convertLine(line)
        if (converted) lines.push(converted)
      }
    }
  }
  return lines
}

function convertLine(line: TessLine): Line | null {
  const text = (line.text ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const { x0, y0, x1, y1 } = line.bbox
  const height = Math.max(y1 - y0, 1)

  const words = (line.words ?? []).filter((w) => w.text.trim())
  const segments: Segment[] = []
  let segText = ''
  let segX = x0
  let segEnd = x0
  for (const word of words) {
    const gap = word.bbox.x0 - segEnd
    if (segText && gap > height * 1.2) {
      segments.push({ text: segText, x: segX, width: segEnd - segX })
      segText = word.text.trim()
      segX = word.bbox.x0
    } else {
      segText = segText ? `${segText} ${word.text.trim()}` : word.text.trim()
      if (!segText) segX = word.bbox.x0
    }
    segEnd = Math.max(segEnd, word.bbox.x1)
  }
  if (segText) segments.push({ text: segText, x: segX, width: segEnd - segX })
  if (!segments.length) segments.push({ text, x: x0, width: x1 - x0 })

  return {
    text: segments.map((s) => s.text).join(' '),
    x: x0,
    y: y0,
    width: x1 - x0,
    height,
    fontSize: height * 0.8,
    bold: false,
    segments,
    confidence: line.confidence,
  }
}
