import { describe, expect, it } from 'vitest'
import { buildTree, classifyFile, collectFileNodes, type FileWithPath } from './treeBuilder'

const fakeFile = (name: string): File => new File(['x'], name)

describe('classifyFile', () => {
  it('classifies by extension', () => {
    expect(classifyFile('doc.pdf')).toBe('pdf')
    expect(classifyFile('scan.PNG')).toBe('image')
    expect(classifyFile('photo.jpeg')).toBe('image')
    expect(classifyFile('notes.txt')).toBe('unsupported')
  })

  it('treats extensionless names as unsupported, even when named like an extension', () => {
    expect(classifyFile('pdf')).toBe('unsupported')
    expect(classifyFile('png')).toBe('unsupported')
    expect(classifyFile('README')).toBe('unsupported')
  })
})

describe('buildTree', () => {
  const entries: FileWithPath[] = [
    { file: fakeFile('b.pdf'), path: 'docs/b.pdf' },
    { file: fakeFile('a.png'), path: 'docs/scans/a.png' },
    { file: fakeFile('loose.pdf'), path: 'loose.pdf' },
  ]

  it('nests folders and sorts folders before files', () => {
    const roots = buildTree(entries, 1)
    expect(roots.map((r) => r.name)).toEqual(['docs', 'loose.pdf'])
    const docs = roots[0]
    expect(docs.children?.map((c) => c.name)).toEqual(['scans', 'b.pdf'])
  })

  it('collects every file node depth-first', () => {
    const roots = buildTree(entries, 1)
    expect(collectFileNodes(roots).map((n) => n.path).sort()).toEqual([
      'docs/b.pdf',
      'docs/scans/a.png',
      'loose.pdf',
    ])
  })

  it('gives duplicate paths in one batch distinct ids', () => {
    const roots = buildTree(
      [
        { file: fakeFile('scan.pdf'), path: 'scan.pdf' },
        { file: fakeFile('scan.pdf'), path: 'scan.pdf' },
      ],
      1,
    )
    const ids = collectFileNodes(roots).map((n) => n.id)
    expect(new Set(ids).size).toBe(2)
  })
})
