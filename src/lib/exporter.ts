import type { ConversionResult, FileState, TreeNode } from '../types'
import { CONVERTER_NAME, CONVERTER_VERSION } from './resultBuilder'

interface CombinedFolder {
  /** Unique across batches — distinguishes same-path roots from separate drops. */
  id: string
  name: string
  kind: 'folder'
  path: string
  children: CombinedNode[]
}

interface CombinedFile {
  id: string
  name: string
  kind: 'file'
  path: string
  status: string
  conversion?: ConversionResult
  error?: string
}

type CombinedNode = CombinedFolder | CombinedFile

export interface CombinedExport {
  converter: { name: string; version: string }
  exportedAt: string
  type: 'workspace'
  stats: { files: number; converted: number; failed: number; skipped: number; pending: number }
  tree: CombinedNode[]
}

/** Mirror the upload tree into a single combined JSON document. */
export function buildCombinedExport(
  roots: TreeNode[],
  states: Record<string, FileState>,
): CombinedExport {
  const stats = { files: 0, converted: 0, failed: 0, skipped: 0, pending: 0 }

  const walk = (node: TreeNode): CombinedNode => {
    if (node.kind === 'folder') {
      return {
        id: node.id,
        name: node.name,
        kind: 'folder',
        path: node.path,
        children: (node.children ?? []).map(walk),
      }
    }
    const state = states[node.id]
    stats.files++
    const status = state?.status ?? 'skipped'
    if (status === 'done') stats.converted++
    else if (status === 'error') stats.failed++
    else if (status === 'skipped') stats.skipped++
    else stats.pending++
    return {
      id: node.id,
      name: node.name,
      kind: 'file',
      path: node.path,
      status,
      ...(state?.result ? { conversion: state.result } : {}),
      ...(state?.error ? { error: state.error } : {}),
    }
  }

  const tree = roots.map(walk)
  return {
    converter: { name: CONVERTER_NAME, version: CONVERTER_VERSION },
    exportedAt: new Date().toISOString(),
    type: 'workspace',
    stats,
    tree,
  }
}

export function downloadJson(baseName: string, value: unknown): void {
  const json = JSON.stringify(value, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = baseName.replace(/\.[^.]+$/, '') + '.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
