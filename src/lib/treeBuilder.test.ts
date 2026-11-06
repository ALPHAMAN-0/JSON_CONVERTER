import { describe, expect, it } from 'vitest'
import { buildTree, classifyFile, collectFileNodes, filesFromFileList, type FileWithPath } from './treeBuilder'

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

  it('uses only the last extension and ignores a leading dot', () => {
    expect(classifyFile('archive.tar.PDF')).toBe('pdf')
    expect(classifyFile('photo.png.txt')).toBe('unsupported')
    expect(classifyFile('.pdf')).toBe('unsupported')
  })
})

describe('filesFromFileList', () => {
  const picked = (name: string, relativePath?: string): File => {
    const file = fakeFile(name)
    // Browsers set this on folder picks; Node's File has no such field.
    if (relativePath) Object.defineProperty(file, 'webkitRelativePath', { value: relativePath })
    return file
  }
  const asFileList = (files: File[]): FileList => files as unknown as FileList

  it('uses the folder-relative path when the browser provides one', () => {
    const out = filesFromFileList(asFileList([picked('a.pdf', 'scans/2026/a.pdf'), picked('b.png')]))
    expect(out.map((f) => f.path)).toEqual(['scans/2026/a.pdf', 'b.png'])
  })

  it('drops OS junk, dotfiles and anything inside a hidden folder', () => {
    const out = filesFromFileList(
      asFileList([
        picked('keep.pdf', 'docs/keep.pdf'),
        picked('.DS_Store', 'docs/.DS_Store'),
        picked('Thumbs.db', 'docs/Thumbs.db'),
        picked('desktop.ini', 'docs/desktop.ini'),
        picked('.env', 'docs/.env'),
        picked('config', 'docs/.git/config'),
      ]),
    )
    expect(out.map((f) => f.path)).toEqual(['docs/keep.pdf'])
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
