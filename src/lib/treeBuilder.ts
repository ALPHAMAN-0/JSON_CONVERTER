import type { FileKind, TreeNode } from '../types'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif'])
const JUNK_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])

export function classifyFile(name: string): FileKind {
  // Only a dot after the first character counts as an extension separator,
  // so extensionless names like "pdf" stay unsupported.
  const idx = name.lastIndexOf('.')
  const ext = idx > 0 ? name.slice(idx + 1).toLowerCase() : ''
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_EXTS.has(ext)) return 'image'
  return 'unsupported'
}

export interface FileWithPath {
  file: File
  /** Relative path including the file name, e.g. "docs/scans/page1.png" */
  path: string
}

const isJunk = (name: string): boolean => JUNK_FILES.has(name.toLowerCase()) || name.startsWith('.')

/**
 * MUST be called synchronously inside the drop event handler —
 * DataTransferItem entries become unreadable once the handler yields.
 */
export function collectEntries(items: DataTransferItemList): FileSystemEntry[] {
  const entries: FileSystemEntry[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  return entries
}

export interface EntryScan {
  files: FileWithPath[]
  /** Paths that could not be read (permission/IO errors) — surfaced, not hidden. */
  errors: string[]
}

export async function filesFromEntries(entries: FileSystemEntry[]): Promise<EntryScan> {
  const scan: EntryScan = { files: [], errors: [] }
  for (const entry of entries) {
    await walkEntry(entry, '', scan)
  }
  return scan
}

async function walkEntry(entry: FileSystemEntry, prefix: string, scan: EntryScan): Promise<void> {
  if (entry.isFile) {
    if (isJunk(entry.name)) return
    try {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      )
      scan.files.push({ file, path: prefix + entry.name })
    } catch {
      scan.errors.push(prefix + entry.name)
    }
    return
  }
  if (entry.isDirectory) {
    if (isJunk(entry.name)) return
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns results in batches; loop until an empty batch.
    for (;;) {
      let batch: FileSystemEntry[]
      try {
        batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        )
      } catch {
        scan.errors.push(`${prefix}${entry.name}/`)
        break
      }
      if (!batch.length) break
      for (const child of batch) {
        await walkEntry(child, `${prefix}${entry.name}/`, scan)
      }
    }
  }
}

/** From an <input type="file" [webkitdirectory]> selection. */
export function filesFromFileList(files: FileList): FileWithPath[] {
  const out: FileWithPath[] = []
  for (const file of Array.from(files)) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = rel && rel.length > 0 ? rel : file.name
    // Filter every segment, matching the drag-and-drop walk.
    if (path.split('/').some(isJunk)) continue
    out.push({ file, path })
  }
  return out
}

/** Build a forest of tree nodes from path-tagged files. */
export function buildTree(entries: FileWithPath[], batchId: number): TreeNode[] {
  const roots: TreeNode[] = []
  const folders = new Map<string, TreeNode>()

  const ensureFolder = (path: string): TreeNode => {
    const existing = folders.get(path)
    if (existing) return existing
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const node: TreeNode = {
      id: `${batchId}:${path}/`,
      name,
      path,
      kind: 'folder',
      children: [],
    }
    folders.set(path, node)
    if (parts.length === 1) {
      roots.push(node)
    } else {
      ensureFolder(parts.slice(0, -1).join('/')).children!.push(node)
    }
    return node
  }

  entries.forEach(({ file, path }, index) => {
    const parts = path.split('/')
    const name = parts[parts.length - 1]
    const node: TreeNode = {
      // Index keeps ids unique even when two drops share a path (e.g. two
      // same-named files dragged from different source folders).
      id: `${batchId}:${index}:${path}`,
      name,
      path,
      kind: 'file',
      fileKind: classifyFile(name),
      file,
    }
    if (parts.length === 1) {
      roots.push(node)
    } else {
      ensureFolder(parts.slice(0, -1).join('/')).children!.push(node)
    }
  })

  sortForest(roots)
  return roots
}

function sortForest(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })
  for (const node of nodes) {
    if (node.children) sortForest(node.children)
  }
}

/** Depth-first list of every file node in the forest. */
export function collectFileNodes(roots: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (node: TreeNode): void => {
    if (node.kind === 'file') out.push(node)
    node.children?.forEach(walk)
  }
  roots.forEach(walk)
  return out
}
