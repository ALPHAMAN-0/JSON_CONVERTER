import type { ConversionResult, PageResult } from '../types'
import { ocrCanvas, type ProgressFn } from './ocr'
import { buildResult } from './resultBuilder'
import { structureLines } from './structurer'

const MAX_DIM = 3800
const UPSCALE_TARGET = 1600
const UPSCALE_BELOW = 900

export async function convertImage(file: File, onProgress: ProgressFn): Promise<ConversionResult> {
  onProgress(0, 'decoding image')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Unsupported or corrupted image file.')
  }

  try {
    const maxDim = Math.max(bitmap.width, bitmap.height)
    let scale = 1
    if (maxDim > MAX_DIM) scale = MAX_DIM / maxDim
    else if (maxDim < UPSCALE_BELOW) scale = Math.min(3, UPSCALE_TARGET / maxDim)

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable in this browser.')
    // Flatten transparency onto white so OCR sees dark-on-light text.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const { lines } = await ocrCanvas(canvas, onProgress)
    const scaled = scale === 1
      ? lines
      : lines.map((l) => ({
          ...l,
          x: l.x / scale,
          y: l.y / scale,
          width: l.width / scale,
          height: l.height / scale,
          fontSize: l.fontSize / scale,
          segments: l.segments.map((s) => ({ ...s, x: s.x / scale, width: s.width / scale })),
        }))

    const page: PageResult = {
      pageNumber: 1,
      width: bitmap.width,
      height: bitmap.height,
      extractionMethod: 'ocr',
      blocks: structureLines(scaled),
    }
    onProgress(1, 'finalizing')
    return buildResult(file, 'image', [page])
  } finally {
    bitmap.close()
  }
}
