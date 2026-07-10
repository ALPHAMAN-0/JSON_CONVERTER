// ---------------------------------------------------------------------------
// Structured-output schema
// ---------------------------------------------------------------------------

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export type BlockType = 'heading' | 'paragraph' | 'list-item' | 'key-value' | 'table'

interface BaseBlock {
  id: string
  type: BlockType
  text: string
  bbox: BBox
  /** OCR confidence 0–100 (only present for OCR-extracted content) */
  confidence?: number
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading'
  level: number
}

export interface ParagraphBlock extends BaseBlock {
  type: 'paragraph'
}

export interface ListItemBlock extends BaseBlock {
  type: 'list-item'
  marker: string
}

export interface KeyValueBlock extends BaseBlock {
  type: 'key-value'
  key: string
  value: string
}

export interface TableBlock extends BaseBlock {
  type: 'table'
  columnCount: number
  rows: string[][]
}

export type Block = HeadingBlock | ParagraphBlock | ListItemBlock | KeyValueBlock | TableBlock

export interface PageResult {
  pageNumber: number
  width: number
  height: number
  extractionMethod: 'text-layer' | 'ocr'
  blocks: Block[]
}

export interface ConversionStats {
  blocks: number
  words: number
  characters: number
  headings: number
  paragraphs: number
  listItems: number
  keyValues: number
  tables: number
}

export interface ConversionResult {
  converter: { name: string; version: string }
  source: {
    fileName: string
    kind: 'pdf' | 'image'
    mimeType: string
    sizeBytes: number
    lastModified: string
  }
  convertedAt: string
  document: {
    pageCount: number
    metadata?: Record<string, string>
    pages: PageResult[]
    fullText: string
  }
  stats: ConversionStats
}

// ---------------------------------------------------------------------------
// Intermediate extraction shapes (shared by the PDF text layer and OCR paths)
// ---------------------------------------------------------------------------

/** A horizontal run of text within a line, split on wide gaps (column candidates). */
export interface Segment {
  text: string
  x: number
  width: number
}

export interface Line {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  bold: boolean
  segments: Segment[]
  /** OCR confidence 0–100 */
  confidence?: number
}

// ---------------------------------------------------------------------------
// Workspace tree
// ---------------------------------------------------------------------------

export type FileKind = 'pdf' | 'image' | 'unsupported'

export type NodeStatus = 'queued' | 'processing' | 'done' | 'error' | 'skipped'

export interface TreeNode {
  id: string
  name: string
  /** Path relative to the upload root, e.g. "invoices/2026/jan.pdf" */
  path: string
  kind: 'folder' | 'file'
  children?: TreeNode[]
  fileKind?: FileKind
  file?: File
}

export interface FileState {
  status: NodeStatus
  progress?: number
  progressLabel?: string
  error?: string
  result?: ConversionResult
}
