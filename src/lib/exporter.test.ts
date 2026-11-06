import { describe, expect, it } from 'vitest'
import type { FileState, TreeNode } from '../types'
import { buildCombinedExport } from './exporter'
import { buildResult } from './resultBuilder'
import { buildTree, collectFileNodes, type FileWithPath } from './treeBuilder'

const fakeFile = (name: string): File => new File(['x'], name)

const entries: FileWithPath[] = [
  { file: fakeFile('a.pdf'), path: 'docs/a.pdf' },
  { file: fakeFile('b.png'), path: 'docs/b.png' },
  { file: fakeFile('notes.txt'), path: 'docs/notes.txt' },
  { file: fakeFile('loose.pdf'), path: 'loose.pdf' },
  { file: fakeFile('later.pdf'), path: 'later.pdf' },
]

function setup(): { roots: TreeNode[]; byPath: Record<string, TreeNode> } {
  const roots = buildTree(entries, 1)
  const byPath: Record<string, TreeNode> = {}
  for (const node of collectFileNodes(roots)) byPath[node.path] = node
  return { roots, byPath }
}

describe('buildCombinedExport', () => {
  it('counts files by status', () => {
    const { roots, byPath } = setup()
    const states: Record<string, FileState> = {
      [byPath['docs/a.pdf'].id]: { status: 'done', result: buildResult(fakeFile('a.pdf'), 'pdf', []) },
      [byPath['docs/b.png'].id]: { status: 'error', error: 'Unsupported or corrupted image file.' },
      [byPath['docs/notes.txt'].id]: { status: 'skipped' },
      [byPath['loose.pdf'].id]: { status: 'processing', progress: 0.5 },
      [byPath['later.pdf'].id]: { status: 'queued' },
    }
    const out = buildCombinedExport(roots, states)
    expect(out.type).toBe('workspace')
    expect(out.converter.name).toBe('json-converter')
    expect(out.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(out.stats).toEqual({ files: 5, converted: 1, failed: 1, skipped: 1, pending: 2 })
  })

  it('mirrors the folder tree and attaches results and errors to their files', () => {
    const { roots, byPath } = setup()
    const result = buildResult(fakeFile('a.pdf'), 'pdf', [])
    const out = buildCombinedExport(roots, {
      [byPath['docs/a.pdf'].id]: { status: 'done', result },
      [byPath['docs/b.png'].id]: { status: 'error', error: 'boom' },
    })

    expect(out.tree.map((n) => `${n.kind}:${n.path}`)).toEqual(['folder:docs', 'file:later.pdf', 'file:loose.pdf'])
    const docs = out.tree[0]
    if (docs.kind !== 'folder') throw new Error('expected a folder first')
    expect(docs.children.map((n) => n.name)).toEqual(['a.pdf', 'b.png', 'notes.txt'])

    const [a, b, notes] = docs.children
    expect(a).toMatchObject({ kind: 'file', status: 'done', conversion: result })
    expect(a).not.toHaveProperty('error')
    expect(b).toMatchObject({ kind: 'file', status: 'error', error: 'boom' })
    expect(b).not.toHaveProperty('conversion')
    expect(notes).toMatchObject({ kind: 'file', status: 'skipped' })
  })

  it('treats files without a state entry as skipped', () => {
    const { roots } = setup()
    const out = buildCombinedExport(roots, {})
    expect(out.stats).toEqual({ files: 5, converted: 0, failed: 0, skipped: 5, pending: 0 })
  })

  it('exports an empty workspace', () => {
    const out = buildCombinedExport([], {})
    expect(out.tree).toEqual([])
    expect(out.stats).toEqual({ files: 0, converted: 0, failed: 0, skipped: 0, pending: 0 })
  })
})
