import type { FileState, TreeNode } from '../types'
import { convertImage } from './imageConverter'
import { convertPdf } from './pdfConverter'

export type StatePatch = (id: string, patch: Partial<FileState>) => void

/** PDFs parse quickly; OCR is heavy and serialized behind one worker anyway. */
const CONCURRENCY = 2

export async function runConversions(
  nodes: TreeNode[],
  patch: StatePatch,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const queue = nodes.filter((n) => n.kind === 'file' && (n.fileKind === 'pdf' || n.fileKind === 'image'))

  const next = async (): Promise<void> => {
    if (isCancelled()) return
    const node = queue.shift()
    if (!node || !node.file) return
    patch(node.id, { status: 'processing', progress: 0, progressLabel: 'starting' })
    try {
      const convert = node.fileKind === 'pdf' ? convertPdf : convertImage
      const result = await convert(node.file, (progress, progressLabel) =>
        patch(node.id, { progress, progressLabel }),
      )
      patch(node.id, { status: 'done', progress: 1, progressLabel: undefined, result })
    } catch (err) {
      patch(node.id, {
        status: 'error',
        progressLabel: undefined,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return next()
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => next()))
}
